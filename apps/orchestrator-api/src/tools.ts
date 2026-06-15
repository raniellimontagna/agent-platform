import { z } from 'zod';
import type { Tool } from './db/schema.js';

/** Schema de criação de tool via REST. */
export const createToolSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  risk: z.enum(['safe', 'caution', 'dangerous']).default('safe'),
  scopes: z.array(z.string()).default([]),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;

/**
 * Escolhe a tool "vigente" de um conjunto de versões de uma key: a active de
 * created_at mais recente. `null` se nenhuma active. Pura — testável sem DB.
 */
export function pickActiveTool(rows: Tool[]): Tool | null {
  const active = rows.filter((r) => r.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}
