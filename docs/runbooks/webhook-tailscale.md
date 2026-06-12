# Runbook — Webhook real do Linear via Tailscale Funnel (MAC-19/20)

Expor o endpoint `/webhooks/linear` do orchestrator (.11, LXC 201) publicamente
por HTTPS pra o Linear cloud disparar o fluxo `ai-ready` sem `test-webhook.sh`.

> **Segurança:** expor SÓ o path `/webhooks/linear` (validado por HMAC). As rotas
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

## 3. Funnel SÓ no path do webhook

Expõe apenas `/webhooks/linear` → `localhost:3000` (o resto fica privado):
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/linear http://127.0.0.1:3000/webhooks/linear
pct exec 201 -- tailscale funnel status
```
A sintaxe exata varia por versão do tailscale — confirmar no `funnel status` que
**só** o path `/webhooks/linear` está público. A URL fica tipo
`https://orchestrator.<tailnet>.ts.net/webhooks/linear`.

## 4. Configurar o webhook no Linear

Linear → **Settings → API → Webhooks → New webhook**:
- **URL:** `https://orchestrator.<tailnet>.ts.net/webhooks/linear`
- **Secret:** = `LINEAR_WEBHOOK_SECRET` do `.env` do orchestrator (HMAC).
- **Eventos:** Issues (e mudanças de label).

## 5. Testar com issue real

Põe a label `ai-ready` numa issue real → o webhook dispara → run criado.
Acompanhar: `pct exec 201 -- bash -lc "cd .../orchestrator && docker compose logs -f api"`.

O handler aceita o payload por **nome** (`labels[].name`) ou por **id**
(`labelIds[]` vs `LINEAR_AI_READY_LABEL_ID`, default = id da label `ai-ready`).

## Follow-up de segurança

Hoje `/runs/:id/approve|reject` não tem auth (OK enquanto só o Funnel scoped
expõe `/webhooks`). Se algum dia expor mais que o webhook, proteger essas rotas
com bearer (igual `/admin`).
