import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { version } from './version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '../../package.json');

describe('GET /version', () => {
  it('returns 200 with the version from package.json', async () => {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version: string };

    const app = new Hono();
    app.route('/', version);

    const res = await app.request('/version');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ version: pkg.version });
  });
});
