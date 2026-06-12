# Self-correction Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No runner, validar o código gerado ANTES de pushar e, se a validação falhar, corrigir e revalidar até passar ou esgotar `AGENT_MAX_FIX_ATTEMPTS` (default 2) — pushando o estado final uma vez.

**Architecture:** Loop vive inteiro no `apps/worker-code` (`runJob` + `codegen`), grafo LangGraph intacto. Fix dirigido: relê os arquivos que o coder tocou + o erro do comando que falhou e pede a versão corrigida (mesmo schema JSON). `fixAttempts` volta no `JobResult` e é exibido no Linear.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Vitest, zod, LiteLLM (`strong_coder`).

**Referência:** spec `docs/superpowers/specs/2026-06-12-self-correction-loop-design.md`.

---

## File Structure

**Modificar:**
- `apps/worker-code/src/env.ts` — env `AGENT_MAX_FIX_ATTEMPTS`.
- `apps/worker-code/src/types.ts` — `JobResult.fixAttempts`.
- `apps/worker-code/src/executor/codegen.ts` — helper `applyFiles`, `FIX_PROMPT`, `applyFix`.
- `apps/worker-code/src/executor/runJob.ts` — `summarizeFailureTail`, `runValidation`, reestrutura o fluxo com plano.
- `packages/graph/src/state.ts` — `fixAttempts`.
- `packages/graph/src/nodes/coder.ts` — lê `fixAttempts`, surface no comentário + state.
- `packages/graph/src/nodes/report.ts` — linha de auto-correção no report.

**Criar:**
- `apps/worker-code/src/executor/runJob.test.ts` — testes de `summarizeFailureTail`.

---

## Task 1: Env + tipo `fixAttempts`

**Files:**
- Modify: `apps/worker-code/src/env.ts`
- Modify: `apps/worker-code/src/types.ts`

- [ ] **Step 1: Adicionar a env** — em `apps/worker-code/src/env.ts`, dentro do `envSchema` (depois do bloco `AGENT_COMMAND_ALLOWLIST`, antes do `})`):

```ts
  // Self-correction: máximo de tentativas de fix após falha de validação.
  AGENT_MAX_FIX_ATTEMPTS: z.coerce.number().default(2),
```

- [ ] **Step 2: Adicionar o campo no `JobResult`** — em `apps/worker-code/src/types.ts`, dentro de `interface JobResult` (depois de `prTitle?`):

```ts
  /** Quantas correções de auto-fix rodaram após falha de validação (0 = passou de primeira). */
  fixAttempts?: number;
```

- [ ] **Step 3: Build do runner**

Run: `rtk pnpm --filter @agent-platform/worker-code build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/worker-code/src/env.ts apps/worker-code/src/types.ts
rtk git commit -m "feat(worker-code): env AGENT_MAX_FIX_ATTEMPTS + JobResult.fixAttempts (self-correction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `summarizeFailureTail` (TDD)

Helper puro que extrai o erro do primeiro comando que falhou — é o que alimenta o fix.

**Files:**
- Create: `apps/worker-code/src/executor/runJob.test.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`

- [ ] **Step 1: Escrever o teste que falha** — criar `apps/worker-code/src/executor/runJob.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import { summarizeFailureTail } from './runJob.js';

function cmd(command: string, exitCode: number, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 1 };
}

