# Superpowers Planning

Usamos o Superpowers como referência metodológica para melhorar a qualidade dos
planos e entregas do agent-platform.

Referência upstream: https://github.com/obra/Superpowers

## Como entra no agent-platform

O planner do grafo (`packages/graph/src/nodes/planner.ts`) usa um contrato
Superpowers-inspired. Ele não depende do plugin estar instalado no runtime do
worker; as regras essenciais ficam no prompt versionado e testado.

O contrato exige:

- entendimento curto do problema;
- escopo e fora de escopo quando houver risco de expansão;
- arquivos prováveis com paths exatos;
- passos pequenos e ordenados;
- TDD para feature, bugfix e refactor;
- comandos de validação objetivos;
- critérios de aceite verificáveis;
- riscos que exigem aprovação humana;
- self-review do plano antes da execução.

## O que ainda fica manual

Os docs em `docs/superpowers/specs` e `docs/superpowers/plans` continuam sendo o
local para specs e planos maiores. Para trabalhos pequenos, o plano comentado no
Linear já deve seguir o contrato acima.

## Próximas evoluções recomendadas

- Adicionar um eval de qualidade de plano com `LlmClient` fake validando o shape
  mínimo do plano.
- Fazer o critic reprovar planos sem testes/validação quando a mudança toca código.
- Criar um modo `planning-deep` para issues grandes gerar spec + plan salvos em
  `docs/superpowers` antes de pedir aprovação.
