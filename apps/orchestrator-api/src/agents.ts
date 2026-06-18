import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from './db/client.js';
import { isUniqueViolation } from './db/pgError.js';
import type { Agent, NewAgent } from './db/schema.js';
import { env } from './env.js';

export type AgentStatus = (typeof schema.agentStatus.enumValues)[number];
export const DEFAULT_AGENT_KEY = env.AGENT_KEY;
export const REVIEWER_AGENT_KEY = 'reviewer-agent';

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

/** Erro de chave duplicada (key+version) — mapeado para 409 na rota. */
export class AgentExistsError extends Error {
  constructor() {
    super('agent already exists');
    this.name = 'AgentExistsError';
  }
}

export function agentKeyFromLabels(labelNames: string[]): string {
  return labelNames.includes('agent:reviewer') ? REVIEWER_AGENT_KEY : DEFAULT_AGENT_KEY;
}

/** Lista agentes (catálogo / descoberta), mais recentes primeiro. */
export async function listAgents(filter?: {
  key?: string;
  status?: AgentStatus;
}): Promise<Agent[]> {
  const conds = [];
  if (filter?.key) conds.push(eq(schema.agents.key, filter.key));
  if (filter?.status) conds.push(eq(schema.agents.status, filter.status));
  return db
    .select()
    .from(schema.agents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.agents.createdAt));
}

/** Um agente pelo id (null se não existe). */
export async function getAgent(id: string): Promise<Agent | null> {
  const [row] = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  return row ?? null;
}

/** Registra um agente/versão. Lança AgentExistsError em (key,version) duplicado. */
export async function createAgent(parts: CreateAgentInput): Promise<Agent> {
  try {
    const [row] = await db
      .insert(schema.agents)
      .values({
        key: parts.key,
        version: parts.version,
        description: parts.description,
        capabilities: parts.capabilities,
      } satisfies NewAgent)
      .returning();
    // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AgentExistsError();
    throw err;
  }
}

/** Muda o status (ex. deprecate). null se o id não existe. */
export async function updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null> {
  const [row] = await db
    .update(schema.agents)
    .set({ status })
    .where(eq(schema.agents.id, id))
    .returning();
  return row ?? null;
}

const DEFAULT_AGENTS: NewAgent[] = [
  {
    key: DEFAULT_AGENT_KEY,
    version: 'v1',
    description: 'Pipeline LangGraph atual (planner→coder→reviewing→revising→pr→report)',
    capabilities: ['typescript', 'node', 'hono', 'feature', 'bugfix', 'refactor', 'single-repo'],
  },
  {
    key: REVIEWER_AGENT_KEY,
    version: 'v1',
    description: 'Agente focado em revisão/critic para triagem e validação de mudanças.',
    capabilities: ['review', 'critic', 'quality-gate', 'test-analysis', 'single-repo'],
  },
];

/** Insere os agentes built-in se não existirem. Idempotente. */
export async function ensureDefaultAgents(): Promise<void> {
  await db
    .insert(schema.agents)
    .values(DEFAULT_AGENTS)
    .onConflictDoNothing({ target: [schema.agents.key, schema.agents.version] });
}

/** Compat: mantém o nome antigo usado pelo worker/tests. */
export async function ensureDefaultAgent(): Promise<void> {
  await ensureDefaultAgents();
}

/** Agente vigente da key default (env.AGENT_KEY): active mais recente, ou null. */
export async function resolveDefaultAgent(): Promise<Agent | null> {
  const rows = await listAgents({ key: DEFAULT_AGENT_KEY });
  return pickActiveAgent(rows);
}

export async function resolveAgentByKey(key: string): Promise<Agent | null> {
  const rows = await listAgents({ key });
  return pickActiveAgent(rows);
}
