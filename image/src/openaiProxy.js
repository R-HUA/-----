import crypto from 'node:crypto';
import { parseProxyRequest } from './requestParser.js';
import { saveGeneratedImagesFromResponse, saveGeneratedImagesFromSse } from './assets.js';

const IMAGE_ENDPOINTS = new Set([
  '/v1/images/generations',
  '/v1/images/edits',
  '/v1/images/variations',
]);

export function isImageEndpoint(pathname) {
  return IMAGE_ENDPOINTS.has(pathname);
}

export function createImageProxyHandler({ config, store, waiters }) {
  return async function imageProxyHandler(req, res, next) {
    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      const parsed = await parseProxyRequest(req, config, requestId);
      const record = await store.create({
        id: requestId,
        endpoint: req.path,
        method: req.method,
        status: 'generating',
        approvalRequired: config.requireApproval,
        createdAt: now,
        updatedAt: now,
        request: parsed.metadata,
        upstream: null,
        outputs: [],
      });

      const upstreamResponse = await callOpenAI({ req, config, parsed });
      const upstreamText = await upstreamResponse.text();
      const responseHeaders = getResponseHeaders(upstreamResponse);
      const upstreamRecord = {
        status: upstreamResponse.status,
        contentType: upstreamResponse.headers.get('content-type') || 'application/octet-stream',
        responseBody: tryParseJson(upstreamText),
      };

      if (!upstreamResponse.ok) {
        await store.update(requestId, {
          status: 'failed',
          failedAt: new Date().toISOString(),
          upstream: upstreamRecord,
        });
        return sendUpstreamResponse(res, upstreamResponse.status, responseHeaders, upstreamText);
      }

      const responseJson = tryParseJson(upstreamText);
      let outputs = [];
      if (responseJson) {
        outputs = await saveGeneratedImagesFromResponse({ config, requestId, responseJson });
      } else if (isEventStream(upstreamRecord.contentType)) {
        outputs = await saveGeneratedImagesFromSse({ config, requestId, sseText: upstreamText });
      }

      await store.update(requestId, (current) => ({
        ...current,
        status: config.requireApproval ? 'pending_review' : 'completed',
        completedAt: new Date().toISOString(),
        upstream: upstreamRecord,
        outputs,
      }));

      if (!config.requireApproval) {
        return sendUpstreamResponse(res, upstreamResponse.status, responseHeaders, upstreamText);
      }

      const approvalWait = waiters.wait(requestId, config.approvalHoldMs);
      const latestRecord = store.get(requestId);
      if (latestRecord?.status === 'approved') {
        return sendUpstreamResponse(res, upstreamResponse.status, responseHeaders, upstreamText);
      }
      if (latestRecord?.status === 'rejected') {
        return res.status(403).json({
          id: requestId,
          status: 'rejected',
          error: { message: 'Image generation was rejected by an administrator.' },
        });
      }

      const outcome = await approvalWait;
      if (outcome.type === 'approved') {
        return sendUpstreamResponse(res, upstreamResponse.status, responseHeaders, upstreamText);
      }
      if (outcome.type === 'rejected') {
        return res.status(403).json({
          id: requestId,
          status: 'rejected',
          error: { message: 'Image generation was rejected by an administrator.' },
        });
      }

      return res.status(202).json({
        id: requestId,
        status: 'pending_review',
        message: 'Image generation is complete and waiting for administrator approval.',
        status_url: `/v1/images/requests/${requestId}`,
      });
    } catch (error) {
      if (requestId) {
        await store.update(requestId, {
          status: 'failed',
          failedAt: new Date().toISOString(),
          error: { message: error.message },
        });
      }
      return next(error);
    }
  };
}

async function callOpenAI({ req, config, parsed }) {
  const upstreamUrl = new URL(`${config.openaiBaseUrl}${req.originalUrl}`);
  const headers = buildUpstreamHeaders(req, config, parsed.upstreamHeaders);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);

  try {
    return await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: parsed.upstreamBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('OpenAI upstream request timed out.'), { statusCode: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildUpstreamHeaders(req, config, requestHeaders) {
  const headers = new Headers(requestHeaders);

  const authorization = config.openaiApiKey ? `Bearer ${config.openaiApiKey}` : req.headers.authorization;
  if (authorization) {
    headers.set('authorization', authorization);
  }

  const organization = config.organization ?? req.headers['openai-organization'];
  if (organization) {
    headers.set('openai-organization', organization);
  }

  const project = config.project ?? req.headers['openai-project'];
  if (project) {
    headers.set('openai-project', project);
  }

  if (req.headers['openai-beta']) {
    headers.set('openai-beta', req.headers['openai-beta']);
  }

  return headers;
}

function getResponseHeaders(response) {
  const headers = {};
  const contentType = response.headers.get('content-type');
  if (contentType) {
    headers['content-type'] = contentType;
  }
  return headers;
}

function sendUpstreamResponse(res, status, headers, body) {
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  return res.status(status).send(body);
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isEventStream(contentType) {
  return String(contentType || '').toLowerCase().includes('text/event-stream');
}
