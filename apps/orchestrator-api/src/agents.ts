import { z } from 'zod';
import type { Agent } from './db/schema.js';

/** Schema de criação de agente via REST. */
export const createAgentSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

/**
 * Escolhe o agente "vigente" de um conjunto de versões de uma key: a active de
 * created_at mais recente. `null` se nenhuma active. Puro — testável sem DB.
 */
export function pickActiveAgent(rows: Agent[]): Agent | null {
  const active = rows.filter((r) => r.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}
