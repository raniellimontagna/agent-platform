# ADR-0004 — Segurança: Tailscale, .env e Aprovação Humana

**Status:** Accepted  
**Date:** 2026-06-10

## Contexto

O sistema executa código gerado por agentes e tem acesso a providers LLM, GitHub e Linear. Precisamos de políticas mínimas de segurança para o MVP sem overhead operacional excessivo.

## Decisão

### Acesso e rede

- Toda a infra exposta apenas na rede interna via **Tailscale/VPN**.
- LiteLLM, API do orquestrador e dashboard nunca expostos publicamente.
- Webhooks do Linear protegidos por token/assinatura validados na API.

### Secrets

- MVP: `.env` simples nas VMs, permissões `600`, fora do Git.
- `agent-runners` não recebe secrets de produção — apenas tokens de escopo mínimo.
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
- Merge e deploy continuam **manuais** no MVP.

## Consequências

- Runners isolados reduzem blast radius de código malicioso gerado por agente.
- Aprovação humana bloqueia ações irreversíveis sem supervisão.
- `.env` simples é operacionalmente viável no MVP; migração para vault é planejada.
