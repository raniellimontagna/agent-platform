import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from './db/client.js';
import { isUniqueViolation } from './db/pgError.js';
import type { NewTool, Tool } from './db/schema.js';

export type ToolRisk = (typeof schema.toolRisk.enumValues)[number];
export type ToolStatus = (typeof schema.toolStatus.enumValues)[number];

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

/** Erro de chave duplicada (key+version) — mapeado para 409 na rota. */
export class ToolExistsError extends Error {
  constructor() {
    super('tool already exists');
    this.name = 'ToolExistsError';
  }
}

/** Lista tools (catálogo / descoberta), mais recentes primeiro. */
export async function listTools(filter?: {
  key?: string;
  status?: ToolStatus;
  risk?: ToolRisk;
}): Promise<Tool[]> {
  const conds = [];
  if (filter?.key) conds.push(eq(schema.tools.key, filter.key));
  if (filter?.status) conds.push(eq(schema.tools.status, filter.status));
  if (filter?.risk) conds.push(eq(schema.tools.risk, filter.risk));
  return db
    .select()
    .from(schema.tools)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.tools.createdAt));
}

/** Uma tool pelo id (null se não existe). */
export async function getTool(id: string): Promise<Tool | null> {
  const [row] = await db.select().from(schema.tools).where(eq(schema.tools.id, id)).limit(1);
  return row ?? null;
}

/** Registra uma tool/versão. Lança ToolExistsError em (key,version) duplicado. */
export async function createTool(parts: CreateToolInput): Promise<Tool> {
  try {
    const [row] = await db
      .insert(schema.tools)
      .values({
        key: parts.key,
        version: parts.version,
        description: parts.description,
        risk: parts.risk,
        scopes: parts.scopes,
      } satisfies NewTool)
      .returning();
    // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ToolExistsError();
    throw err;
  }
}

/** Muda o status (ex. deprecate). null se o id não existe. */
export async function updateToolStatus(id: string, status: ToolStatus): Promise<Tool | null> {
  const [row] = await db
    .update(schema.tools)
    .set({ status })
    .where(eq(schema.tools.id, id))
    .returning();
  return row ?? null;
}

/** Tools default = allowlist atual do runner + tools planejadas no catálogo. */
const DEFAULT_TOOLS: NewTool[] = [
  {
    key: 'git',
    version: 'v1',
    risk: 'caution',
    scopes: ['vcs', 'fs_write'],
    description: 'Controle de versão (clone/commit/push).',
  },
  {
    key: 'pnpm',
    version: 'v1',
    risk: 'dangerous',
    scopes: ['network', 'exec', 'fs_write'],
    description: 'Gerenciador de pacotes (install/build/test).',
  },
  {
    key: 'npm',
    version: 'v1',
    risk: 'dangerous',
    scopes: ['network', 'exec', 'fs_write'],
    description: 'Gerenciador de pacotes Node.',
  },
  {
    key: 'npx',
    version: 'v1',
    risk: 'dangerous',
    scopes: ['network', 'exec', 'fs_write'],
    description: 'Executor de binários de pacote.',
  },
  {
    key: 'node',
    version: 'v1',
    risk: 'caution',
    scopes: ['exec'],
    description: 'Runtime JavaScript.',
  },
  {
    key: 'python',
    version: 'v1',
    risk: 'caution',
    scopes: ['exec', 'fs_read', 'fs_write'],
    description:
      'Runtime Python para scripts de coleta/normalização. Ainda não está no allowlist padrão do runner.',
  },
  {
    key: 'playwright',
    version: 'v1',
    risk: 'dangerous',
    scopes: ['network', 'browser', 'fs_write'],
    description:
      'Automação de browser para páginas dinâmicas, screenshots e inspeção visual controlada.',
  },
  {
    key: 'firecrawl',
    version: 'v1',
    risk: 'caution',
    scopes: ['network', 'web_extract'],
    description: 'Extração/crawling via Firecrawl API para páginas públicas e conteúdo crawlável.',
  },
  {
    key: 'scrapling',
    version: 'v1',
    risk: 'dangerous',
    scopes: ['network', 'browser', 'web_extract', 'crawl'],
    description:
      'Framework Python/CLI para scraping HTTP, páginas JS e crawling. Uso condicionado à política de scraping.',
  },
];

/** Insere as tools default se não existirem. Idempotente. */
export async function ensureDefaultTools(): Promise<void> {
  await db
    .insert(schema.tools)
    .values(DEFAULT_TOOLS)
    .onConflictDoNothing({ target: [schema.tools.key, schema.tools.version] });
}
