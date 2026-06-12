import { z } from 'zod';

const envSchema = z.object({
  ORCHESTRATOR_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    // stderr — stdout é reservado para o protocolo MCP.
    console.error(`Invalid environment variables:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
