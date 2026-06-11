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

  GITHUB_TOKEN: z.string().min(1),

  RUNNER_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),

  // Repo alvo que o agente vai modificar (default: o próprio agent-platform).
  REPO_URL: z.string().min(1).default('https://github.com/raniellimontagna/agent-platform.git'),

  // Comandos de validação rodados no sandbox após o push (MAC-29), um por linha.
  // Default: install + typecheck (pega quebras de build que o codegen possa introduzir).
  AGENT_TEST_COMMANDS: z.string().default('pnpm install --frozen-lockfile\npnpm -r typecheck'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
