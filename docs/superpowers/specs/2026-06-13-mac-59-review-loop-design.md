# Loop de revisão pelo critic — auto-revisão de qualidade (design)

> Spec de design. Data: 2026-06-13. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-59 (Fase 6 — Runtime e Governança).

## Problema

O critic (nó `reviewing`, MAC-18) é **informativo e não-bloqueante**: comenta o
parecer no Linear, cola o veredito no corpo do Draft PR e segue direto pro nó `pr`.
O agente **não age** nas ressalvas nem na reprovação — quem aplica as correções é o
humano (ex.: MAC-58, a ressalva do `parseInt` foi corrigida à mão no merge).

Isso deixa o eixo de qualidade **subjetivo** descoberto. O self-correction
(MAC-54) só conserta falha de **validação** (build/test — eixo objetivo, dentro do
job, no runner). Reagir ao parecer do critic é **graph-level** e foi deliberadamente
adiado no brainstorm do MAC-54.

Este loop fecha o eixo subjetivo: quando o critic aponta algo acionável,
realimenta o coder → re-revisa, com teto, antes de finalizar o PR.

## Decisões (do brainstorm)

1. **Gatilho:** dispara quando o veredito ≠ `APROVADO` seco — ou seja, tanto
   `REPROVADO` quanto `APROVADO COM RESSALVAS` realimentam o coder. Decisão
   consciente do usuário (quer que passe nas ressalvas), contrabalançada pelo teto
   baixo + guarda de no-progress pra não super-iterar em nits.
2. **Teto:** `AGENT_MAX_REVIEW_ROUNDS` (env do orchestrator, default **1**). Segue o
   padrão dos outros tetos (`AGENT_MAX_FIX_ATTEMPTS`, cost guard) — flexível sem
   redeploy de código.
3. **Estratégia incremental:** ao voltar pro coder, o runner **clona a branch de
   trabalho** (que já tem o código da passada anterior) e o codegen 2-passos corrige
   **em cima do existente** com o parecer do critic no prompt. Preserva o que estava
   bom, mexe só no apontado. Análogo ao `applyFix`/`FIX_PROMPT` do self-correction,
   mas guiado por review em vez de erro de build. Diff e validação continuam **vs
   `main`**.
4. **Parada (qualquer uma):**
   - veredito vira `APROVADO` seco;
   - atinge `AGENT_MAX_REVIEW_ROUNDS`;
   - **guarda de no-progress**: o parecer da volta N não melhorou vs N-1 (mesmo
     veredito e conteúdo essencialmente igual) → para;
   - **cost guard** (MAC-40): custo acumulado do run ≥ `AGENT_MAX_COST_PER_RUN_USD`
     → não inicia volta nova.
   Ao parar sem `APROVADO` seco, abre o PR **best-effort** (o parecer continua
   anotado pra revisão humana decidir). Não regride o comportamento "sempre abre PR".

## Topologia do grafo

Hoje:

```
START → planning → [⏸ aprovação] → coding → reviewing → pr → report → END
```

Novo — `reviewing` ganha aresta condicional de volta pra `coding`:

```
coding → reviewing → [precisa revisar? E rounds < teto? E cost OK? E houve progresso?]
                        ├── sim → coding   (modo revisão, incremental)
                        └── não → pr
```

- A aresta `coding → conditional(failed ? report : reviewing)` permanece.
- A aresta fixa `reviewing → pr` vira `addConditionalEdges('reviewing', ...)` com
  destinos `coding` | `pr`.
- `interruptBefore: ['coding']` (aprovação humana, MAC-22) **permanece**. A
  re-entrada em `coding` pelo loop **não deve re-interromper** — a aprovação já foi
  resolvida. Verificar o comportamento do `interruptBefore` em re-entradas; se
  reinterromper, tratar (ex.: a decisão de retomar já vem do resume; ou usar guarda
  no estado pra distinguir 1ª entrada de re-entrada). **Ponto de atenção da
  implementação** — validar no plano.

## Estado novo (`packages/graph/src/state.ts`)

- `reviewRounds: Annotation<number>` — voltas de review já feitas. Reducer **soma**
  (default 0). Decrementa nada; só cresce.
- `lastVerdict: Annotation<string>` — veredito da volta anterior (guarda de
  no-progress).
- `lastReview: Annotation<string>` — parecer da volta anterior (comparação de
  conteúdo do guarda de no-progress).
- `reviewFeedback: Annotation<string>` — parecer atual injetado no próximo job de
  revisão (o coder lê quando `reviewRounds > 0`).

**Fix de custo (necessário):** `codeCostUsd` e `reviewCostUsd` hoje são
last-write-wins. Com o loop, o coder e o review rodam várias vezes — precisam
**acumular** (Annotation com reducer de soma) senão o cost guard e o `report`
subestimam o custo do run. Ajustar os dois campos pra somar.

