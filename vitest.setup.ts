// Popula variáveis de ambiente dummy para os testes (MAC-29). Vários módulos
// (env.ts, logger.ts) validam env no import, então qualquer teste que importe
// uma rota que puxa esses módulos quebraria sem isto. Só preenche o que falta —
// não sobrescreve env real (CI/local).
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  // orchestrator-api
  DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  LITELLM_BASE_URL: 'http://localhost:4000',
  LITELLM_API_KEY: 'sk-test',
  LINEAR_API_KEY: 'lin_test',
  LINEAR_WEBHOOK_SECRET: 'whsec_test',
  GITHUB_TOKEN: 'ghp_test',
  RUNNER_BASE_URL: 'http://localhost:8080',
  RUNNER_AUTH_TOKEN: 'runner-test',
  // worker-code
  ORCHESTRATOR_BASE_URL: 'http://localhost:3000',
  RUNNER_WORKDIR: '/tmp/agent-worktrees',
  RUNNER_ARTIFACTS_DIR: '/tmp/agent-artifacts',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
