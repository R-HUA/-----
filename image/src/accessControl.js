import { anySafeEqual } from './security.js';

const WINDOW_MS = 60_000;

export function createClientAccessMiddleware(config) {
  const apiKeys = new Set(config.clientApiKeys || []);
  const buckets = new Map();

  return function clientAccessMiddleware(req, res, next) {
    const token = extractClientToken(req);
    if (apiKeys.size > 0 && !anySafeEqual(token, apiKeys)) {
      return res.status(401).json({
        error: { message: 'A valid image proxy API key is required.' },
      });
    }

    const subject = token || req.ip || req.socket.remoteAddress || 'anonymous';
    const bucket = getBucket(buckets, subject);
    const now = Date.now();
    resetWindowIfNeeded(bucket, now);

    if (config.clientRateLimitPerMinute > 0) {
      if (bucket.count >= config.clientRateLimitPerMinute) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000));
        res.setHeader('retry-after', String(retryAfterSeconds));
        return res.status(429).json({
          error: { message: 'Image proxy rate limit exceeded.' },
        });
      }
      bucket.count += 1;
      res.setHeader('x-ratelimit-limit', String(config.clientRateLimitPerMinute));
      res.setHeader('x-ratelimit-remaining', String(Math.max(0, config.clientRateLimitPerMinute - bucket.count)));
    }

    if (config.clientMaxConcurrentRequests > 0) {
      if (bucket.inFlight >= config.clientMaxConcurrentRequests) {
        return res.status(429).json({
          error: { message: 'Too many concurrent image proxy requests.' },
        });
      }
      bucket.inFlight += 1;
      releaseOnResponseClose(res, () => {
        bucket.inFlight = Math.max(0, bucket.inFlight - 1);
      });
    }

    return next();
  };
}

export function extractClientToken(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : '';
  return String(req.headers['x-api-key'] || bearer || '');
}

function getBucket(buckets, subject) {
  const existing = buckets.get(subject);
  if (existing) {
    return existing;
  }
  const created = { windowStart: Date.now(), count: 0, inFlight: 0 };
  buckets.set(subject, created);
  return created;
}

function resetWindowIfNeeded(bucket, now) {
  if (now - bucket.windowStart < WINDOW_MS) {
    return;
  }
  bucket.windowStart = now;
  bucket.count = 0;
}

function releaseOnResponseClose(res, release) {
  let released = false;
  const once = () => {
    if (released) {
      return;
    }
    released = true;
    release();
  };
  res.on('finish', once);
  res.on('close', once);
}
