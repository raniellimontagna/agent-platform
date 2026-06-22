# Agent Roles Pipeline Design

## Contexto

O catalogo atual mostra `coder-agent v1` como um agente ativo, mas sua descricao
representa o pipeline inteiro:

`planner -> coder -> reviewing -> revising -> pr -> report`

Na pratica, o sistema ja executa papeis diferentes dentro do LangGraph:

- `planning`: gera plano com alias LLM `research`.
- `coding` e `revising`: despacham jobs para o runner com contexto de plano,
  lessons e feedback de revisao.
- `reviewing`: revisa o diff com alias `critic` e decide se volta para revisao.
- `pr`, `merging`, `cloudflareDeploy` e `report`: fazem operacoes de entrega.

Esse desenho funciona, mas o catalogo mistura duas ideias: o agente como pipeline
de entrega e os papeis especializados que atuam em cada etapa. Isso dificulta
evoluir prompts, modelos, skills, limites, observabilidade e evals por etapa.

## Objetivo

Separar conceitualmente o agente de pipeline das roles internas sem quebrar o
LangGraph atual.

A primeira entrega deve tornar o modelo explicito e configuravel o suficiente para
evoluir qualidade por etapa, mantendo a execucao existente estavel.

## Nao Objetivos

- Nao dividir cada etapa em um servico ou runtime separado nesta fase.
- Nao trocar o checkpointer, fila, worker manager ou fluxo de aprovacao.
- Nao mudar o comportamento funcional de Plane, GitHub, PR, auto-merge ou deploy.
- Nao criar workflows arbitrarios configuraveis pelo usuario.

## Abordagem Recomendada

Manter o LangGraph atual como unidade de execucao e introduzir `agent roles` como
contrato de catalogo/configuracao.

O agente hoje chamado de `coder-agent` deve passar a ser tratado como um pipeline
de entrega de software. Um nome mais correto para versoes futuras seria:

- `software-delivery-pipeline`
- ou `engineering-pipeline-agent`

Esse pipeline declara quais roles usa e cada role passa a poder ter metadados
proprios.

## Roles Iniciais

### Planner

Responsavel por entender o card, produzir o plano, declarar escopo, riscos,
validacao e `APPROVAL_REASONS`.

Configuracoes futuras:

- alias/modelo LLM;
- prompt versionado;
- max tokens/custo;
- regras de qualidade de plano;
- evals de plano.

### Coder

Responsavel por aplicar o plano no runner, gerar diff, rodar validacoes, corrigir
falhas locais e produzir resumo de execucao.

Configuracoes futuras:

- alias/modelo LLM;
- skills injetadas;
- allowlist de comandos;
- max fix attempts;
- politicas por tipo de agente especializado.

### Critic

Responsavel por revisar diff, validar aderencia ao plano, classificar veredito e
decidir se o fluxo volta para `coder`.

Configuracoes futuras:

- alias/modelo LLM;
- prompt versionado;
- temperatura baixa;
- max review rounds;
- criterio de ressalvas operacionais;
- evals de revisao.

### PR / Release

Responsavel por abrir PR, decidir auto-merge e acionar passos pos-merge quando
permitido.

Configuracoes futuras:

- politicas de auto-merge por pipeline;
- gates por branch/repo;
- permissao de deploy automatico;
- mensagens padronizadas de PR.

### Reporter

Responsavel por consolidar o resultado final no Plane com status, branch, PR,
validacao, critic rounds, custo e erro.

Configuracoes futuras:

- formato de comentario por provider;
- nivel de detalhe;
- links para logs/artifacts;
- resumo orientado a proxima acao.

## Modelo de Configuracao

Adicionar um contrato declarativo para roles associadas a um pipeline. O formato
exato pode ser definido na implementacao, mas deve suportar este shape conceitual:

```json
{
  "key": "software-delivery-pipeline",
  "version": "v1",
  "description": "Pipeline de entrega de software com planejamento, execucao, revisao e PR.",
  "capabilities": ["typescript", "node", "hono", "feature", "bugfix", "refactor", "single-repo"],
  "roles": [
    {
      "key": "planner",
      "description": "Gera plano e approval reasons.",
      "modelAlias": "research",
      "skills": []
    },
    {
      "key": "coder",
      "description": "Aplica plano no runner e valida mudancas.",
      "modelAlias": "strong_coder",
      "skills": []
    },
    {
      "key": "critic",
      "description": "Revisa diff e decide recode ou PR.",
      "modelAlias": "critic",
      "skills": []
    },
    {
      "key": "pr",
      "description": "Abre PR e avalia auto-merge.",
      "modelAlias": null,
      "skills": []
    },
    {
      "key": "reporter",
      "description": "Publica resumo final no card.",
      "modelAlias": null,
      "skills": []
    }
  ]
}
```

Na primeira implementacao, esses metadados podem ser usados apenas para catalogo,
registry UI, logs e evals. O grafo continua chamando os mesmos nodes.

## Fluxo de Dados

O fluxo atual permanece:

1. Plane adiciona `ai-ready`.
2. Orchestrator cria run e escolhe o pipeline pelo label do card.
3. `planner` gera o plano e pausa para aprovacao.
4. `coder` executa no runner depois de aprovado.
5. `critic` revisa diff e pode pedir uma ou mais voltas de `coder`.
6. `pr` abre PR e aplica politica de auto-merge quando permitido.
7. `reporter` comenta o resultado final.

A mudanca e que cada etapa passa a ser nomeada, configuravel e mensuravel como
role do pipeline.

## Observabilidade

Cada run deve poder responder:

- qual pipeline foi usado;
- quais roles participaram;
- qual alias/modelo cada role usou quando aplicavel;
- custo por role;
- duracao por role;
- quantas voltas o critic exigiu;
- qual role produziu erro ou bloqueio.

Na primeira fase, os campos existentes de custo e status podem continuar iguais.
O ganho minimo esperado e expor roles no catalogo e padronizar logs/relatorios por
role quando o codigo tocar nesses nodes.

## Testes e Evals

A evolucao deve priorizar testes que protejam o comportamento atual:

- seed/catalogo registra pipeline e roles sem duplicar agentes existentes;
- registry renderiza pipeline e roles de forma legivel;
- selecao por label continua resolvendo o pipeline correto;
- LangGraph continua com os mesmos edges e interrupt antes de `coding`;
- eval harness consegue associar checks a `planner`, `coder` e `critic`.

Evals futuros recomendados:

- qualidade minima de plano;
- critic reprova diff com bug real;
- critic aprova no-op seguro;
- coder endereca feedback do critic sem mexer em arquivos fora do escopo;
- auto-merge continua bloqueado quando a ressalva nao e operacional.

## Riscos

- Separar fisicamente cedo demais pode duplicar estado e dificultar debug.
- Renomear `coder-agent` sem compatibilidade pode quebrar labels existentes.
- Configuracao excessiva pode virar complexidade sem ganho operacional.
- Registry/UI pode sugerir isolamento real antes de ele existir.

## Decisoes

- Manter execucao fisica no LangGraph atual.
- Introduzir roles como camada de catalogo/configuracao primeiro.
- Preservar compatibilidade com `coder-agent` e labels atuais.
- Tratar `software-delivery-pipeline` como evolucao conceitual do agente atual,
  nao como ruptura imediata.

## Criterios de Aceite

- Existe uma spec aprovada para pipeline com roles.
- A implementacao futura consegue ser planejada em passos pequenos.
- O comportamento atual de runs nao precisa mudar na primeira fase.
- A arquitetura abre caminho para configurar e medir planner, coder e critic
  separadamente.
