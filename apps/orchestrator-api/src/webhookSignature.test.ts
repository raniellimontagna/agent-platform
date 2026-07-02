import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './env.js';
import { verifyPlaneSignature, verifySignature } from './webhookSignature.js';

vi.mock('./env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PLANE_WEBHOOK_SECRET: 'secret',
  },
}));

function sign(body: string, secret = 'secret') {
  return createHmac('sha256', secret).update(body).digest('hex');
}

beforeEach(() => {
  env.NODE_ENV = 'test';
  env.PLANE_WEBHOOK_SECRET = 'secret';
});

describe('verifySignature', () => {
  it('rejects missing signatures', () => {
    expect(verifySignature('{"ok":true}', undefined, 'secret')).toBe(false);
  });

  it('rejects mismatched signatures without throwing on length mismatch', () => {
    expect(verifySignature('{"ok":true}', 'too-short', 'secret')).toBe(false);
    expect(verifySignature('{"ok":true}', sign('{"ok":false}'), 'secret')).toBe(false);
  });

  it('accepts matching HMAC SHA-256 signatures', () => {
    const body = '{"ok":true}';

    expect(verifySignature(body, sign(body), 'secret')).toBe(true);
  });
});

describe('verifyPlaneSignature', () => {
  it('uses the Plane webhook secret when configured', () => {
    const body = '{"event":"work_item"}';

    expect(verifyPlaneSignature(body, sign(body))).toBe(true);
    expect(verifyPlaneSignature(body, sign('other-body'))).toBe(false);
  });

  it('accepts unsigned Plane payloads without a secret outside production', () => {
    env.PLANE_WEBHOOK_SECRET = undefined as never;
    env.NODE_ENV = 'development';

    expect(verifyPlaneSignature('{"event":"work_item"}', undefined)).toBe(true);
  });

  it('rejects unsigned Plane payloads without a secret in production', () => {
    env.PLANE_WEBHOOK_SECRET = undefined as never;
    env.NODE_ENV = 'production';

    expect(verifyPlaneSignature('{"event":"work_item"}', undefined)).toBe(false);
  });
});
