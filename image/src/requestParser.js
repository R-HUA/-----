import Busboy from 'busboy';
import { Blob } from 'node:buffer';
import { dataUrlToBuffer, saveInputFile } from './assets.js';

export async function parseProxyRequest(req, config, requestId) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    return parseMultipartRequest(req, config, requestId);
  }

  const rawBody = await readRawBody(req, config.maxJsonBodyBytes);
  let parsedJson = null;
  if (contentType.toLowerCase().includes('application/json') && rawBody.length) {
    parsedJson = JSON.parse(rawBody.toString('utf8'));
  }

  const inputs = [];
  await collectDataUrlInputs(parsedJson, config, requestId, inputs);

  return {
    upstreamBody: rawBody,
    upstreamHeaders: { 'content-type': contentType || 'application/json' },
    metadata: {
      contentType: contentType || 'application/json',
      prompt: extractPrompt(parsedJson),
      params: parsedJson,
      inputFiles: inputs,
    },
  };
}

function readRawBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseMultipartRequest(req, config, requestId) {
  const form = new globalThis.FormData();
  const fields = [];
  const inputFiles = [];
  const fileWrites = [];

  await new Promise((resolve, reject) => {
    let rejected = false;
    const fail = (error) => {
      if (rejected) {
        return;
      }
      rejected = true;
      reject(error);
    };
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: config.maxMultipartFileBytes,
        files: config.maxMultipartFiles,
        fields: config.maxMultipartFields,
      },
    });

    busboy.on('field', (name, value) => {
      fields.push({ name, value });
      form.append(name, value);
    });

    busboy.on('file', (name, file, info) => {
      const chunks = [];
      let fileLimited = false;
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('limit', () => {
        fileLimited = true;
        fail(Object.assign(new Error(`Multipart file too large: ${info.filename || name}`), { statusCode: 413 }));
      });
      file.on('error', fail);
      file.on('end', () => {
        if (fileLimited || rejected) {
          return;
        }
        const write = (async () => {
          const buffer = Buffer.concat(chunks);
          const contentType = info.mimeType || 'application/octet-stream';
          form.append(name, new Blob([buffer], { type: contentType }), info.filename || 'file');
          inputFiles.push(await saveInputFile({
            config,
            requestId,
            fieldName: name,
            filename: info.filename,
            contentType,
            buffer,
          }));
        })();
        fileWrites.push(write);
        write.catch(fail);
      });
    });

    busboy.on('finish', async () => {
      try {
        if (rejected) {
          return;
        }
        await Promise.all(fileWrites);
        resolve();
      } catch (error) {
        fail(error);
      }
    });
    busboy.on('filesLimit', () => {
      fail(Object.assign(new Error('Too many multipart files'), { statusCode: 413 }));
    });
    busboy.on('fieldsLimit', () => {
      fail(Object.assign(new Error('Too many multipart fields'), { statusCode: 413 }));
    });
    busboy.on('error', fail);
    req.pipe(busboy);
  });

  const prompt = fields.find((field) => field.name === 'prompt')?.value ?? null;
  const params = {};
  for (const field of fields) {
    if (params[field.name] === undefined) {
      params[field.name] = field.value;
    } else if (Array.isArray(params[field.name])) {
      params[field.name].push(field.value);
    } else {
      params[field.name] = [params[field.name], field.value];
    }
  }

  return {
    upstreamBody: form,
    upstreamHeaders: {},
    metadata: {
      contentType: 'multipart/form-data',
      prompt,
      params,
      inputFiles,
    },
  };
}

async function collectDataUrlInputs(value, config, requestId, inputs, pathParts = []) {
  if (typeof value === 'string') {
    const dataUrl = dataUrlToBuffer(value);
    if (dataUrl) {
      const fieldName = pathParts.join('.') || 'image';
      inputs.push(await saveInputFile({
        config,
        requestId,
        fieldName,
        filename: `${fieldName}.bin`,
        contentType: dataUrl.contentType,
        buffer: dataUrl.buffer,
      }));
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      await collectDataUrlInputs(value[index], config, requestId, inputs, [...pathParts, String(index)]);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      await collectDataUrlInputs(child, config, requestId, inputs, [...pathParts, key]);
    }
  }
}

function extractPrompt(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (typeof value.prompt === 'string') {
    return value.prompt;
  }

  return null;
}
