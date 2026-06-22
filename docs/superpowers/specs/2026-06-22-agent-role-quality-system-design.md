# Agent Role Quality System Design

Data: 2026-06-22

## Objetivo

Melhorar a qualidade real dos agentes do pipeline sem separar fisicamente a
execucao LangGraph atual. O sistema continua rodando o fluxo
`planning -> coding -> reviewing -> revising -> pr -> report`, mas cada role
passa a ter contrato, modelo, avaliacao e metrica mais claros.

Ordem aprovada:

1. contratos/skills por role;
2. aliases de modelo por role;
3. evals por role;
4. metricas de qualidade.

## Contexto Atual

O catalogo ja expoe `software-delivery-pipeline` e mantem `coder-agent` como
chave compativel. As roles visiveis sao `planner`, `coder`, `critic`, `pr` e
`reporter`, com aliases declarados em `apps/orchestrator-api/src/agents.ts`.

Hoje, porem, boa parte do comportamento ainda vive em prompts locais dos nos:

- `packages/graph/src/nodes/planner.ts`;
- `packages/graph/src/nodes/review.ts`;
- `packages/graph/src/nodes/pr.ts`;
- `packages/graph/src/nodes/report.ts`;
- `apps/worker-code/src/executor/codegen.ts` e `runJob.ts` para o coder.

O diretorio `agent-skills/` ja existe e e usado principalmente por agentes
especializados (`landing-page-agent`, `data-collector-agent`). A evolucao deve
reaproveitar esse padrao, sem transformar skills externas em dependencia de
runtime.

## Referencia Externa

O repositorio `https://github.com/affaan-m/ECC/tree/main` foi anotado como fonte
de pesquisa para skills, harness patterns, memoria, seguranca e evals. O README
do ECC descreve o projeto como um sistema cross-harness com skills, instincts,
memory optimization, continuous learning, security scanning e research-first
development.

Uso planejado:

- consultar ideias e estrutura antes de criar ou revisar skills locais;
- adaptar conceitos manualmente para o contrato do agent-platform;
- nao baixar, executar, importar ou sincronizar conteudo automaticamente;
- revisar licenca, seguranca e compatibilidade antes de qualquer reaproveitamento
  textual ou tecnico.

## Abordagem Escolhida

### 1. Contratos e skills por role

Criar contratos versionados para cada role do pipeline. Eles devem responder:

- o que a role faz;
- quais entradas consome;
- qual formato de saida produz;
- quais erros deve bloquear;
- quais erros deve tratar como ressalva operacional;
- quais comandos/evidencias deve exigir.

Formato recomendado:

- `agent-skills/software-planner/SKILL.md`;
- `agent-skills/software-coder/SKILL.md`;
- `agent-skills/software-critic/SKILL.md`;
- `agent-skills/software-pr/SKILL.md`;
- `agent-skills/software-reporter/SKILL.md`.

Essas skills entram no `agent-skills/registry.json` ligadas a
`software-delivery-pipeline` e, por compatibilidade, a `coder-agent`.

Os prompts hardcoded dos nos podem continuar existindo como fallback, mas devem
ser montados a partir de uma funcao compartilhada quando houver contrato de role.

### 2. Aliases de modelo por role

Centralizar a resolucao de modelo por role, em vez de espalhar aliases nos nos.
Defaults propostos:

| Role | Alias default | Motivo |
|---|---|---|
| planner | `research` | melhor planejamento e leitura de contexto |
| coder | `strong_coder` | implementacao e refatoracao |
| critic | `critic` | revisao mais rigorosa |
| pr | `cheap_fast` ou sem LLM | PR hoje e majoritariamente deterministico |
| reporter | `cheap_fast` ou sem LLM | resumo final simples |

A primeira entrega deve preservar o comportamento atual: `planner` usa
`research`, `coder` usa `strong_coder`, `critic` usa `critic`, e `pr/reporter`
seguem deterministicos ate haver necessidade clara de LLM.

### 3. Evals por role

Adicionar evals pequenos e deterministos, priorizando roles de maior impacto:

1. `critic`: detectar bug, teste faltante, regressao e ressalva operacional sem
   bloquear indevidamente;
2. `planner`: produzir plano com escopo, arquivos provaveis, TDD e comandos de
   validacao;
3. `coder`: seguir plano, preservar escopo e responder feedback do critic;
4. `pr`: gerar corpo de PR com resumo, validacao e revisao;
5. `reporter`: produzir comentario final claro no Plane.

Os evals devem rodar localmente, sem GitHub, Plane ou LLM real quando possivel.
Quando o comportamento depender de LLM, usar fixtures e clientes fake.

### 4. Metricas de qualidade

Comecar com metricas derivadas de campos ja existentes e artefatos:

- veredito do critic;
- quantidade de voltas do critic;
- quantidade de tentativas de auto-correcao;
- validacao passou/falhou;
- PR abriu ou falhou;
- auto-merge elegivel, bloqueado ou indisponivel;
- custo estimado por role.

Se essas metricas ficarem dificeis de consultar, uma migration futura pode criar
campos agregados ou tabela dedicada. A primeira implementacao deve evitar
migration se os dados atuais forem suficientes.

## Fora de Escopo

- Separar cada role em worker/fila/agente fisico independente.
- Substituir o LangGraph atual.
- Importar skills do ECC automaticamente.
- Adicionar dependencia externa para skills em runtime.
- Reescrever a UI do registry alem de pequenos ajustes para expor contracts e
  aliases.

## Dados e Fluxo

1. Webhook Plane cria run com `agent_id`.
2. Orchestrator resolve agente e roles declaradas.
3. Cada no do grafo monta seu prompt com:
   - prompt base do no;
   - contrato da role;
   - contexto do card/run;
   - artefatos anteriores, quando aplicavel.
4. O LLM e chamado pelo alias resolvido para a role.
5. Saidas estruturadas alimentam estado, artefatos, comentarios e metricas.

## Erros e Fallbacks

- Skill ausente: usar prompt hardcoded atual e logar aviso.
- Alias ausente: usar alias default atual da role.
- Evals falhando: bloquear merge da mudanca que alterou contrato/prompt.
- Saida malformada do critic/planner: manter parse tolerante, mas registrar
  falha de qualidade e preservar caminho seguro.
- ECC indisponivel: sem impacto; e apenas referencia manual.

## Testes

Cobertura minima:

- registry carrega skills do pipeline e mantem compatibilidade com `coder-agent`;
- resolucao de alias por role retorna defaults esperados;
- planner preserva `APPROVAL_REASONS`;
- critic preserva `Veredito` e decisao de loop;
- evals de critic e planner rodam sem servicos externos;
- reporter/PR continuam deterministas quando nao usam LLM.

## Criterios de Aceite

- `coder-agent` continua funcionando com labels existentes.
- `software-delivery-pipeline` mostra roles, aliases e skills coerentes.
- Planner e critic usam contratos versionados ou fallback explicito.
- Evals de `planner` e `critic` existem e passam.
- Metricas basicas aparecem em testes ou artefatos sem exigir migration inicial.
- Docs explicam como adicionar/revisar skills de role e como usar ECC como
  referencia segura.
