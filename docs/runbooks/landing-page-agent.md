# Landing Page Agent

`landing-page-agent` é o primeiro agente especializado de produto do
agent-platform. Ele usa o mesmo LangGraph do pipeline de entrega
(`software-delivery-pipeline` / `coder-agent` compatível), mas recebe skills
versionadas no codegen para construir landing pages prontas em pouco tempo.

## Status e propriedade

| Superficie | Status | Fonte de verdade | Evidencia local |
|------------|--------|------------------|-----------------|
| Selecao direta `agent:landing-page` | Ativo | `apps/orchestrator-api/src/agents.ts`, `apps/orchestrator-api/src/routes/webhooks.ts` | `apps/orchestrator-api/src/routes/webhooks.test.ts` |
| Continuacao do `workflow:landing-page` | Ativo | `apps/orchestrator-api/src/worker.ts`, `apps/orchestrator-api/src/workflows.ts` | `apps/orchestrator-api/src/worker.test.ts`, `apps/orchestrator-api/src/workflows.test.ts` |
| Execucao de codigo, validacao e PR | Ativo | `apps/worker-code/src/executor/runJob.ts`, `packages/graph/src/nodes/coder.ts` | `apps/worker-code/src/executor/runJob.test.ts`, `packages/graph/src/nodes/coder.test.ts` |
| Skill bundle | Ativo | `agent-skills/registry.json`, `apps/worker-code/src/executor/agentSkills.ts` | `apps/worker-code/src/executor/agentSkills.test.ts` |

## Como selecionar

Em um card Plane:

- adicione `ai-ready`;
- adicione `agent:landing-page`;
- aprove normalmente com `approved` quando o plano estiver bom.

Sem `agent:landing-page`, o fluxo continua usando a chave compatível
`coder-agent` do pipeline padrão.
Cards Linear ainda são aceitos apenas no provider legado/opcional.

No workflow composto, nao selecione este agente manualmente. A label
`workflow:landing-page` faz o primeiro run com `data-collector-agent` e o
orchestrator cria a continuacao com `landing-page-agent` depois que o artifact
`research` existe.

## Skills atuais

O agente carrega o pacote definido em `agent-skills/registry.json`:

- `landing-page-production`;
- `frontend-design`;
- `ui-ux-pro-max`;
- `accessibility-wcag`;
- `astro-react-landing`;
- `seo-page`;
- `biome-formatting`;
- `gsap-motion`;
- `higgsfield-media-generation`.

Essas skills orientam o runner/codegen a:

- entregar uma primeira tela utilizável;
- priorizar hero, proposta de valor, CTA, prova/benefícios e conversão final;
- usar asset visual quando o stack permitir;
- garantir responsividade mobile/desktop;
- aplicar direção visual forte sem perder clareza de mensagem;
- preservar acessibilidade WCAG 2.2 AA básica: semântica, foco, contraste,
  teclado, labels, target size e reduced motion;
- usar Astro + React como stack preferencial para LPs do zero;
- incluir SEO técnico/on-page/schema quando o stack permitir;
- validar formatação/lint pelo Biome do repo;
- planejar e usar assets gerados por Higgsfield quando houver MCP/CLI
  autenticado, mantendo fallback explícito quando não houver;
- evitar página genérica, paleta de uma única cor, excesso de cards e sobreposição
  de texto;
- seguir componentes e padrões existentes do app;
- passar a validação padrão do repo.

Veja também `docs/runbooks/agent-skills.md`.

## Limites atuais

- Ainda usa o mesmo grafo de execução
  (`planning -> coding -> reviewing -> pr -> merging -> cloudflareDeploy -> report`).
- Não executa Higgsfield automaticamente enquanto o runner não tiver MCP/CLI
  autenticado por OAuth de forma persistente. A skill já orienta prompts,
  slots, nomes de arquivos, fallback e integração dos assets quando a tool
  estiver disponível.
- Deploy Cloudflare automático só roda quando a configuração de landings geradas
  estiver habilitada e o repo alvo for elegível; caso contrário o resultado fica
  no PR.
- `gsap-motion` só deve ser aplicado quando a dependência existir ou puder ser
  adicionada com segurança.
- Astro + React é o padrão para LPs novas, mas o agente ainda deve respeitar o
  stack real do repositório quando estiver editando um app existente.
- A skill `landing-page-production` é a orquestradora do pacote: ela deve
  equilibrar impacto visual, UX, acessibilidade, SEO, motion e validação.

## Contrato de entrada e saida

Entrada esperada:

- plano aprovado ou auto-aprovado pelo grafo;
- contexto do card Plane;
- research pack quando o run vier de `workflow:landing-page`;
- `Landing Page Brief` priorizado antes do research pack completo quando a
  pesquisa o produziu;
- repo destino definido pelo card, pelo workflow ou pelo default de deploy.

Saida esperada:

- mudancas de landing page com validacao local;
- Draft PR ou PR pronto conforme regras de auto-merge;
- artifacts de plano, patch, validacao, review e summary quando produzidos pelo
  pipeline;
- report final no Plane com PR, limitacoes e proximas acoes.

Se a pesquisa estiver incompleta, o agente deve usar apenas claims com fonte e
registrar lacunas. Falhas de validacao seguem o self-correction de
`apps/worker-code/src/executor/runJob.ts`; falhas finais ficam no report, sem
inventar evidencias para abrir PR.

## Próximas evoluções

- Criar eval específico para landing pages verificando estrutura mínima de LP.
- Adicionar critic especializado de UX/conversão.
- Permitir geração de asset visual quando o card pedir explicitamente.
- Criar integração runtime para Higgsfield: autenticação OAuth persistida no
  runner, comandos/MCP controlados por policy, artifact store para mídia gerada
  e possível `media-generation-agent` dedicado para imagens/vídeos/animações.

## Verificacao local

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts
```
