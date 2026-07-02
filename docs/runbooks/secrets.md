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

## Configuração de cards

- `CARD_PRIMARY_PROVIDER=plane`
- `CARD_EXTRA_PROVIDERS=`
- `PLANE_BASE_URL=http://10.10.0.14:8080`
- `PLANE_WORKSPACE_SLUG=attodev`
- `PLANE_PROJECT_ID=change-me`
- `PLANE_AI_READY_LABEL_ID=change-me`
- `PLANE_APPROVED_LABEL_ID=change-me`
- `PLANE_AUTO_MERGE_LABEL_ID=change-me`
- `PLANE_SCHEDULED_LABEL_ID=change-me`
- `PLANE_DONE_STATE_ID=change-me`
- Linear é compatibilidade legado/migração. Mantenha `LINEAR_*` ausente ou vazio
  em operação normal; preencha só para `plane:migrate-linear`, leitura de dados
  antigos que exija provider Linear, ou uma janela explícita de rollback.

## Inventário

| Secret | Onde | Serviço | Origem |
|---|---|---|---|
| `LITELLM_MASTER_KEY` | gateway `.env` | LiteLLM | gerado (sk-…) |
| `OMNIROUTE_API_KEY` | gateway `.env` | OmniRoute | painel OmniRoute (OAuth) |
| `VERBOO_API_KEY` | gateway `.env` | Verboo | painel Verboo |
| `LITELLM_API_KEY` | orchestrator + runner `.env` | chamadas LLM | virtual key dedicada do LiteLLM (`key_alias=agent-platform`), gerada com a master (MAC-15) — **não** é a master key |
| `PLANE_API_KEY` | orchestrator `.env` | Plane SDK / API | Plane → Settings → API |
| `PLANE_WEBHOOK_SECRET` | orchestrator `.env` | HMAC do webhook | Plane → Webhooks |
| `LINEAR_API_KEY` | orchestrator `.env` (legado/migração) | Linear SDK | Linear → Settings → API |
| `LINEAR_WEBHOOK_SECRET` | orchestrator `.env` (legado/migração) | HMAC do webhook | Linear → Webhooks |
| `GITHUB_TOKEN` | orchestrator `.env` | clone/push/PR | GitHub PAT (escopo `repo`) |
| `RUNNER_AUTH_TOKEN` | orchestrator + runner `.env` | auth orchestrator↔runner + `/admin` | gerado (`openssl rand -hex 24`) |
| `FIRECRAWL_API_KEY` | runner `.env` | research packs do `data-collector-agent` | Firecrawl dashboard |
| `INSTAGRAM_GRAPH_ACCESS_TOKEN` | runner `.env` | Business Discovery opcional para `data-collector-agent` | Meta app / Graph API Explorer / token long-lived |
| `INSTAGRAM_GRAPH_IG_USER_ID` | runner `.env` | IG user raiz autorizado para Business Discovery | Meta Graph API |
| `APIFY_TOKEN` | runner `.env` | provider externo Apify Instagram para `data-collector-agent` | Apify Console → Settings → Integrations |
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
5. **Revogar o valor antigo** na origem (GitHub PAT, Linear key legado, etc.).

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
- **`PLANE_API_KEY` / `PLANE_WEBHOOK_SECRET`**: ficam no orchestrator `.env`.
  Rotacionar o API key exige atualizar o valor no painel/REST do Plane e depois
  reexecutar o deploy do orchestrator.
- **`GITHUB_TOKEN`**: PAT com escopo `repo`. Após rotacionar, revogar o antigo no
  GitHub → Settings → Developer settings → Tokens.
- **`FIRECRAWL_API_KEY`**: só o runner precisa. Sem ela o serviço sobe, mas jobs
  do `data-collector-agent` falham com mensagem explícita antes de chamar API.
- **Instagram Graph API**: opcional e usado só pelo runner. Sem
  `INSTAGRAM_GRAPH_ACCESS_TOKEN` ou `INSTAGRAM_GRAPH_IG_USER_ID`, o
  `data-collector-agent` continua com coleta pública e registra que Business
  Discovery foi pulado. Rotacione o token no Meta Developers/Graph API Explorer,
  atualize o runner `.env` e reinicie o runner.
- **`APIFY_TOKEN`**: opcional e usado só pelo runner. Sem ele, o
  `data-collector-agent` pula o provider Apify e mantém Graph API,
  Firecrawl/Playwright. Rotacione no painel da Apify, atualize o runner `.env` e
  reinicie o runner. Nunca versionar token em `.env.example`.

## Verificação pós-rotação

- Serviço sobe sem erro de secret placeholder (guard do `env.ts`).
- Runner→gateway: `curl` no LiteLLM com o novo `LITELLM_API_KEY` responde.
- Webhook ativo: `infra/deploy/test-webhook.sh` com `PLANE_WEBHOOK_SECRET`.
  Teste `LINEAR_WEBHOOK_SECRET` apenas durante migração/rollback explícito.
- `/admin/status` responde com o novo `RUNNER_AUTH_TOKEN`.
