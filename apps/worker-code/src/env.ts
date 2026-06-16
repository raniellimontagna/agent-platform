import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RUNNER_WORKDIR: z.string().min(1),
  RUNNER_ARTIFACTS_DIR: z.string().min(1),

  LITELLM_BASE_URL: z.string().url(),
  LITELLM_API_KEY: z.string().min(1),
  // Codegen tem prompt grande (arquivos + exemplos) → timeout alto, poucos retries.
  LLM_TIMEOUT_MS: z.coerce.number().default(180_000),
  LLM_MAX_RETRIES: z.coerce.number().default(2),

  ORCHESTRATOR_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),

  // Autor dos commits gerados pelo agente (MAC-17).
  GIT_AUTHOR_NAME: z.string().min(1).default('agent-platform bot'),
  GIT_AUTHOR_EMAIL: z.string().min(1).default('bot@agent.local'),

  // Allowlist de binários que o runner pode executar (MAC-31), separados por
  // vírgula. Comandos do job fora disto são bloqueados e auditados.
  AGENT_COMMAND_ALLOWLIST: z.string().default('pnpm,node,npm,npx,git'),
  // Self-correction: máximo de tentativas de fix após falha de validação.
  AGENT_MAX_FIX_ATTEMPTS: z.coerce.number().default(2),

  // Sandbox executor (MAC-28). `process` mantém dev/test simples; produção usa
  // containers efêmeros via Docker socket montado na VM de runners.
  AGENT_SANDBOX_BACKEND: z.enum(['process', 'docker']).default('process'),
  AGENT_SANDBOX_IMAGE: z.string().min(1).default('agent-platform/worker-code:latest'),
  AGENT_SANDBOX_NETWORK: z.string().min(1).default('bridge'),
  AGENT_SANDBOX_CPUS: z.coerce.number().positive().default(2),
  AGENT_SANDBOX_MEMORY: z.string().min(1).default('2g'),
  AGENT_SANDBOX_PIDS_LIMIT: z.coerce.number().int().positive().default(512),
});

export type Env = z.infer<typeof envSchema>;

/** Secrets que não podem subir com valor placeholder (MAC-30). */
const SECRET_KEYS = ['LITELLM_API_KEY', 'RUNNER_AUTH_TOKEN'] as const;

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
