# ADR-0004 — Segurança: Tailscale, .env e Aprovação Humana

**Status:** Accepted  
**Date:** 2026-06-10

## Contexto

O sistema executa código gerado por agentes e tem acesso a providers LLM,
GitHub, Plane e Linear legado. Precisamos de políticas mínimas de segurança para
operação contínua sem overhead operacional excessivo.

## Decisão

### Acesso e rede

- Toda a infra operacional exposta apenas na rede interna via **Tailscale/VPN**.
- LiteLLM, API do orquestrador e dashboard nunca expostos publicamente.
- Webhooks públicos são a exceção: Tailscale Funnel expõe somente
  `/webhooks/plane` e, quando necessário, `/webhooks/linear`.
- Webhooks do Plane e Linear legado são protegidos por HMAC/assinatura validados
  na API.
- Rotas `/admin/*` exigem bearer e não devem ser publicadas via Funnel.

### Secrets

- MVP: `.env` simples nas VMs, permissões `600`, fora do Git.
- `agent-runners` não recebe secrets de produção amplos — apenas tokens de escopo
  mínimo necessários para clone/push e tools governadas.
- Fase posterior: migrar para Infisical / 1Password Secrets / Bitwarden Secrets.

### Aprovação humana obrigatória

O agente pausa e aguarda confirmação humana antes de executar qualquer ação que envolva:

- Migrations de banco de dados
- Mudanças em autenticação ou segurança
- Alterações de infraestrutura
- Deploy ou restart de serviços
- Dependências críticas (mudança de versão major)
- Custo acima do limite configurado
- Exclusão de arquivos grandes ou sensíveis

### GitHub

- MVP: token pessoal com escopo mínimo necessário.
- Fase posterior: GitHub App com permissões por repositório.
- Merge automático existe apenas como **opt-in** (`auto-merge`) e exige testes
  verdes, critic aprovado ou ressalva operacional, e política do grafo passando.
  Sem opt-in, o PR fica para revisão/merge manual.

### Execução de código

- O runner usa sandbox Docker em produção para comandos de validação, com worktree
  montado e sem herdar secrets do worker.
- Comandos seguem allowlist/policy do runner.
- Scraping público é governado por policy compartilhada; Playwright só roda quando
  card/plano pedir explicitamente browser/renderização/screenshot e a URL estiver
  autorizada.

## Consequências

- Runners isolados reduzem blast radius de código malicioso gerado por agente.
- Aprovação humana bloqueia ações irreversíveis ou sensíveis sem supervisão.
- `.env` simples é operacionalmente viável no MVP; migração para vault é planejada.
- Funnel path-scoped reduz o blast radius do endpoint público.
