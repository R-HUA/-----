import Busboy from 'busboy';
import { Blob } from 'node:buffer';
import { dataUrlToBuffer, saveInputFile } from './assets.js';

const MAX_BODY_BYTES = 1024 * 1024 * 1024;

export async function parseProxyRequest(req, config, requestId) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    return parseMultipartRequest(req, config, requestId);
  }

  const rawBody = await readRawBody(req);
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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
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
    const busboy = Busboy({ headers: req.headers });

    busboy.on('field', (name, value) => {
      fields.push({ name, value });
      form.append(name, value);
    });

    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('error', reject);
      file.on('end', () => {
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
        write.catch(reject);
      });
    });

    busboy.on('finish', async () => {
      try {
        await Promise.all(fileWrites);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    busboy.on('error', reject);
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
