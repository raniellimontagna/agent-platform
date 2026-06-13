import { Hono } from 'hono';
import { getArtifact, listArtifacts } from '../artifacts.js';

// Sem auth — mesma rede interna das rotas de runs (MAC-44).
export const artifactsRoute = new Hono();

/** Lista os artefatos de um run (metadados, sem content). */
artifactsRoute.get('/runs/:id/artifacts', async (c) => {
  return c.json({ artifacts: await listArtifacts(c.req.param('id')) });
});

/** Um artefato com content. */
artifactsRoute.get('/artifacts/:id', async (c) => {
  const artifact = await getArtifact(c.req.param('id'));
  if (!artifact) return c.json({ error: 'not found' }, 404);
  return c.json(artifact);
});
