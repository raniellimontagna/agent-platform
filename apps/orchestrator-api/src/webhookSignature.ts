import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

export function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPlaneSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.PLANE_WEBHOOK_SECRET) {
    return env.NODE_ENV !== 'production';
  }
  return verifySignature(rawBody, signature, env.PLANE_WEBHOOK_SECRET);
}