describe('summarizeFailureTail', () => {
  it('retorna vazio quando todos os comandos passaram', () => {
    expect(summarizeFailureTail([cmd('pnpm build', 0)])).toBe('');
  });

  it('extrai o comando e o tail do stderr do primeiro que falhou', () => {
    const out = summarizeFailureTail([
      cmd('pnpm install', 0),
      cmd('pnpm build', 1, 'erro: Cannot find module X'),
      cmd('pnpm test', 1, 'não deveria aparecer'),
    ]);
    expect(out).toBe('$ pnpm build\nerro: Cannot find module X');
  });

  it('cai no stdout quando o stderr está vazio', () => {
    const out = summarizeFailureTail([cmd('pnpm test', 1, '', 'FAIL src/x.test.ts')]);
    expect(out).toBe('$ pnpm test\nFAIL src/x.test.ts');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk vitest run apps/worker-code/src/executor/runJob.test.ts`
Expected: FAIL — `summarizeFailureTail is not exported` / não existe.

- [ ] **Step 3: Implementar** — em `apps/worker-code/src/executor/runJob.ts`, adicionar (perto do topo, após os imports, antes de `runGuarded`):

```ts
/**
 * Tail do primeiro comando que falhou: linha do comando + final do stderr (ou
 * stdout). É o contexto de erro que alimenta o self-correction. Exportado p/ teste.
 */
export function summarizeFailureTail(commands: CommandResult[]): string {
  const failed = commands.find((c) => c.exitCode !== 0);
  if (!failed) return '';
  const tail = (failed.stderr || failed.stdout || '').trim().slice(-1500);
  return `$ ${failed.command}\n${tail}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk vitest run apps/worker-code/src/executor/runJob.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/worker-code/src/executor/runJob.ts apps/worker-code/src/executor/runJob.test.ts
rtk git commit -m "feat(worker-code): summarizeFailureTail p/ alimentar o self-correction (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `applyFiles` + `applyFix` no codegen

Extrai a escrita de arquivos num helper (DRY) e adiciona o fix dirigido.

**Files:**
- Modify: `apps/worker-code/src/executor/codegen.ts`

- [ ] **Step 1: Extrair `applyFiles`** — em `apps/worker-code/src/executor/codegen.ts`, adicionar o helper logo após `readCurrentFiles` (antes de `generateAndApplyCode`):

```ts
/** Escreve os arquivos no worktree e devolve os caminhos aplicados (DRY codegen/fix). */
async function applyFiles(dir: string, files: { path: string; content: string }[]): Promise<string[]> {
  const applied: string[] = [];
  for (const file of files) {
    const full = safeJoin(dir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, 'utf8');
    applied.push(file.path.replace(/^\/+/, ''));
  }
  return applied;
}
```

- [ ] **Step 2: Usar `applyFiles` em `generateAndApplyCode`** — substituir o bloco de escrita (o `const filesChanged: string[] = []; for (const file of parsed.files) { ... }`) por:

```ts
  const filesChanged = await applyFiles(dir, parsed.files);
```

(remove o loop manual `for (const file of parsed.files) { const full = safeJoin... writeFile... filesChanged.push... }`; o restante — checagem `parsed.files.length === 0`, `costUsd`, `return` — fica igual.)

- [ ] **Step 3: Adicionar `FIX_PROMPT`** — junto dos outros prompts (após `GENERATE_PROMPT`):

```ts
const FIX_PROMPT = `Você é um agente de engenharia de software corrigindo uma falha de validação.
Recebe os arquivos que você acabou de escrever e a saída do comando que FALHOU (build/test/lint).
Corrija a CAUSA do erro preservando todo o código correto.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "summary": "o que você corrigiu (1 linha)",
  "files": [ { "path": "caminho/relativo", "content": "conteúdo COMPLETO e final do arquivo corrigido" } ]
}

Regras CRÍTICAS:
- "content" é o arquivo inteiro e final (não um diff/patch).
- Inclua só os arquivos que você precisou alterar para corrigir o erro.
- NÃO adicione dependências/imports que o repositório não tem.
- Não escreva nada fora do JSON.`;
```

- [ ] **Step 4: Adicionar `FixArgs`, `FixResult` e `applyFix`** — após `generateAndApplyCode` (e antes de `worktreeFilePath`):

```ts
export interface FixArgs {
  llm: LlmClient;
  dir: string;
  /** Arquivos que o coder tocou na geração — candidatos a corrigir. */
  filesChanged: string[];
  /** Saída do comando de validação que falhou (de summarizeFailureTail). */
  failureTail: string;
  plan: string;
  title: string;
  log: Logger;
}

export interface FixResult {
  summary: string;
  filesChanged: string[];
  costUsd: number;
}

/**
 * Self-correction (fix dirigido): após uma falha de validação, relê os arquivos
 * que o coder tocou + o erro do comando que falhou e pede a versão corrigida via
 * `strong_coder`. Reaplica no worktree. Não re-seleciona arquivos.
 */
export async function applyFix(args: FixArgs): Promise<FixResult> {
  const { llm, dir, filesChanged, failureTail, plan, title, log } = args;

  // Relê on-disk os arquivos tocados (recém-escritos; arquivos novos podem não
  // estar no git ls-files, então lemos direto, sem filtro de tracking).
  const current: { path: string; content: string }[] = [];
  for (const rel of filesChanged.slice(0, MAX_EDIT_FILES)) {
    try {
      const content = await readFile(safeJoin(dir, rel), 'utf8');
      current.push({ path: rel, content: content.slice(0, MAX_FILE_CHARS) });
    } catch {
      // arquivo sumiu entre escrita e releitura — ignora.
    }
  }
  const currentBlock = current.map((f) => `\n## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n');

  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  log.info({ files: filesChanged.length }, 'requesting fix');
  const parsed = await completeJson(
    llm,
    {
      temperature: 0.1,
      onUsage: (u) => {
        usage.promptTokens += u.promptTokens;
        usage.completionTokens += u.completionTokens;
      },
      messages: [
        { role: 'system', content: FIX_PROMPT },
        {
          role: 'user',
          content: [
            `# Issue: ${title}`,
            `\n# Plano aprovado\n${plan}`,
            `\n# Arquivos que você escreveu${currentBlock || '\n(nenhum)'}`,
            `\n# Saída do comando que FALHOU\n\`\`\`\n${failureTail}\n\`\`\``,
          ].join('\n'),
        },
      ],
    },
    responseSchema,
    log,
  );

  const applied = await applyFiles(dir, parsed.files);
  const costUsd = estimateCostUsd('strong_coder', usage);
  log.info({ filesChanged: applied, costUsd }, 'applied fix');
  return { summary: parsed.summary, filesChanged: applied, costUsd };
}
```

> Tudo reusa imports já presentes no arquivo (`readFile`, `mkdir`, `writeFile`, `dirname`, `safeJoin`, `completeJson`, `responseSchema`, `estimateCostUsd`, `TokenUsage`, `LlmClient`, `Logger`, `MAX_EDIT_FILES`, `MAX_FILE_CHARS`). Não adicione imports novos.

- [ ] **Step 5: Build do runner**

Run: `rtk pnpm --filter @agent-platform/worker-code build`
Expected: PASS.

- [ ] **Step 6: Suite (codegen.test.ts não regrediu)**

Run: `rtk vitest run`
Expected: PASS — 44 testes (41 + 3 do summarizeFailureTail).

- [ ] **Step 7: Commit**

```bash
rtk git add apps/worker-code/src/executor/codegen.ts
rtk git commit -m "feat(worker-code): applyFix (fix dirigido) + applyFiles helper (self-correction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Loop de validação/fix no `runJob`

Reestrutura a branch-com-plano: valida antes de pushar, corrige em loop, pusha o estado final uma vez.

**Files:**
- Modify: `apps/worker-code/src/executor/runJob.ts`

- [ ] **Step 1: Importar `applyFix` e `env`** — em `apps/worker-code/src/executor/runJob.ts`, no import do codegen, adicionar `applyFix`:

```ts
import { applyFix, generateAndApplyCode } from './codegen.js';
```

(`env` já está importado de `../env.js`.)

- [ ] **Step 2: Adicionar o helper `runValidation`** — após `runGuarded` (e após `summarizeFailureTail` da Task 2):

```ts
/**
 * Roda os comandos de validação no worktree. Para no primeiro que falhar (build
 * quebrado → não adianta testar). Devolve se passou tudo + o tail do erro p/ o fix.
 */
async function runValidation(
  cmds: string[],
  dir: string,
  log: Logger,
): Promise<{ passed: boolean; results: CommandResult[]; failureTail: string }> {
  const results: CommandResult[] = [];
  for (const cmd of cmds) {
    log.info({ cmd }, 'running validation command');
    const result = await runGuarded(cmd, dir, log);
    results.push(result);
    if (result.exitCode !== 0) {
      log.warn({ cmd, exitCode: result.exitCode }, 'validation failed');
      break;
    }
  }
  const passed = results.length === cmds.length && results.every((c) => c.exitCode === 0);
  return { passed, results, failureTail: summarizeFailureTail(results) };
}
```

- [ ] **Step 3: Reescrever o bloco com plano** — substituir TODO o corpo do `if (job.plan.trim()) { ... }` (da chamada `generateAndApplyCode` até o `return { ...base, status: 'succeeded' };` desse bloco) por:

```ts
    if (job.plan.trim()) {
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan: job.plan,
        lessons: job.lessons,
        log,
      });
      base.summary = gen.summary;
      base.filesChanged = gen.filesChanged;
      base.costUsd = gen.costUsd;
      base.prTitle = gen.prTitle;

      // Self-correction (fix intra-run): valida no worktree; se falhar, corrige e
      // revalida até passar ou esgotar AGENT_MAX_FIX_ATTEMPTS. Pusha o estado final
      // uma vez (best-effort mesmo se ainda falhar — humano decide no PR).
      let validation = await runValidation(job.commands, dir, log);
      let fixAttempts = 0;
      while (!validation.passed && fixAttempts < env.AGENT_MAX_FIX_ATTEMPTS) {
        fixAttempts++;
        log.info({ attempt: fixAttempts }, 'validação falhou — tentando corrigir');
        try {
          const fix = await applyFix({
            llm,
            dir,
            filesChanged: gen.filesChanged,
            failureTail: validation.failureTail,
            plan: job.plan,
            title: job.title,
            log,
          });
          base.costUsd = (base.costUsd ?? 0) + fix.costUsd;
        } catch (err) {
          log.warn({ err, attempt: fixAttempts }, 'fix falhou — encerrando o loop');
          break;
        }
        validation = await runValidation(job.commands, dir, log);
      }
      base.fixAttempts = fixAttempts;

      // Commit do estado final + push único.
      const message = buildCommitMessage(job, gen.prTitle, gen.summary);
      const commit = await commitAll(dir, message);
      if (!commit.committed) {
        throw new Error('geração de código não produziu mudanças commitáveis');
      }
      base.commitSha = commit.sha;
      base.diff = await diffAgainst(dir, job.baseBranch);
      await pushBranch(dir, job.branch);
      base.pushed = true;
      log.info({ commitSha: commit.sha, branch: job.branch, fixAttempts }, 'pushed branch');

      for (const r of validation.results) commands.push(r);
      base.testsPassed = validation.passed;
      log.info({ testsPassed: validation.passed, fixAttempts }, 'validation finished');

      return { ...base, status: 'succeeded' };
    }
```

> `commands` é o array do topo de `runJob` (já referenciado por `base.commands` na criação do `base`), então dar `push` nos resultados finais atualiza `base.commands`. A branch SEM plano (validação de infra fatal) abaixo fica inalterada.

- [ ] **Step 4: Build do runner**

Run: `rtk pnpm --filter @agent-platform/worker-code build`
Expected: PASS.

- [ ] **Step 5: Suite completa**

Run: `rtk vitest run`
Expected: PASS — 44 testes.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/worker-code/src/executor/runJob.ts
rtk git commit -m "feat(worker-code): loop de validação/fix antes do push (self-correction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Surface `fixAttempts` no grafo

**Files:**
- Modify: `packages/graph/src/state.ts`
- Modify: `packages/graph/src/nodes/coder.ts`
- Modify: `packages/graph/src/nodes/report.ts`

- [ ] **Step 1: Campo no state** — em `packages/graph/src/state.ts`, dentro do `Annotation.Root({...})` (após `testSummary`):

```ts
  /** Quantas correções de auto-fix rodaram no runner (0 = passou de primeira). */
  fixAttempts: Annotation<number>(),
```

- [ ] **Step 2: Ler `fixAttempts` no coder** — em `packages/graph/src/nodes/coder.ts`:

(a) No `interface RunnerResult`, adicionar (após `prTitle?`):

```ts
  fixAttempts?: number;
```

(b) No comentário "🤖 Execução" — montar uma linha de auto-correção. Logo após a linha `const testsBlock = ...`, adicionar:

```ts
      const fixBlock =
        result.fixAttempts && result.fixAttempts > 0
          ? `\n\n🔧 Auto-correção: ${result.fixAttempts} tentativa(s) antes da validação final.`
          : '';
```

E incluir `${fixBlock}` no template do comentário, logo após `${testsBlock}` (antes de `${errorBlock}`):

```ts
      await deps.linear.comment(
        state.issueId,
        `## 🤖 Execução\nBranch \`${branch}\` — runner: **${result.status}**.` +
          `${result.summary ? `\n\n${result.summary}` : ''}${files}${testsBlock}${fixBlock}${errorBlock}`,
      );
