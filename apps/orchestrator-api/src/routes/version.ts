import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import packageJson from '../../package.json';

export const versionRoute = new Hono();

versionRoute.get('/', (c) => {
  const version = packageJson.version;

  if (!version) {
    throw new HTTPException(500, {
      message: 'Version could not be resolved'
    });
  }

  return c.json({ version });
});
