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
import { JsonStore } from '../src/store.js';

let servers = [];

beforeEach(() => {
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map(({ server }) => closeServer(server)));
});

test('JsonStore write queue recovers after a failed flush', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-store-'));
  const fileAsDirectory = path.join(tempDir, 'not-a-directory');
  await fs.writeFile(fileAsDirectory, 'x');
  const store = new JsonStore(path.join(fileAsDirectory, 'history.json'));

  store.records.set('failed-write', {
    id: 'failed-write',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await assert.rejects(() => store.flush());

  store.dataFile = path.join(tempDir, 'data', 'history.json');
  store.records.set('recovered-write', {
    id: 'recovered-write',
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  await store.flush();

  const payload = JSON.parse(await fs.readFile(store.dataFile, 'utf8'));
  assert.equal(payload.records.some((record) => record.id === 'recovered-write'), true);
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

  const summary = await adminJson(proxy.url, '/admin/summary');
  assert.equal(summary.records, 1);
  assert.equal(summary.byStatus.completed, 1);
  assert.equal(summary.generatedImages, 1);

  await fs.access(history.data[0].generatedImages[0].path);
  await fs.access(history.data[0].thumbnails[0].path);
});

test('requires configured client API key for image requests and request status polling', async () => {
  let upstreamCalls = 0;
  const upstream = await createUpstreamServer(async (req, res) => {
    upstreamCalls += 1;
    await readBody(req);
    assert.equal(req.headers.authorization, 'Bearer upstream-key');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-auth-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'upstream-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_CLIENT_API_KEYS: 'client-key',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const denied = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'blocked' }),
  });
  assert.equal(denied.status, 401);
  assert.equal(upstreamCalls, 0);

  const allowed = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer client-key',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'allowed' }),
  });
  assert.equal(allowed.status, 200);
  assert.equal(upstreamCalls, 1);

  const history = await adminJson(proxy.url, '/admin/history');
  const requestId = history.data[0].id;
  const statusDenied = await fetch(`${proxy.url}/v1/images/requests/${requestId}`);
  assert.equal(statusDenied.status, 401);

  const statusAllowed = await fetch(`${proxy.url}/v1/images/requests/${requestId}`, {
    headers: { 'x-api-key': 'client-key' },
  });
  assert.equal(statusAllowed.status, 200);
});

test('rate limits image proxy clients before forwarding to upstream', async () => {
  let upstreamCalls = 0;
  const upstream = await createUpstreamServer(async (req, res) => {
    upstreamCalls += 1;
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ b64_json: await sampleImageBase64() }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-rate-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_CLIENT_API_KEYS: 'client-key',
    IMAGE_PROXY_RATE_LIMIT_PER_MINUTE: '1',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const first = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer client-key',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'first' }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer client-key',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'second' }),
  });
  assert.equal(second.status, 429);
  assert.equal(upstreamCalls, 1);
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

test('rejects multipart files that exceed configured size limit before forwarding upstream', async () => {
  let upstreamCalls = 0;
  const upstream = await createUpstreamServer(async (req, res) => {
    upstreamCalls += 1;
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [] }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-upload-limit-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_MAX_MULTIPART_FILE_BYTES: '16',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const form = new FormData();
  form.append('prompt', 'oversized upload');
  form.append('image', new Blob([Buffer.alloc(32)], { type: 'image/png' }), 'large.png');

  const response = await fetch(`${proxy.url}/v1/images/edits`, {
    method: 'POST',
    body: form,
  });

  assert.equal(response.status, 413);
  assert.equal(upstreamCalls, 0);
});

test('rejects generated image URL downloads that exceed configured size limit', async () => {
  const imageServer = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    const body = Buffer.alloc(32);
    res.setHeader('content-type', 'image/png');
    res.setHeader('content-length', String(body.length));
    res.end(body);
  });
  const upstream = await createUpstreamServer(async (req, res) => {
    await readBody(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      data: [{ url: `${imageServer.url}/generated.png` }],
    }));
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-proxy-download-limit-'));
  const app = await createApp(loadConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: upstream.url,
    IMAGE_PROXY_STORAGE_DIR: tempDir,
    IMAGE_PROXY_REQUIRE_APPROVAL: 'false',
    IMAGE_PROXY_GENERATED_DOWNLOAD_MAX_BYTES: '16',
    IMAGE_PROXY_ALLOW_PRIVATE_GENERATED_URLS: 'true',
    IMAGE_PROXY_ADMIN_TOKEN: 'admin',
  }));
  const proxy = await listen(app);

  const response = await fetch(`${proxy.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'download too large' }),
  });

  assert.equal(response.status, 413);
  const history = await adminJson(proxy.url, '/admin/history');
  assert.equal(history.data[0].status, 'failed');
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
      ? appOrServer.listen(0, '127.0.0.1')
      : appOrServer;

    if (!server.listening) {
      server.listen(0, '127.0.0.1');
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
