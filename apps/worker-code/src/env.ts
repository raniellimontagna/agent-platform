import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RUNNER_WORKDIR: z.string().min(1),
  RUNNER_ARTIFACTS_DIR: z.string().min(1),

  LITELLM_BASE_URL: z.string().url(),
  LITELLM_API_KEY: z.string().min(1),

  ORCHESTRATOR_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),

  // Autor dos commits gerados pelo agente (MAC-17).
  GIT_AUTHOR_NAME: z.string().min(1).default('agent-platform bot'),
  GIT_AUTHOR_EMAIL: z.string().min(1).default('bot@agent.local'),

  // Allowlist de binários que o runner pode executar (MAC-31), separados por
  // vírgula. Comandos do job fora disto são bloqueados e auditados.
  AGENT_COMMAND_ALLOWLIST: z.string().default('pnpm,node,npm,npx,git'),
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
