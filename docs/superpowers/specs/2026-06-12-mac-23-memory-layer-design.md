# MAC-23 — Memory Layer (feedback learning)

> Spec de design. Data: 2026-06-12. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.

## Problema

Hoje todo run do agente começa frio. O Context Builder (MAC-24) injeta convenções
(`CLAUDE.md`) e arquivos-exemplo vizinhos *por run*, mas não há aprendizado *entre*
runs. Quando o agente comete um erro que o critic reprova ou que quebra a validação
no sandbox, nada impede que ele repita o mesmo erro no próximo run do mesmo repo.

O Memory Layer fecha esse loop de qualidade: captura a lição de cada falha e a
reinjeta nos runs futuros do mesmo repositório.

## Escopo do MVP

**Foco único:** aprendizado por feedback. Quando um run falha por:

- **critic REPROVA** (veredito do nó `reviewing` = REPROVADO), ou
- **validação falha** (sandbox `install`/`build`/`test` com exit != 0),

o sistema destila a falha numa **lição** curta e reutilizável, guardada por repo.
Runs futuros do mesmo repo recebem as lições no prompt do codegen.

**Fora do MVP (YAGNI):**

- Embeddings / pgvector / retrieval por similaridade.
- Match por categoria/tag (a coluna `category` existe nullable para evoluir depois,
  mas não é usada no retrieval do MVP — injeta todas as lições do repo, capadas).
- Webhook do GitHub (PR fechado sem merge como sinal).
- Captura de texto de rejeição humana.

## Fronteira vs. tabelas existentes

| Tabela | Papel | Realimenta prompt? |
|---|---|---|
| `run_steps` (MAC-36) | Telemetria bruta por etapa: tempo, custo, status. | Não |
| `lessons` (nova) | Conhecimento **destilado, cross-run, por repo**. | Sim |

Sem overlap: `run_steps` registra o que aconteceu; `lessons` é conhecimento
acionável reinjetado.

## Dataflow

```
RUN N (falha)                          RUN N+1 (mesmo repo)
  reviewing: critic REPROVA   ┐          coder node:
  sandbox: build/test ❌      ┘            loadLessons(repo, cap=10)
        ↓                                       ↓ job payload.lessons[]
  [WRITE] worker.ts pós-invoke            runner codegen.ts:
    distillLesson(cheap_fast)               injeta bloco
    → "Não faça X porque Y"                 "# Lições de runs anteriores"
    → saveLesson(repo, ...)                      ↓
        ↓                                  strong_coder evita o erro
   Postgres: lessons
```

## Componentes

### `packages/memory` (puro, DB-agnóstico, testável)

Lógica de domínio sem dependência de Postgres. Recebe um `LessonStore` por injeção.

- **Tipo `Lesson`**

  ```ts
  interface Lesson {
    id: string;
    repo: string;              // owner/name
    source: 'critic' | 'validation';
    category?: string | null;  // reservado p/ evolução (não usado no retrieval do MVP)
    text: string;              // a lição destilada, uma linha/frase
    runId: string;
    createdAt: Date;
  }
  ```

- **`distillLesson(llm, input) → Promise<string | null>`**

  Uma chamada ao alias `cheap_fast`. Recebe o contexto da falha
  (`source`, `verdict`/`review` para critic, `testSummary` para validação) e
  devolve uma regra curta e acionável no formato "Não faça X porque Y", ou `null`
  se não houver lição acionável (falha genérica/ambiente). Temperatura baixa.

- **`formatLessons(lessons, cap) → string`**

  Monta o bloco de prompt a partir das lições. Dedup textual leve (normaliza e
  remove repetidas/quase-iguais) + cap nas `cap` mais recentes (default 10).
  Retorna string vazia se não houver lições.

- **Interface `LessonStore`**

  ```ts
  interface LessonStore {
    save(lesson: Omit<Lesson, 'id' | 'createdAt'>): Promise<void>;
    list(repo: string, limit: number): Promise<Lesson[]>;
  }
  ```

### `apps/orchestrator-api`

- **Migration `lessons`**: `id` (uuid), `repo` (text), `source` (text),
  `category` (text null), `text` (text), `run_id` (text), `created_at` (timestamptz
  default now). Index em `repo`.

- **`lessons.ts`**: `saveLesson` / `listLessons(repo, limit)` — implementação do
  `LessonStore` sobre o Postgres do orchestrator (mesmo pool de `runs.ts`).

- **WRITE — em `worker.ts`, pós `graph.invoke`**: lê o `result` (estado final do
  grafo, que já contém `review`, `testsPassed`, `testSummary`). Se
  `reproved || testsPassed === false`, chama `distillLesson(cheap_fast, ...)` e,
  se não-nulo, `saveLesson`. Co-localizado com `recordStep`/cost guard, que já são
  os side-effects de fim de run. **Não altera a topologia do LangGraph.**
  `repo` derivado da config do runner (`repoUrl` → `owner/name`, reusa
  `parseRepoRef` de `@agent-platform/github`).

- **READ — em `coder.ts` (`packages/graph`)**: `CoderDeps` ganha
  `loadLessons: (repo: string) => Promise<string[]>`. Antes do `fetch` do job,
  chama `loadLessons(repo)` e adiciona `lessons` ao body. Wired em `agent.ts`
  (orchestrator) para `listLessons(repo, 10)` formatado via `formatLessons`.

- **Endpoint `GET /lessons?repo=`**: lista as lições de um repo (auditoria/dogfood).

### `apps/worker-code`

- `runJob`/`codegen.ts` aceitam `lessons?: string[]` no payload do job.
- `codegen.ts` (`GENERATE_PROMPT`, passo 2) ganha um bloco novo, junto aos blocos
  de convenções/exemplos: `"# Lições de runs anteriores (evite repetir)\n..."`,
  só quando há lições.

## Decisões

- **WRITE em `worker.ts` (não em nó `learn`)**: evita mudar a topologia do grafo
  e o checkpointer; capture é side-effect do fim do run, junto de `recordStep`.
  Um nó `learn` seria mais idiomático mas adiciona wiring desnecessário no MVP.
- **Retrieval por repo, global + cap (não embeddings)**: simples e efetivo em
  baixo volume. Embeddings ficam para a Fase 7.
- **Destilação por LLM (`cheap_fast`, não raw)**: mantém o bloco injetado pequeno
  e alto-sinal. Custo ~$0.001/falha, irrelevante.

## Custo

Destilação usa `cheap_fast` (Verboo deepseek-flash) — centavos. Pode ser
contabilizada no custo do run depois; não bloqueante no MVP.

## Testes (segue padrão vitest atual)

- `distillLesson` com `llm` mockado (retorna regra; retorna `null` quando vazio).
- `formatLessons`: dedup e cap.
- `LessonStore` exercitado por um store fake (round-trip save/list, ordem recente).

Meta: ~3 testes novos, somando ao total atual (34).

## Não-objetivos

- Não substitui o Context Builder (MAC-24) — complementa.
- Não introduz vector store nem novo serviço de infra.
- Não captura sinais que exijam infra nova (GitHub webhook, rejeição humana com texto).
