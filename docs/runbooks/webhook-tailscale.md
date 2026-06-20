# Runbook — Webhooks de cards via Tailscale Funnel (MAC-19/20)

Plane (primary card provider) -> Orchestrator API -> agent-runners -> GitHub PR -> Plane report
Linear remains supported as an optional provider for legacy cards through `/webhooks/linear`.

Expor os endpoints de webhook do orchestrator (.11, LXC 201) publicamente por
HTTPS pra o provider de cards disparar o fluxo `ai-ready` sem `test-webhook.sh`.

> **Segurança:** expor SÓ os paths de webhook (validado por HMAC). As rotas
> `/runs/*` (incl. `/approve`, que dispara código) e `/admin/*` NÃO podem ir pro
> Funnel. Funnel scoped por path resolve isso.

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

## 3. Funnel SÓ nos paths dos webhooks

Expõe o Plane primário → `localhost:3000` (o resto fica privado):
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/plane http://127.0.0.1:3000/webhooks/plane
```

Expõe também o Linear legado → `localhost:3000`:
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/linear http://127.0.0.1:3000/webhooks/linear
```

Confirma no `tailscale funnel status` que só os paths esperados estão públicos.
As URLs ficam tipo:
- `https://orchestrator.<tailnet>.ts.net/webhooks/plane`
- `https://orchestrator.<tailnet>.ts.net/webhooks/linear`

## 4. Configurar os webhooks

Plane → **Settings → API → Webhooks → New webhook**:
- **URL:** `https://orchestrator.<tailnet>.ts.net/webhooks/plane`
- **Secret:** = `PLANE_WEBHOOK_SECRET` do `.env` do orchestrator (HMAC).
- **Eventos:** work-item events que cobrem `ai-ready`, `approved` e labels do fluxo.

Linear (legado) → **Settings → API → Webhooks → New webhook**:
- **URL:** `https://orchestrator.<tailnet>.ts.net/webhooks/linear`
- **Secret:** = `LINEAR_WEBHOOK_SECRET` do `.env` do orchestrator (HMAC).
- **Eventos:** Issues (e mudanças de label).

## 5. Testar com card real

Põe a label `ai-ready` num card real do Plane → o webhook dispara → run criado.
Acompanhar: `pct exec 201 -- bash -lc "cd .../orchestrator && docker compose logs -f api"`.

O handler aceita o payload por **nome** (`labels[].name`) ou por **id**
(`labelIds[]` vs `PLANE_AI_READY_LABEL_ID`, default = id da label `ai-ready`).

## Fallback legado

Hoje `/runs/:id/approve|reject` não tem auth (OK enquanto só o Funnel scoped
expõe `/webhooks`). Se algum dia expor mais que o webhook, proteger essas rotas
com bearer (igual `/admin`).
