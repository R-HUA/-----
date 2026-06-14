import crypto from 'node:crypto';

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function anySafeEqual(value, candidates) {
  for (const candidate of candidates || []) {
    if (safeEqual(value, candidate)) {
      return true;
    }
  }
  return false;
}
