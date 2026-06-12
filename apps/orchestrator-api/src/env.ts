import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  LITELLM_BASE_URL: z.string().url(),
  LITELLM_API_KEY: z.string().min(1),

  LINEAR_API_KEY: z.string().min(1),
  LINEAR_WEBHOOK_SECRET: z.string().min(1),
  // ID da label ai-ready no Linear — usado quando o webhook manda labelIds (não nomes).
  LINEAR_AI_READY_LABEL_ID: z.string().default('ea322be4-50bb-4703-af1c-35636ac2f9dc'),
  // ID da label `approved` — aprova o run pausado pela própria UI do Linear (MAC-22).
  LINEAR_APPROVED_LABEL_ID: z.string().default('c574cf55-fb4d-4e19-8898-b5423bb55eff'),

  GITHUB_TOKEN: z.string().min(1),

  RUNNER_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),

  // Repo alvo que o agente vai modificar (default: o próprio agent-platform).
  REPO_URL: z.string().min(1).default('https://github.com/raniellimontagna/agent-platform.git'),

  // Comandos de validação rodados no sandbox após o push (MAC-29), um por linha.
  // install → build (ordem topológica, resolve .d.ts de deps) → test (vitest).
  // `passWithNoTests` no vitest.config evita falha quando não há testes.
  AGENT_TEST_COMMANDS: z
    .string()
    .default('pnpm install --frozen-lockfile\npnpm -r build\npnpm test'),

  // Cost Guard (MAC-40), em USD estimado. Limite por run (alerta) e por sessão
  // (24h — bloqueia novos runs).
  AGENT_MAX_COST_PER_RUN_USD: z.coerce.number().default(2),
  AGENT_MAX_COST_PER_DAY_USD: z.coerce.number().default(20),
});

export type Env = z.infer<typeof envSchema>;

/** Secrets que não podem subir com valor placeholder (MAC-30). */
const SECRET_KEYS = [
  'LITELLM_API_KEY',
  'LINEAR_API_KEY',
  'LINEAR_WEBHOOK_SECRET',
  'GITHUB_TOKEN',
  'RUNNER_AUTH_TOKEN',
  'DATABASE_URL',
] as const;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  // Guard de secret: recusa subir com placeholder (defesa além do deploy.sh).
  const placeholders = SECRET_KEYS.filter((k) => /change-me/i.test(parsed.data[k]));
  if (placeholders.length > 0) {
    throw new Error(`Secrets com placeholder (preencha o .env): ${placeholders.join(', ')}`);
  }
  return parsed.data;
}

export const env = loadEnv();