```

(c) Propagar ao state — no objeto de retorno de sucesso (junto de `testsPassed`, `testSummary`):

```ts
        fixAttempts: result.fixAttempts,
```

- [ ] **Step 3: Linha no report** — em `packages/graph/src/nodes/report.ts`, dentro do bloco `if (state.pushed) { ... }` (após a linha de Validação):

```ts
      if (state.fixAttempts && state.fixAttempts > 0) {
        lines.push(`**Auto-correção:** ${state.fixAttempts} tentativa(s)`);
      }
```

- [ ] **Step 4: Build do graph + orchestrator**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 5: Suite (coder.test.ts / report.test.ts não regrediram)**

Run: `rtk vitest run`
Expected: PASS — 44 testes.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/graph/src/state.ts packages/graph/src/nodes/coder.ts packages/graph/src/nodes/report.ts
rtk git commit -m "feat(graph): exibe fixAttempts da auto-correção no Linear/report (self-correction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificação final + docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Build + testes do monorepo**

Run: `rtk pnpm -r build && rtk vitest run`
Expected: build de todos os pacotes PASS; 44 testes PASS.

- [ ] **Step 2: Anotar no `docs/ARCHITECTURE.md`** — na tabela §3, na linha do Sandbox/Test Runner (MAC-28/29), acrescentar a menção ao self-correction. Trocar o conteúdo da coluna "Local no repo" / "Estado" dessa linha para refletir:

```
| Sandbox Executor / Test Runner / Self-correction | MAC-28/29 (+fix loop) | `apps/worker-code` (runJob + allowlist + applyFix) | ✅ (valida antes de pushar; corrige até AGENT_MAX_FIX_ATTEMPTS) |
```

- [ ] **Step 3: Commit + push**

```bash
rtk git add docs/ARCHITECTURE.md
rtk git commit -m "docs(architecture): registra self-correction loop no runner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
rtk git push
```

---

## Deploy + validação em prod (pós-merge, host Proxmox — o usuário roda)

1. **Redeploy `runners`** (`bash infra/deploy/deploy.sh runners`) — o loop vive só no runner; orchestrator opcional (só pra exibir `fixAttempts` no report → redeploy também se quiser a linha no Linear).
2. **E2E:** disparar uma issue cujo codegen tende a quebrar a validação (ex.: que mexa em tipos). Observar nos logs do runner `validação falhou — tentando corrigir` → `requesting fix` → revalidação. Conferir no Linear o bloco `🔧 Auto-correção: N tentativa(s)`.
3. **Sinal correto:** se o fix resolver, PR sai com validação ✅ e `fixAttempts > 0`. Se não, PR best-effort com ❌ + lição capturada (MAC-23).

---

## Self-Review

**Spec coverage:**
- Gatilho validação-only, runner-level → Tasks 2/4. ✅
- Validar antes de pushar + push único → Task 4 (reestruturação). ✅
- Cap `AGENT_MAX_FIX_ATTEMPTS` default 2, para na 1ª que passa → Tasks 1/4 (`while !passed && < cap`). ✅
- Fix dirigido (filesChanged + failureTail, mesmo schema) → Task 3 (`applyFix`). ✅
- Retries esgotados → push + PR best-effort → Task 4 (push fora do loop, sempre). ✅
- Error handling `applyFix` não-fatal (break loop) → Task 4 (try/catch). ✅
- Interação cost guard (soma costUsd) → Task 4 (`base.costUsd += fix.costUsd`). ✅
- Interação memory (falha final → lição) → sem mudança necessária (worker.ts já captura por `testsPassed===false`). ✅
- `fixAttempts` no JobResult + surface → Tasks 1/5. ✅
- Teste `summarizeFailureTail` → Task 2. ✅

**Placeholder scan:** nenhum TODO/TBD; todo passo com código real e comando + expected.

**Type consistency:** `fixAttempts` consistente (`JobResult` Task 1, `RunnerResult` Task 5, `state` Task 5). `applyFix`/`FixArgs`/`FixResult` definidos na Task 3 e usados na Task 4 com os mesmos campos (`llm, dir, filesChanged, failureTail, plan, title, log` → `{summary, filesChanged, costUsd}`). `summarizeFailureTail` exportado na Task 2, usado por `runValidation` na Task 4. `applyFiles` definido e usado na Task 3. `runValidation` retorna `{passed, results, failureTail}` consumido na Task 4.

**Desvio consciente vs comportamento atual:** `runValidation` PARA no primeiro comando que falha (antes rodava todos). Intencional — não desperdiça ~2min de teste sobre build quebrado e dá um `failureTail` focado. Green path inalterado (roda todos, passa todos).
