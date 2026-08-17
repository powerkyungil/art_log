import crypto from 'node:crypto';

export function createAccessToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashAccessToken(rawToken) };
}

export function hashAccessToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
