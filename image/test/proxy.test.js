import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let servers = [];

beforeEach(() => {
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map(({ server }) => closeServer(server)));
});

test('proxies JSON image generation, saves outputs and thumbnails, and returns upstream response when approval is disabled', async () => {
  const upstream = await createUpstreamServer(async (req, res) => {
    const body = await readBody(req);
    assert.equal(req.url, '/v1/images/generations?trace=1');
    assert.equal(req.headers.authorization, 'Bearer test-key');
    assert.equal(req.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(body.toString('utf8')), {
      model: 'gpt-image-1',
      prompt: 'draw a quiet control room',
      size: '1024x1024',
      custom_future_param: 'kept',
    });

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      created: 123,
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-test-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const response = await fetch(`${proxy.url}/v1/images/generations?trace=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: 'draw a quiet control room',
      size: '1024x1024',
      custom_future_param: 'kept',
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.created, 123);
  assert.ok(payload.data[0].b64_json);

  const history = await adminJson(proxy.url, '/admin/history');
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].status, 'completed');
  assert.equal(history.data[0].prompt, 'draw a quiet control room');
  assert.equal(history.data[0].generatedImages.length, 1);
  assert.equal(history.data[0].thumbnails.length, 1);

  await fs.access(history.data[0].generatedImages[0].path);
  await fs.access(history.data[0].thumbnails[0].path);
});

test('holds completed generation for approval and releases original response after admin approval', async () => {
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      created: 456,
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-review-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'true',
    IMAGE_PROXY_APPROVAL_HOLD_MS: '5000',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const pendingResponse = fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'needs approval' }),
  });

  await waitFor(async () => {
    const pending = await adminJson(proxy.url, '/admin/pending');
    return pending.data.length === 1 ? pending.data[0] : null;
  });

  const pending = await adminJson(proxy.url, '/admin/pending');
  assert.equal(pending.data[0].status, 'pending_review');
  assert.equal(pending.data[0].prompt, 'needs approval');

  const approval = await fetch(`${proxy.url}/admin/approvals/${pending.data[0].id}/approve`, {
    method: 'POST',
    headers: { authorization: 'Bearer admin' },
  });
  assert.equal(approval.status, 200);

  const response = await pendingResponse;
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.created, 456);

  const status = await fetch(`${proxy.url}/v1/images/requests/${pending.data[0].id}`);
  assert.equal(status.status, 200);
  const statusPayload = await status.json();
  assert.equal(statusPayload.status, 'approved');
  assert.equal(statusPayload.result.created, 456);
});

test('captures multipart reference and structure images in admin history', async () => {
  let sawMultipart = false;
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    sawMultipart = String(req.headers['content-type']).startsWith('multipart/form-data');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-multipart-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);
  const imageBuffer = Buffer.from(await sampleImageBytes());

  const form = new FormData();
  form.append('prompt', 'edit with reference');
  form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'reference.png');
  form.append('mask', new Blob([imageBuffer], { type: 'image/png' }), 'mask.png');

  const response = await fetch(`${proxy.url}/v1/images/edits`, {
    method: 'POST',
    body: form,
  });

  assert.equal(response.status, 200);
  assert.equal(sawMultipart, true);
  const history = await adminJson(proxy.url, '/admin/history');
  assert.equal(history.data[0].referenceImages.length, 1);
  assert.equal(history.data[0].structureImages.length, 1);
});

test('returns 202 after approval hold timeout and exposes pending request status', async () => {
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-timeout-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'true',
    IMAGE_PROXY_APPROVAL_HOLD_MS: '25',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const response = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'timeout pending' }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, 'pending_review');
  assert.ok(payload.status_url);

  const status = await fetch(`${proxy.url}${payload.status_url}`);
  assert.equal(status.status, 202);
  const statusPayload = await status.json();
  assert.equal(statusPayload.status, 'pending_review');
});

test('rejects held request when admin rejects before hold timeout', async () => {
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-reject-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'true',
    IMAGE_PROXY_APPROVAL_HOLD_MS: '5000',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const pendingResponse = fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'reject me' }),
  });

  const pending = await waitFor(async () => {
    const list = await adminJson(proxy.url, '/admin/pending');
    return list.data.length === 1 ? list.data[0] : null;
  });

  const rejection = await fetch(`${proxy.url}/admin/approvals/${pending.id}/reject`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer admin',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'policy test' }),
  });
  assert.equal(rejection.status, 200);

  const response = await pendingResponse;
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.status, 'rejected');
});

test('saves generated images from OpenAI image SSE completion events while preserving upstream stream body', async () => {
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    res.setHeader('content-type', 'text/event-stream');
    res.end([
      `event: image_generation.partial_image`,
      `data: ${JSON.stringify({ type: 'image_generation.partial_image', b64_json: await sampleImageBase64() })}`,
      '',
      `event: image_generation.completed`,
      `data: ${JSON.stringify({ type: 'image_generation.completed', b64_json: await sampleImageBase64(), output_format: 'png' })}`,
      '',
    ].join('\n'));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-sse-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const response = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'stream image', stream: true, partial_images: 1 }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  const body = await response.text();
  assert.match(body, /image_generation\.completed/);

  const history = await adminJson(proxy.url, '/admin/history');
  assert.equal(history.data[0].generatedImages.length, 1);
  await fs.access(history.data[0].generatedImages[0].path);
});

async function createUpstreamServer(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.end(error.stack);
    });
  });
  const listened = await listen(server);
  return listened;
}

function listen(appOrServer) {
  return new Promise((resolve) => {
    const server = typeof appOrServer.listen === 'function' && !appOrServer.address
      ? appOrServer.listen(0)
      : appOrServer;

    if (!server.listening) {
      server.listen(0);
    }

    server.on('listening', () => {
      const address = server.address();
      const listened = { server, url: `http://127.0.0.1:${address.port}` };
      servers.push(listened);
      resolve(listened);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function sampleImageBytes() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 20, g: 120, b: 200, alpha: 1 },
    },
  }).png().toBuffer();
}

async function sampleImageBase64() {
  return (await sampleImageBytes()).toString('base64');
}

async function adminJson(baseUrl, pathName) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: { authorization: 'Bearer admin' },
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitFor(callback, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await callback();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
