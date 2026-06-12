# Acesso ao Grafana pela LAN (sem ssh tunnel)

Por padrão o Grafana fica na rede isolada `vmbr1` (`10.10.0.13:3000`), atrás do
NAT **de saída** do host Proxmox — não há rota de entrada da LAN doméstica
(`192.168.0.x`) para `10.10.0.x`. Por isso o acesso original exigia um túnel:

```bash
ssh -L 8088:10.10.0.13:3000 root@192.168.0.10   # → http://localhost:8088
```

Este runbook expõe **somente o Grafana** na LAN via um DNAT no host, preservando o
isolamento do resto da subnet (orchestrator, runner, gateway continuam inacessíveis
de fora).

## Topologia relevante

```
TP-Link (192.168.0.1)
   └── Proxmox host (192.168.0.10 em vmbr0 · 10.10.0.1 em vmbr1)
         ├── vmbr0  192.168.0.x  ← LAN doméstica
         └── vmbr1  10.10.0.x    ← agent-platform (isolada, NAT de saída)
                     └── agent-observability .13 · Grafana :3000
```

O host é gateway da `vmbr1` (`10.10.0.1`), então o tráfego de volta passa por ele —
o conntrack reescreve a resposta sozinho. Não precisa de SNAT.

## Passo 1 — DNAT no host Proxmox

Roda no host (`192.168.0.10`):

```bash
# Encaminha LAN:3000 (no IP do host) → Grafana na vmbr1
iptables -t nat -A PREROUTING -i vmbr0 -p tcp -d 192.168.0.10 --dport 3000 \
  -j DNAT --to-destination 10.10.0.13:3000

# Libera o forward vmbr0 → vmbr1 só para esse destino/porta
iptables -A FORWARD -i vmbr0 -o vmbr1 -p tcp -d 10.10.0.13 --dport 3000 \
  -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT
```

## Passo 2 — Persistir (sobrevive a reboot)

As regras de NAT já são persistidas em `/etc/iptables/rules.v4` (ver
[`proxmox-estado-atual.md`](./proxmox-estado-atual.md)). Salva por cima:

```bash
iptables-save > /etc/iptables/rules.v4
```

## Passo 3 — DNS no Pi-hole

No Pi-hole (`192.168.0.14`) → **Local DNS Records**, apontar o registro existente
para o **host** (que faz o DNAT), não mais para o IP interno:

| Domínio | Era | Vira |
|---|---|---|
| `grafana.agent.local` | `10.10.0.13` | `192.168.0.10` |

## Passo 4 — Testar

De qualquer device da LAN:

```bash
curl -I http://192.168.0.10:3000        # espera 302/200 do Grafana
```

Navegador: **http://grafana.agent.local:3000** (ou `http://192.168.0.10:3000`).
Login `admin` / `GRAFANA_PASSWORD` (no `.env` do observability). Pasta de
dashboards: **Agent Platform**.

## Notas

- Expõe **apenas** a porta 3000 → Grafana. O resto da `vmbr1` segue isolado.
- A porta 3000 no host precisa estar livre (o orchestrator também é `:3000`, mas
  na `.11`, não no host — sem conflito).
- Sem TLS (HTTP puro na LAN). Para `https://grafana.agent.local` sem porta, usar um
  reverse proxy (Caddy/nginx) num container na `vmbr0` — fora do escopo deste
  runbook.
- Para **remover** o acesso: apague as duas regras (`iptables -t nat -D PREROUTING ...`
  e `iptables -D FORWARD ...`), salve de novo, e reverta o registro do Pi-hole.
