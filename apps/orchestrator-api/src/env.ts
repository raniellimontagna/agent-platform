import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  LITELLM_BASE_URL: z.string().url(),
  LITELLM_API_KEY: z.string().min(1),
  // O gateway precisa tempo suficiente para aplicar fallback antes do cliente abortar.
  LLM_TIMEOUT_MS: z.coerce.number().default(750_000),
  LLM_MAX_RETRIES: z.coerce.number().default(0),

  LINEAR_API_KEY: z.string().min(1).optional(),
  LINEAR_WEBHOOK_SECRET: z.string().min(1).optional(),
  // ID da label ai-ready no Linear — usado quando o webhook manda labelIds (não nomes).
  LINEAR_AI_READY_LABEL_ID: z.string().default('ea322be4-50bb-4703-af1c-35636ac2f9dc'),
  // ID da label `approved` — aprova o run pausado pela própria UI do Linear (MAC-22).
  LINEAR_APPROVED_LABEL_ID: z.string().default('c574cf55-fb4d-4e19-8898-b5423bb55eff'),

  CARD_PRIMARY_PROVIDER: z.enum(['plane', 'linear']).default('plane'),
  CARD_EXTRA_PROVIDERS: z.string().default(''),

  PLANE_BASE_URL: z.string().url().default('http://10.10.0.14:8080'),
  PLANE_API_KEY: z.string().optional(),
  PLANE_WORKSPACE_SLUG: z.string().default('attodev'),
  PLANE_PROJECT_ID: z.string().optional(),
  PLANE_WEBHOOK_SECRET: z.string().optional(),
  PLANE_AI_READY_LABEL_ID: z.string().optional(),
  PLANE_APPROVED_LABEL_ID: z.string().optional(),
  PLANE_AUTO_MERGE_LABEL_ID: z.string().optional(),
  PLANE_SCHEDULED_LABEL_ID: z.string().optional(),
  PLANE_DONE_STATE_ID: z.string().optional(),

  GITHUB_TOKEN: z.string().min(1),

  RUNNER_BASE_URL: z.string().url(),
  // Worker Manager (MAC-39): lista de runners separada por vírgula (failover).
  // Ausente → usa só RUNNER_BASE_URL.
  RUNNER_BASE_URLS: z.string().optional(),
  RUNNER_AUTH_TOKEN: z.string().min(1),
  // Jobs de código podem gastar LLM + validação + review/recode; a chamada
  // síncrona precisa cobrir o pior caso enquanto o runner não for assíncrono.
  RUNNER_JOB_TIMEOUT_MS: z.coerce.number().default(5_400_000),

  // Repo alvo que o agente vai modificar (default: o próprio agent-platform).
  REPO_URL: z.string().min(1).default('https://github.com/raniellimontagna/agent-platform.git'),
  // Repositórios gerados para entregas finais (landing pages, sites, etc.).
  GENERATED_REPOS_OWNER: z.string().default('attodevlabs'),
  GENERATED_REPOS_TOKEN: z.string().optional(),
  GENERATED_REPOS_TEMPLATE: z.string().optional(),
  GENERATED_REPOS_ALLOW_CREATE: z.coerce.boolean().default(false),

  // Cloudflare Workers deploy automático para landing pages geradas após auto-merge.
  CLOUDFLARE_DEPLOY_GENERATED_LANDINGS: z.coerce.boolean().default(false),
  CLOUDFLARE_DEPLOY_COMMANDS: z
    .string()
    .default('pnpm install --frozen-lockfile\npnpm deploy:cloudflare'),

  // Comandos de validação rodados no sandbox após o push (MAC-29), um por linha.
  // install → verify. O verify cobre lint, build, testes, eval e regressão do eval.
  AGENT_TEST_COMMANDS: z.string().default('pnpm install --frozen-lockfile\npnpm verify'),

  // Cost Guard (MAC-40), em USD estimado. Limite por run (alerta) e por sessão
  // (24h — bloqueia novos runs).
  AGENT_MAX_COST_PER_RUN_USD: z.coerce.number().default(2),
  AGENT_MAX_COST_PER_DAY_USD: z.coerce.number().default(20),
  // Loop de revisão pelo critic (MAC-59): máximo de voltas de re-revisão.
  AGENT_MAX_REVIEW_ROUNDS: z.coerce.number().default(3),
  // Scheduler (MAC-38): time onde as issues agendadas são criadas (obrigatório).
  LINEAR_TEAM_ID: z.string().min(1).optional(),
  // Timezone default dos agendamentos (cada schedule pode sobrescrever).
  SCHEDULER_TZ: z.string().default('UTC'),
  // Label opcional aplicada às issues criadas por agendamento.
  LINEAR_SCHEDULED_LABEL_ID: z.string().optional(),
  // Auto-merge (MAC-67): label de opt-in + estado "Done" do time p/ fechar a issue.
  LINEAR_AUTO_MERGE_LABEL_ID: z.string().optional(),
  LINEAR_DONE_STATE_ID: z.string().default('79e3b949-6f1f-469d-902d-71d135d18cae'),

  // Agent Registry (MAC-42): key do agente default (catálogo/seed/resolução).
  AGENT_KEY: z.string().default('coder-agent'),
  // Multi-Agent Execution (MAC-47): nº de runs processados em paralelo pelo worker.
  AGENT_MAX_CONCURRENCY: z.coerce.number().default(3),
});

export type Env = z.infer<typeof envSchema>;

/** Secrets que não podem subir com valor placeholder (MAC-30). */
const SECRET_KEYS = [
  'LITELLM_API_KEY',
  'LINEAR_API_KEY',
  'LINEAR_WEBHOOK_SECRET',
  'PLANE_API_KEY',
  'PLANE_WEBHOOK_SECRET',
  'GITHUB_TOKEN',
  'GENERATED_REPOS_TOKEN',
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
  const placeholders = SECRET_KEYS.filter((k) => {
    const value = parsed.data[k];
    return typeof value === 'string' && /change-me/i.test(value);
  });
  if (placeholders.length > 0) {
    throw new Error(`Secrets com placeholder (preencha o .env): ${placeholders.join(', ')}`);
  }

  const cardProviders = new Set([
    parsed.data.CARD_PRIMARY_PROVIDER,
    ...parsed.data.CARD_EXTRA_PROVIDERS.split(',').map((provider) => provider.trim()),
  ]);
  if (cardProviders.has('linear')) {
    const missing = [
      !parsed.data.LINEAR_API_KEY ? 'LINEAR_API_KEY' : null,
      !parsed.data.LINEAR_WEBHOOK_SECRET ? 'LINEAR_WEBHOOK_SECRET' : null,
    ].filter(Boolean);
    if (parsed.data.CARD_PRIMARY_PROVIDER === 'linear' && !parsed.data.LINEAR_TEAM_ID) {
      missing.push('LINEAR_TEAM_ID');
    }
    if (missing.length > 0) {
      throw new Error(`Linear provider habilitado sem env obrigatório: ${missing.join(', ')}`);
    }
  }
  if (
    parsed.data.CARD_PRIMARY_PROVIDER === 'plane' &&
    parsed.data.NODE_ENV === 'production' &&
    !parsed.data.PLANE_WEBHOOK_SECRET
  ) {
    throw new Error('PLANE_WEBHOOK_SECRET is required when Plane is the primary provider');
  }
  return parsed.data;
}

export const env = loadEnv();
