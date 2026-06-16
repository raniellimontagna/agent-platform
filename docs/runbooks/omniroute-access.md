# OmniRoute access

O OmniRoute roda no LXC gateway 200, IP interno `10.10.0.10`, porta `20128`.

Para acessar sem SSH tunnel a partir da LAN, o host Proxmox pode publicar um proxy
TCP local:

```bash
rtk systemctl status agent-gateway-omniroute-proxy
```

URL esperada no browser:

```text
http://192.168.0.10:20128
```

Validação rápida no host:

```bash
rtk curl -s -o /tmp/omniroute.html -w '%{http_code}\n' http://192.168.0.10:20128/
```

O serviço encaminha `192.168.0.10:20128` para `10.10.0.10:20128`. Se precisar
recriar manualmente:

```bash
rtk cp infra/proxmox/agent-gateway-omniroute-proxy.service /etc/systemd/system/
rtk systemctl daemon-reload
rtk systemctl enable --now agent-gateway-omniroute-proxy
```

O LiteLLM continua disponível internamente em `10.10.0.10:4000`; os agentes usam
esse gateway por alias (`cheap_fast`, `research`, `strong_coder`, `heavy_coder`,
`critic`).
