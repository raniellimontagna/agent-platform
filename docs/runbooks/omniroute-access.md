# OmniRoute access

O OmniRoute roda no LXC gateway 200, IP interno `<agent-gateway-ip>`, porta `20128`.

Para acessar sem SSH tunnel a partir da LAN, o host Proxmox pode publicar um proxy
TCP local:

```bash
rtk systemctl status agent-gateway-omniroute-proxy
```

URL esperada no browser:

```text
http://<proxmox-lan-ip>:20128
```

Validação rápida no host:

```bash
rtk curl -s -o /tmp/omniroute.html -w '%{http_code}\n' http://<proxmox-lan-ip>:20128/
```

O serviço encaminha `<proxmox-lan-ip>:20128` para `<agent-gateway-ip>:20128`. Se precisar
recriar manualmente:

```bash
printf 'PROXMOX_LAN_IP=<proxmox-lan-ip>\nAGENT_GATEWAY_IP=<agent-gateway-ip>\n' > /etc/default/agent-platform-proxy
rtk cp infra/proxmox/agent-gateway-omniroute-proxy.service /etc/systemd/system/
rtk systemctl daemon-reload
rtk systemctl enable --now agent-gateway-omniroute-proxy
```

O LiteLLM continua disponível internamente em `<agent-gateway-ip>:4000`; os agentes usam
esse gateway por alias (`cheap_fast`, `research`, `strong_coder`, `heavy_coder`,
`critic`).