## Modo revisão no coder (`packages/graph/src/nodes/coder.ts`)

- Se `state.reviewRounds > 0`: monta o job de revisão — mesma `branch` (re-push
  fast-forward), envia `reviewFeedback` (o parecer do critic) + flag de modo
  revisão (ex.: `mode: 'revise'` ou `reviseBranch: <branch>`).
- Se `state.reviewRounds === 0`: comportamento atual (job inicial a partir do plano).
- Comentário no Linear ganha sufixo `(revisão N)` quando `reviewRounds > 0`.

## Modo revisão no runner (`apps/worker-code/src/executor/`)

- `runJob` aceita os campos novos do job (`reviewFeedback`, modo revisão).
- Em modo revisão: `prepareWorktree` clona a **branch de trabalho** (em vez de
  `main`) — assim os arquivos da passada anterior estão presentes e o codegen
  2-passos corrige em cima deles. O cálculo de diff e a validação continuam **vs
  `main`** (a base do PR não muda).
- O `GENERATE_PROMPT` (passo 2 do codegen) recebe um bloco com o parecer do critic
  ("# Parecer da revisão a endereçar"), análogo ao bloco de lições (MAC-23) e ao
  `FIX_PROMPT` (MAC-54).
- Self-correction (MAC-54) continua rodando dentro do job de revisão (valida antes
  de pushar; corrige falha de build/test). Re-push uma vez o estado final.

## Nó `reviewing` (`packages/graph/src/nodes/review.ts`)

- Continua produzindo o parecer + comentando no Linear (como hoje).
- Passa a **decidir o roteamento**: extrai o veredito (`verdictOf`, já exportado do
  pacote), grava `review`/`lastVerdict`/`reviewFeedback`, incrementa o gatilho de
  decisão.
- A função de decisão da aresta condicional avalia: veredito ≠ APROVADO seco **E**
  `reviewRounds < AGENT_MAX_REVIEW_ROUNDS` **E** cost guard OK **E** houve progresso
  (guarda de no-progress) → `coding`; senão → `pr`.

## Interações

- **Self-correction (MAC-54):** dentro do job (build/test antes do push). O loop de
  review é *em volta* (grafo). Um run pode: code → self-correct → critic → revisa →
  re-code → self-correct → re-review.
- **Cost guard (MAC-40):** custo acumulado por volta (graças ao fix dos reducers);
  corta o loop se estourar o teto por run.
- **Memory (MAC-23):** sem mudança de wiring. Se o run terminar reprovado/validação
  ❌ após esgotar o loop, a lição é capturada como hoje (worker.ts keya no estado
  final).
- **Checkpointer (MAC-34):** `reviewRounds` e os campos novos persistem no
  checkpoint; re-entrada em `coding` é natural no LangGraph.

## Observabilidade

- Cada volta posta os comentários `🤖 Execução` + `🔎 Revisão` já existentes, com
  sufixo `(revisão N)` pra rastrear.
- `report` final menciona quantas voltas de review rodaram (análogo ao
  `🔧 Auto-correção: N`).

## Escopo / não-objetivos

- Teto baixo (default 1) — não vira ferramenta de polimento infinito.
- Não bloqueia PR pra sempre — best-effort ao esgotar.
- **Fora do MVP (follow-up):** coluna `review_rounds` em `runs` + painel Grafana
  (análogo a `fix_attempts`). Decidido com o usuário — não inchar o escopo agora.
- Não re-introduzir codegen do zero (a estratégia é incremental por decisão).

## Testes

- `reviewing` decision function: APROVADO seco → `pr`; REPROVADO com rounds<cap →
  `coding`; REPROVADO com rounds==cap → `pr`; no-progress (parecer igual) → `pr`;
  cost estourado → `pr`.
- `verdictOf` já tem testes (MAC-21); reusar.
- Reducers de custo somam ao longo de múltiplas escritas.
- Runner: modo revisão clona a branch de trabalho e injeta o parecer no prompt
  (teste de construção do job/prompt, padrão do repo).

## Arquivos prováveis (confirmar no plano)

- `packages/graph/src/state.ts` — estado novo + reducers de custo.
- `packages/graph/src/build.ts` — aresta condicional `reviewing → coding|pr` + env.
- `packages/graph/src/nodes/review.ts` — decisão de roteamento + grava feedback.
- `packages/graph/src/nodes/coder.ts` — modo revisão no job.
- `apps/worker-code/src/executor/runJob.ts` + `codegen.ts` — clone da branch de
  trabalho + bloco de parecer no prompt.
- `apps/worker-code/src/executor/worktree.ts` — clone de branch arbitrária (não só
  base).
- env: `AGENT_MAX_REVIEW_ROUNDS` (orchestrator).
