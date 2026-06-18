# Runbook — Secrets (MAC-30)

Política e procedimento de rotação dos segredos do agent-platform.

## Princípios

- **Fora do código.** Nenhum secret no repositório. Tudo via `.env` por serviço,
  derivado de `.env.example` (que só tem placeholders `change-me`/`changeme`).
- **Guard de boot.** `env.ts` de cada app recusa subir se um secret ainda tiver
  `change-me` (além do bloqueio do `deploy.sh`).
- **Redação em log.** Os loggers (pino `redact`) censuram `authorization`, `token`,
  `apiKey`, `secret`, `password`, `DATABASE_URL`, `REDIS_URL` → secrets não chegam
  ao Loki/stdout.
- **Acesso.** `.env` mora em `/opt/agent-platform/.../​.env` (LXC) e
  `/home/runner/agent-platform/repo/.../.env` (VM runner), nunca versionado.

## Inventário

| Secret | Onde | Serviço | Origem |
|---|---|---|---|
| `LITELLM_MASTER_KEY` | gateway `.env` | LiteLLM | gerado (sk-…) |
| `OMNIROUTE_API_KEY` | gateway `.env` | OmniRoute | painel OmniRoute (OAuth) |
| `VERBOO_API_KEY` | gateway `.env` | Verboo | painel Verboo |
| `LITELLM_API_KEY` | orchestrator + runner `.env` | chamadas LLM | virtual key dedicada do LiteLLM (`key_alias=agent-platform`), gerada com a master (MAC-15) — **não** é a master key |
| `LINEAR_API_KEY` | orchestrator `.env` | Linear SDK | Linear → Settings → API |
| `LINEAR_WEBHOOK_SECRET` | orchestrator `.env` | HMAC do webhook | Linear → Webhooks |
| `GITHUB_TOKEN` | orchestrator `.env` | clone/push/PR | GitHub PAT (escopo `repo`) |
| `RUNNER_AUTH_TOKEN` | orchestrator + runner `.env` | auth orchestrator↔runner + `/admin` | gerado (`openssl rand -hex 24`) |
| `FIRECRAWL_API_KEY` | runner `.env` | research packs do `data-collector-agent` | Firecrawl dashboard |
| `DATABASE_URL` | orchestrator `.env` | Postgres | senha do compose |
| `GRAFANA_PASSWORD` | observability `.env` | Grafana | gerado no deploy |

## Rotação

Geral: editar o `.env` do serviço, salvar, redeployar/reiniciar o container.

1. **Gerar/obter o novo valor** (PAT novo, `openssl rand -hex 24`, etc.).
2. **Atualizar o `.env`** no serviço:
   - LXC: `pct exec <CTID> -- nano /opt/agent-platform/.../.env`
   - VM runner: `ssh runner@10.10.0.12 'nano ~/agent-platform/repo/infra/compose/runners/.env'`
3. **Propagar** se o secret é compartilhado (ex.: `RUNNER_AUTH_TOKEN` e
   `LITELLM_API_KEY` ficam no orchestrator E no runner — trocar nos dois).
4. **Reiniciar**: `bash infra/deploy/deploy.sh <serviço>` ou
   `docker compose up -d` no dir do compose.
5. **Revogar o valor antigo** na origem (GitHub PAT, Linear key, etc.).

### Casos especiais

- **`RUNNER_AUTH_TOKEN`**: compartilhado orchestrator↔runner e usado no `/admin`
  (kill switch). Trocar nos dois `.env` na mesma janela pra não quebrar a auth.
- **`LITELLM_API_KEY` (virtual key `agent-platform`)**: orchestrator e runner usam
  uma virtual key dedicada do LiteLLM, **não** a master (MAC-15). Para rotacionar:
  gerar nova key (`POST :4000/key/generate` com a master — ver
  [`litellm-guardrails.md`](litellm-guardrails.md)), trocar `LITELLM_API_KEY` nos
  dois `.env` e revogar a antiga (`POST :4000/key/delete`). Rotacionar a
  `LITELLM_MASTER_KEY` (gateway) **não** exige mais mexer no orchestrator/runner —
  só re-emitir as virtual keys se quiser.
- **`GITHUB_TOKEN`**: PAT com escopo `repo`. Após rotacionar, revogar o antigo no
  GitHub → Settings → Developer settings → Tokens.
- **`FIRECRAWL_API_KEY`**: só o runner precisa. Sem ela o serviço sobe, mas jobs
  do `data-collector-agent` falham com mensagem explícita antes de chamar API.

## Verificação pós-rotação

- Serviço sobe sem erro de secret placeholder (guard do `env.ts`).
- Runner→gateway: `curl` no LiteLLM com o novo `LITELLM_API_KEY` responde.
- Webhook: `infra/deploy/test-webhook.sh` com o novo `LINEAR_WEBHOOK_SECRET`.
- `/admin/status` responde com o novo `RUNNER_AUTH_TOKEN`.
