# Research to Landing Page Workflow

O workflow composto cria uma landing page a partir de pesquisa pública da empresa.
Ele encadeia dois agentes no mesmo card Plane:

1. `data-collector-agent` coleta dados públicos e salva artifact `research`.
2. O orchestrator cria automaticamente um segundo run com `landing-page-agent`.
3. O segundo run recebe o `Landing Page Brief` priorizado e o research pack
   completo como contexto extra do planner.
4. Só a etapa final de landing page abre Draft PR.

## Status e fontes de verdade

| Item | Status | Fonte de verdade | Evidencia local |
|------|--------|------------------|-----------------|
| Label de workflow | Ativo | `apps/orchestrator-api/src/workflows.ts` (`workflow:landing-page` -> `research_landing_page`) | `apps/orchestrator-api/src/workflows.test.ts` |
| Primeiro run de pesquisa | Ativo | `apps/orchestrator-api/src/routes/webhooks.ts` seleciona `data-collector-agent` para o workflow | `apps/orchestrator-api/src/routes/webhooks.test.ts` |
| Continuacao landing | Ativo | `apps/orchestrator-api/src/worker.ts` cria o run com `landing-page-agent` e contexto de pesquisa | `apps/orchestrator-api/src/worker.test.ts` |
| Runner e artifacts | Ativo | `apps/worker-code/src/executor/runJob.ts`, `apps/orchestrator-api/src/artifacts.ts`, `apps/orchestrator-api/src/routes/artifacts.ts` | `apps/worker-code/src/executor/runJob.test.ts`, `apps/orchestrator-api/src/artifacts.test.ts`, `apps/orchestrator-api/src/routes/artifacts.test.ts` |
| Skills especializadas | Ativo | `agent-skills/registry.json` carregado por `apps/worker-code/src/executor/agentSkills.ts` | `apps/worker-code/src/executor/agentSkills.test.ts` |

`coder-agent` continua sendo chave de compatibilidade para o pipeline geral. O
nome operacional mais claro para esse fluxo e `software-delivery-pipeline`, com
especializacoes `data-collector-agent` e `landing-page-agent` quando a label
`workflow:landing-page` esta presente.

## Como disparar

No card Plane:

- inclua `ai-ready`;
- inclua `workflow:landing-page`;
- para criar um repo final novo, inclua também `repo:create`;
- coloque URLs públicas da empresa, produto, Instagram público, LinkedIn público,
  página de preços, docs ou referências relevantes;
- opcionalmente informe `TARGET_REPO_NAME: nome-do-repo` na descrição;
- para usar um repo já existente, informe `TARGET_REPO: attodevlabs/nome-do-repo`;
- aprove o plano inicial com `approved`.

Não adicione `agent:landing-page` nem `agent:data-collector`; a label de workflow
já seleciona o coletor na primeira etapa e o landing-page-agent na continuação.
Cards Linear continuam aceitos apenas no provider legado/opcional.

## Contrato de entrada

O card deve trazer escopo suficiente para a pesquisa publica:

- uma ou mais URLs publicas da marca, produto, docs, pricing, Instagram publico,
  LinkedIn publico ou referencias equivalentes;
- objetivo da landing page e audiencia quando isso ja existir;
- restricoes de claims, compliance, tom ou assets quando forem obrigatorias;
- `TARGET_REPO` ou `TARGET_REPO_NAME` quando o destino nao for o repo default;
- nenhuma credencial, token, analytics privado ou conteudo atras de login no
  corpo do card.

## Comportamento esperado

- O primeiro run termina como `completed`, sem PR, com artifact `research`.
- O orchestrator comenta que iniciou a etapa de landing page.
- Com `repo:create`, o orchestrator cria o repo final em `attodevlabs` a partir
  de `GENERATED_REPOS_TEMPLATE` e abre o PR nesse repo.
- Sem `repo:create` e sem `TARGET_REPO`, o comportamento permanece no repo
  default do deploy.
- O segundo run é `autoApprove=true`; se o planner detectar motivo crítico, ele
  ainda ficará aguardando aprovação humana.
- A etapa de landing page usa o research pack como fonte principal de copy,
  prova, objeções, SEO, visual e estrutura.
- Quando o artifact contém `## Landing Page Brief`, o contexto do
  `landing-page-agent` coloca esse briefing antes do research pack completo para
  orientar a primeira decisão do planner.

## Artifacts e report final

O primeiro run salva artifact `research` com fontes publicas, metodo,
limitacoes, evidencias reutilizaveis e `## Landing Page Brief` quando houver
dados suficientes. O segundo run pode salvar artifacts de plano, patch,
validacao, review e summary conforme o pipeline de software.

O report final deve voltar ao card Plane de origem. Ele deve deixar claro:

- se a pesquisa terminou e qual artifact sustenta os claims;
- se a continuacao landing foi criada;
- se o PR foi aberto, ficou em draft, fez auto-merge ou exigiu acao humana;
- quais falhas foram bloqueantes e quais foram registradas como limitacoes.

Mission Control e os endpoints de artifact sao superficies de leitura para
validar o estado depois do run: `apps/orchestrator-api/src/routes/admin.ts`,
`apps/orchestrator-api/src/artifacts.ts` e
`apps/orchestrator-api/src/routes/artifacts.ts`.

## Falhas e rollback

- Falha de coleta publica encerra ou limita o primeiro run; nao deve inventar
  claims para destravar a landing.
- Falha ao salvar artifact deve aparecer no report e nos logs do orchestrator;
  o operador verifica `apps/orchestrator-api/src/artifacts.ts` e
  `apps/orchestrator-api/src/routes/artifacts.ts`.
- Falha critica no plano da landing pode manter o segundo run aguardando
  aprovacao humana mesmo quando a continuacao e criada com `autoApprove=true`.
- Rollback operacional e remover labels do Plane, pausar agentes em Mission
  Control/admin ou reverter o PR gerado. Nao reative Linear para esse workflow;
  Linear e compatibilidade legado/migracao.

## Verificacao local

Use os testes locais em vez de exigir um E2E Plane/GitHub real para mudancas de
documentacao deste contrato:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts
```

## Limites

- Apenas workflow fixo de duas etapas nesta fase.
- A coleta continua limitada a URLs explícitas e passa pela scraping policy
  compartilhada do worker.
- Firecrawl é o coletor padrão para páginas públicas crawláveis. Playwright é
  selecionado somente quando o card/plano pede browser, renderização dinâmica ou
  screenshot.
- Não há UI para montar workflows arbitrários.
- Dados privados ou autenticados exigem export/API autorizada e continuam fora do
  scraping público.
- O briefing é uma síntese determinística do research pack; ele não autoriza o
  agente downstream a inventar claims sem fonte.
