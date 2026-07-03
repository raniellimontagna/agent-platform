# Runbook — Webhooks de cards via Tailscale Funnel (MAC-19/20)

Plane (primary card provider) -> `/webhooks/plane` ->
`apps/orchestrator-api/src/runs.ts` -> BullMQ `agent-runs` ->
`apps/orchestrator-api/src/worker.ts` -> worker-code `/jobs`
(`apps/worker-code/src/routes/jobs.ts`) ->
`apps/worker-code/src/executor/runJob.ts` -> GitHub PR/merge -> Plane report.
Linear is legacy/migration-only compatibility; current public intake should
expose Plane only.

Expor o endpoint ativo de webhook do orchestrator (.11, LXC 201) publicamente
por HTTPS para o Plane disparar o fluxo `ai-ready` sem `test-webhook.sh`.

> **Segurança:** expor SÓ os paths de webhook (validado por HMAC). As rotas
> `/runs/*` (incl. `/approve`, que dispara código) e `/admin/*` NÃO podem ir pro
> Funnel. Funnel scoped por path resolve isso.

Evidencia local antes de alterar exposicao publica:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/worker-code/src/executor/runJob.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts
```

Esse gate cobre a entrada Plane, persistencia do run, fila BullMQ,
aprovacao/resume, runner e report final. A rota
`apps/worker-code/src/routes/jobs.ts` e a propriedade da API HTTP do runner; ela
permanece ancorada estaticamente enquanto o comportamento executado fica
coberto por `apps/worker-code/src/executor/runJob.test.ts`.

> **Nota de verificação:** as evidências de closeout do smoke test da Fase 11
> estão em [11-E2E-SMOKE-EVIDENCE.md](../../.planning/phases/11-final-verification-and-e2e-gate/11-E2E-SMOKE-EVIDENCE.md).

## 1. Tailscale no orchestrator (LXC 201)

LXC precisa do device `tun`. No host, no config do container (`/etc/pve/lxc/201.conf`):
```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```
Reinicia o container (`pct restart 201`). Alternativa sem tun: rodar
`tailscaled --tun=userspace-networking` (Funnel funciona em userspace).

Instala e sobe (login interativo no navegador):
```bash
pct exec 201 -- bash -lc "curl -fsSL https://tailscale.com/install.sh | sh"
pct exec 201 -- tailscale up
```

## 2. Habilitar HTTPS + Funnel no admin do tailnet

No console Tailscale (admin):
- **DNS → MagicDNS** ligado + **HTTPS Certificates** ligado.
- **Access controls** → `nodeAttrs` com `"funnel"` pro nó do orchestrator:
  ```json
  "nodeAttrs": [{ "target": ["tag:orchestrator"], "attr": ["funnel"] }]
  ```
  (ou liberar Funnel pelo botão na página do device).

## 3. Funnel SÓ no webhook ativo

Expõe o Plane primário → `localhost:3000` (o resto fica privado):
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/plane http://127.0.0.1:3000/webhooks/plane
```

Não exponha `/webhooks/linear` no fluxo normal. Essa rota existe apenas para
compatibilidade legado/migração e só deve voltar ao Funnel durante uma janela de
rollback explícita com `CARD_EXTRA_PROVIDERS=linear` e secrets Linear válidos.

Confirma no `tailscale funnel status` que só os paths esperados estão públicos.
Em operação atual, a única URL pública esperada é:
- `https://orchestrator.<tailnet>.ts.net/webhooks/plane`

## 4. Configurar os webhooks

Plane → **Settings → API → Webhooks → New webhook**:
- **URL:** `https://orchestrator.<tailnet>.ts.net/webhooks/plane`
- **Secret:** = `PLANE_WEBHOOK_SECRET` do `.env` do orchestrator (HMAC).
- **Eventos:** work-item events que cobrem `ai-ready`, `approved`, remoção/arquivo
  de card e labels do fluxo.

Linear (legado/migração) deve permanecer desabilitado. Se um rollback exigir
reativar temporariamente:
- configure `CARD_EXTRA_PROVIDERS=linear`;
- preencha `LINEAR_API_KEY`, `LINEAR_WEBHOOK_SECRET` e, se necessário,
  `LINEAR_TEAM_ID`;
- exponha `/webhooks/linear` apenas durante a janela de rollback;
- remova o path do Funnel e desabilite o webhook Linear ao encerrar a janela.

## 5. Testar com card real

Põe a label `ai-ready` num card real do Plane → o webhook dispara → run criado.
Acompanhar: `pct exec 201 -- bash -lc "cd .../orchestrator && docker compose logs -f api"`.

O handler aceita o payload por **nome** (`labels[].name`) ou por **id**
(`labelIds[]` vs `PLANE_AI_READY_LABEL_ID`, default = id da label `ai-ready`).

### Validar roteamento público sem criar run

Use uma assinatura inválida para confirmar que o Funnel chega ao orchestrator e
que a validação HMAC está ativa:

```bash
curl -i -X POST https://agent-orchestrator.tail85607e.ts.net/webhooks/plane \
  -H 'content-type: application/json' \
  -H 'x-plane-event: work_item' \
  -H 'x-plane-signature: invalid' \
  --data-raw '{}'
```

Resultado esperado: `401` com `{"error":"invalid signature"}` e log
`Plane webhook with invalid signature rejected` no `orchestrator-api-1`.

### Auditar eventos e skips

Eventos não-transicionais do Plane retornam `200` com `skipped: true`. Isso é
normal para comentários, updates sem mudança nova de label ou updates onde o
payload não traz `updated_from.labels`. O handler loga o motivo e os campos de
auditoria principais:

- `reason`: por exemplo `no relevant label transition`, `previous labels missing`
  ou `nenhum run aguardando aprovação`;
- `action` e `event`;
- `cardId` e `cardIdentifier`;
- labels atuais e anteriores quando disponíveis.

Eventos de remoção/arquivo do Plane (`delete`, `remove`, `archive` e variações
no passado) cancelam todos os runs ativos do card antes de avaliar labels. A
resposta esperada é `200` com `cancelled: <n>` e `reason: "plane work item
removed"`.

Para ver os logs recentes:

```bash
pct exec 201 -- bash -lc \
  "docker logs --since 30m orchestrator-api-1 2>&1 | grep -Ei 'Plane webhook|ai-ready|approved'"
```

Para auditar runs já criados para um card específico, use o endpoint interno
protegido por bearer:

```bash
TOKEN="$(pct exec 201 -- docker exec orchestrator-api-1 printenv RUNNER_AUTH_TOKEN)"
curl -fsS \
  -H "authorization: Bearer $TOKEN" \
  "http://10.10.0.11:3000/admin/card-runs?provider=plane&cardId=<work-item-id>"
```

Esse endpoint não consulta o Plane; ele mostra o histórico persistido no
orchestrator para confirmar se o webhook gerou ou retomou runs.

## Fallback legado

Hoje `/runs/:id/approve|reject` não tem auth (OK enquanto só o Funnel scoped
expõe `/webhooks`). Se algum dia expor mais que o webhook, proteger essas rotas
com bearer (igual `/admin`).

Antes de qualquer remoção destrutiva da rota ou dos campos
`linear_issue_id`/`linear_issue_identifier`, registre uma auditoria read-only do
Postgres de produção contando linhas legacy-only. A compatibilidade Linear existe
para leitura de dados antigos e rollback, não para novas entradas.
