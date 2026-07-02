# Phase 06: worker-and-eval-hub-refactor - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 41 likely new/modified files
**Analogs found:** 41 / 41

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/worker-code/src/executor/runJob.ts` | service facade/coordinator | request-response | `apps/worker-code/src/executor/runJob.ts` | exact-existing |
| `apps/worker-code/src/executor/jobDispatch.ts` | service | request-response | `apps/worker-code/src/executor/runJob.ts:181` | extracted-inline |
| `apps/worker-code/src/executor/jobValidation.ts` | service | batch | `apps/worker-code/src/executor/runJob.ts:38`, `validation.ts` | extracted-inline |
| `apps/worker-code/src/executor/jobSelfCorrection.ts` | service | batch + file-I/O | `apps/worker-code/src/executor/runJob.ts:294`, `eval/workerDryRun.ts:72` | partial |
| `apps/worker-code/src/executor/jobMedia.ts` | service | file-I/O | `apps/worker-code/src/executor/runJob.ts:60` | extracted-inline |
| `apps/worker-code/src/executor/jobResult.ts` | utility | transform | `apps/worker-code/src/executor/runJob.ts:165`, `runJob.ts:434` | extracted-inline |
| `apps/worker-code/src/executor/runJob.test.ts` | test | request-response | `apps/worker-code/src/executor/runJob.test.ts` | exact-existing |
| `apps/worker-code/src/executor/runJob.seams.test.ts` | test | request-response | `apps/worker-code/src/executor/firecrawlResearch.test.ts`, `playwrightResearch.test.ts` | role-match |
| `apps/worker-code/src/executor/jobValidation.test.ts` | test | batch | `apps/worker-code/src/executor/runJob.test.ts`, `commandPolicy.test.ts` | role-match |
| `apps/worker-code/src/executor/jobSelfCorrection.test.ts` | test | batch + file-I/O | `apps/worker-code/src/eval/workerDryRun.test.ts` | partial |
| `apps/worker-code/src/executor/codegen.ts` | service facade | transform + file-I/O | `apps/worker-code/src/executor/codegen.ts` | exact-existing |
| `apps/worker-code/src/executor/codegenPrompts.ts` | utility | transform | `apps/worker-code/src/executor/codegen.ts:10` | extracted-inline |
| `apps/worker-code/src/executor/codegenJson.ts` | utility | transform | `apps/worker-code/src/executor/codegen.ts:141` | extracted-inline |
| `apps/worker-code/src/executor/codegenFiles.ts` | utility | file-I/O | `apps/worker-code/src/executor/codegen.ts:247` | extracted-inline |
| `apps/worker-code/src/executor/codegenSelection.ts` | utility | transform | `apps/worker-code/src/executor/codegen.ts:380` | extracted-inline |
| `apps/worker-code/src/executor/codegenFixes.ts` | utility | transform | `apps/worker-code/src/executor/codegen.ts:402` | extracted-inline |
| `apps/worker-code/src/executor/codegenJson.test.ts` | test | transform | `apps/worker-code/src/executor/codegen.test.ts:40` | role-match |
| `apps/worker-code/src/executor/codegenFiles.test.ts` | test | file-I/O | `apps/worker-code/src/executor/codegen.test.ts:287` | role-match |
| `apps/worker-code/src/executor/codegenSelection.test.ts` | test | transform | `apps/worker-code/src/executor/codegen.test.ts:156` | role-match |
| `apps/worker-code/src/executor/codegenFixes.test.ts` | test | transform | `apps/worker-code/src/executor/codegen.test.ts:193` | role-match |
| `apps/worker-code/src/executor/firecrawlResearch.ts` | service | request-response | `apps/worker-code/src/executor/firecrawlResearch.ts` | exact-existing |
| `apps/worker-code/src/executor/playwrightResearch.ts` | service | request-response + streaming-ish render | `apps/worker-code/src/executor/playwrightResearch.ts` | exact-existing |
| `apps/worker-code/src/executor/instagramGraphResearch.ts` | service | request-response | `apps/worker-code/src/executor/instagramGraphResearch.ts` | exact-existing |
| `apps/worker-code/src/executor/apifyInstagramResearch.ts` | service | request-response | `apps/worker-code/src/executor/apifyInstagramResearch.ts` | exact-existing |
| `apps/worker-code/src/executor/researchOutput.ts` | utility | transform | `apps/worker-code/src/executor/firecrawlResearch.ts:329`, `playwrightResearch.ts:268` | role-match |
| `apps/worker-code/src/executor/researchInstagram.ts` | utility | transform | `apps/worker-code/src/executor/firecrawlResearch.ts:85`, `apifyInstagramResearch.ts:297` | role-match |
| `apps/worker-code/src/executor/researchOutput.test.ts` | test | transform | `apps/worker-code/src/executor/firecrawlResearch.test.ts:251` | role-match |
| `apps/worker-code/src/executor/firecrawlResearch.test.ts` | test | request-response | `apps/worker-code/src/executor/firecrawlResearch.test.ts` | exact-existing |
| `apps/worker-code/src/executor/playwrightResearch.test.ts` | test | request-response | `apps/worker-code/src/executor/playwrightResearch.test.ts` | exact-existing |
| `apps/worker-code/src/executor/instagramGraphResearch.test.ts` | test | request-response | `apps/worker-code/src/executor/instagramGraphResearch.test.ts` | exact-existing |
| `apps/worker-code/src/executor/apifyInstagramResearch.test.ts` | test | request-response | `apps/worker-code/src/executor/apifyInstagramResearch.test.ts` | exact-existing |
| `apps/worker-code/src/eval/runEval.ts` | CLI facade/coordinator | batch + file-I/O | `apps/worker-code/src/eval/runEval.ts` | exact-existing |
| `apps/worker-code/src/eval/scenarioLoader.ts` | service | file-I/O + transform | `apps/worker-code/src/eval/runEval.ts:154`, `types.ts:363` | extracted-inline |
| `apps/worker-code/src/eval/scenarioRunner.ts` | service | batch + file-I/O | `apps/worker-code/src/eval/runEval.ts:107`, `runtime.ts` | extracted-inline |
| `apps/worker-code/src/eval/reportRenderer.ts` | utility | transform | `apps/worker-code/src/eval/runEval.ts:212` | extracted-inline |
| `apps/worker-code/src/eval/trend.ts` | utility | transform | `apps/worker-code/src/eval/runEval.ts:84` | extracted-inline |
| `apps/worker-code/src/eval/harnessChecks.ts` | utility | transform | `apps/worker-code/src/eval/runEval.ts:257` | extracted-inline |
| `apps/worker-code/src/eval/scenarioLoader.test.ts` | test | transform | `apps/worker-code/src/eval/runEval.test.ts:35` | role-match |
| `apps/worker-code/src/eval/reportRenderer.test.ts` | test | transform | `apps/worker-code/src/eval/runEval.test.ts:176` | role-match |
| `apps/worker-code/src/eval/trend.test.ts` | test | transform | `apps/worker-code/src/eval/runEval.test.ts:5` | role-match |
| `apps/worker-code/src/eval/harnessChecks.test.ts` | test | transform | `apps/worker-code/src/eval/runEval.test.ts:296`, `scoring.test.ts:56` | role-match |

## Pattern Assignments

### `apps/worker-code/src/executor/runJob.ts` (service facade/coordinator, request-response)

**Analog:** `apps/worker-code/src/executor/runJob.ts`

**Owner boundary:** Keep `runJob(job)` and `reportResult(result)` exported here because `apps/worker-code/src/routes/jobs.ts` imports only those two names. Extract responsibilities behind the facade; do not change route behavior or result payloads.

**Imports/facade boundary** (`apps/worker-code/src/routes/jobs.ts:1-5`, `20-57`):

```typescript
import { type Context, Hono, type Next } from 'hono';
import { env } from '../env.js';
import { reportResult, runJob } from '../executor/runJob.js';
import { logger } from '../logger.js';
import { type Job, jobSchema } from '../types.js';

async function runAndReport(job: Job): Promise<void> {
  try {
    await reportResult(await runJob(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId: job.runId }, 'async job failed before result report');
    await reportResult({
      runId: job.runId,
      status: 'failed',
      branch: job.branch,
      commands: [],
      error: message,
    });
  }
}
```

**Coordinator shape to preserve** (`apps/worker-code/src/executor/runJob.ts:181-185`, `421-431`):

```typescript
export async function runJob(job: Job): Promise<JobResult> {
  const log = logger.child({ runId: job.runId, issue: job.issueIdentifier });
  const commands: CommandResult[] = [];
  const base: JobResult = { runId: job.runId, status: 'failed', branch: job.branch, commands };

  try {
    // existing execution branches
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'job failed');
    return { ...base, status: 'failed', error: message };
  } finally {
    try {
      await cleanupWorktree(job.runId);
    } catch (err) {
      log.warn({ err }, 'failed to cleanup worktree');
    }
  }
}
```

**Tests to copy/update:** Keep `runJob.test.ts` imports compatible while moving helpers. Add `runJob.seams.test.ts` for orchestration branches that are not covered today.

---

### `apps/worker-code/src/executor/jobDispatch.ts` (service, request-response)

**Analog:** `apps/worker-code/src/executor/runJob.ts:186-219`

**Core dispatch pattern:**

```typescript
if (job.agentKey === DATA_COLLECTOR_AGENT_KEY) {
  log.info('running data collector research job');
  if (shouldUsePlaywrightResearch(job)) {
    return await runPlaywrightResearchJob(job, {
      timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
      maxPages: env.SCRAPING_MAX_PAGES,
      maxOutputChars: env.SCRAPING_MAX_OUTPUT_CHARS,
      rateLimitPerMinute: env.SCRAPING_RATE_LIMIT_PER_MINUTE,
    });
  }
  return await runFirecrawlResearchJob(job, {
    apiKey: env.FIRECRAWL_API_KEY,
    baseUrl: env.FIRECRAWL_BASE_URL,
    timeoutMs: env.FIRECRAWL_TIMEOUT_MS,
    maxPages: env.SCRAPING_MAX_PAGES,
    maxOutputChars: env.SCRAPING_MAX_OUTPUT_CHARS,
    rateLimitPerMinute: env.SCRAPING_RATE_LIMIT_PER_MINUTE,
    instagramGraph: { /* existing env mapping */ },
    apifyInstagram: { /* existing env mapping */ },
  });
}
```

**Owner boundary:** This module may select the data-collector path, but provider-specific policy and formatting stay in `firecrawlResearch.ts`, `playwrightResearch.ts`, `instagramGraphResearch.ts`, and `apifyInstagramResearch.ts`.

**Test analog:** Copy the base job + `vi.fn` provider shape from `firecrawlResearch.test.ts:9-23`, `43-90` and `playwrightResearch.test.ts:9-23`, `52-75`.

---

### `apps/worker-code/src/executor/jobValidation.ts` (service, batch)

**Analogs:** `apps/worker-code/src/executor/runJob.ts:38-56`, `113-149`; `apps/worker-code/src/executor/validation.ts:20-25`

**Imports pattern:**

```typescript
import type { Logger } from 'pino';
import type { CommandResult, Job } from '../types.js';
import { checkCommand } from './commandPolicy.js';
import { runLandingQualityGate } from './landingQuality.js';
import { runSandboxedCommand } from './sandbox.js';
import { summarizeFailureTail } from './validation.js';
```

**Guarded command pattern** (`runJob.ts:38-56`):

```typescript
async function runGuarded(
  command: string,
  dir: string,
  runId: string,
  log: Logger,
): Promise<CommandResult> {
  const check = checkCommand(command, COMMAND_ALLOWLIST);
  if (!check.allowed) {
    log.warn({ command, reason: check.reason }, 'comando bloqueado pela allowlist');
    return {
      command,
      exitCode: 126,
      stdout: '',
      stderr: `bloqueado: ${check.reason}`,
      durationMs: 0,
    };
  }
  return runSandboxedCommand({ command, cwd: dir, runId, env });
}
```

**Validation loop pattern** (`runJob.ts:113-130`):

```typescript
async function runValidation(
  cmds: string[],
  dir: string,
  runId: string,
  log: Logger,
): Promise<{ passed: boolean; results: CommandResult[]; failureTail: string }> {
  const results: CommandResult[] = [];
  for (const cmd of cmds) {
    log.info({ cmd }, 'running validation command');
    const result = await runGuarded(cmd, dir, runId, log);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  const passed = results.length === cmds.length && results.every((c) => c.exitCode === 0);
  return { passed, results, failureTail: summarizeFailureTail(results) };
}
```

**Failure-tail helper** (`validation.ts:20-25`):

```typescript
export function summarizeFailureTail(commands: CommandResult[]): string {
  const failed = commands.find((c) => c.exitCode !== 0);
  if (!failed) return '';
  const output = [failed.stderr, failed.stdout].filter((part) => part.trim()).join('\n');
  return `$ ${failed.command}\n${summarizeOutput(output)}`;
}
```

**Tests to copy:** `runJob.test.ts:22-62` for failure-tail cases; `commandPolicy.test.ts:6-32` for blocked command behavior. Add RED test that validation stops at first failed command.

---

### `apps/worker-code/src/executor/jobSelfCorrection.ts` (service, batch + file-I/O)

**Analogs:** `apps/worker-code/src/executor/runJob.ts:294-375`, `apps/worker-code/src/eval/workerDryRun.ts:72-97`

**Core runJob self-correction pattern** (`runJob.ts:294-340`):

```typescript
let validation = await runLandingAwareValidation(job, dir, base.filesChanged, log);
let fixAttempts = 0;
let touched = base.filesChanged;
const applySelfCorrection = async (failureTail: string, reason: string) => {
  fixAttempts++;
  log.info({ attempt: fixAttempts, reason }, 'tentando auto-correção');
  try {
    const fix = await applyFix({
      llm,
      dir,
      filesChanged: touched,
      failureTail,
      plan,
      title: job.title,
      agentKey: job.agentKey,
      agentCapabilities: job.agentCapabilities,
      log,
    });
    base.costUsd = (base.costUsd ?? 0) + fix.costUsd;
    touched = [...new Set([...touched, ...fix.filesChanged])];
    if (landingMediaArtifactPath) {
      await restoreLandingMediaAsset(dir, landingMediaArtifactPath, landingMediaAssetPath);
      touched = [...new Set([...touched, landingMediaAssetPath])];
    }
    return true;
  } catch (err) {
    log.warn({ err, attempt: fixAttempts }, 'fix falhou — encerrando o loop');
    return false;
  }
};
```

**Commit-failure retry pattern** (`runJob.ts:351-375`):

```typescript
const message = buildCommitMessage(job, gen.prTitle, gen.summary);
let commitFailure: CommandResult | undefined;
let commit = await tryCommitAll(dir, message);
while ('failure' in commit && fixAttempts < env.AGENT_MAX_FIX_ATTEMPTS) {
  commitFailure = commit.failure;
  const fixed = await applySelfCorrection(
    summarizeFailureTail([commit.failure]),
    'git commit failed',
  );
  if (!fixed) break;
  validation = await runLandingAwareValidation(job, dir, touched, log);
  await fixValidationFailures();
  base.fixAttempts = fixAttempts;
  base.filesChanged = touched;
  commit = await tryCommitAll(dir, message);
}
```

**Dry-run test analog** (`eval/workerDryRun.test.ts:9-57`): use fixture-local repos, `mkdtemp`, `initRepo`, and assert `fixAttempts`, `filesChanged`, `diff`, and failure artifact contents.

**Owner boundary:** Do not move `applyFix` internals here. `jobSelfCorrection.ts` should call the `codegen.ts` facade or injected `applyFix`, preserve touched-file accumulation, and restore binary media assets after every fix.

---

### `apps/worker-code/src/executor/jobMedia.ts` (service, file-I/O)

**Analog:** `apps/worker-code/src/executor/runJob.ts:60-106`, `238-270`

**Core helper pattern** (`runJob.ts:60-106`):

```typescript
export function shouldAutoGenerateLandingMedia(job: Job): boolean {
  if (!env.HIGGSFIELD_AUTO_GENERATE_LANDING_MEDIA) return false;
  if (job.reviewFeedback?.trim()) return false;
  if (job.agentKey !== LANDING_PAGE_AGENT_KEY) return false;
  return true;
}

export function landingHeroAssetPathForArtifact(artifactPath: string): string {
  const extension = extname(artifactPath).toLowerCase();
  const normalized = extension === '.jpeg' ? '.jpg' : extension || '.jpg';
  return `public/generated/${LANDING_HERO_ASSET_BASENAME}${normalized}`;
}

export async function restoreLandingMediaAsset(
  dir: string,
  artifactPath: string,
  assetPath = DEFAULT_LANDING_HERO_ASSET_PATH,
): Promise<string> {
  const destination = join(dir, assetPath);
  await mkdir(join(dir, 'public/generated'), { recursive: true });
  await copyFile(artifactPath, destination);
  return assetPath;
}
```

**Tests to copy:** `runJob.test.ts:104-165`, especially the binary restore test at `146-164`.

**Owner boundary:** Keep Higgsfield provider calls in `higgsfieldTool.ts`; `jobMedia.ts` should own prompt/context/path/restore glue only.

---

### `apps/worker-code/src/executor/jobResult.ts` (utility, transform)

**Analog:** `apps/worker-code/src/executor/runJob.ts:165-174`, `434-492`

**Commit error pattern** (`runJob.ts:165-174`):

```typescript
export function commitErrorResult(err: unknown): CommandResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    command: 'git commit',
    exitCode: 1,
    stdout: '',
    stderr: message,
    durationMs: 0,
  };
}
```

**Sandbox summary pattern** (`runJob.ts:434-445`):

```typescript
function summarizeSandbox(commands: CommandResult[]): JobResult['sandbox'] {
  const durations = commands.map((command) => command.durationMs);
  const failed = commands.find((command) => command.exitCode !== 0);
  return {
    backend: env.AGENT_SANDBOX_BACKEND,
    image: env.AGENT_SANDBOX_BACKEND === 'docker' ? env.AGENT_SANDBOX_IMAGE : undefined,
    network: env.AGENT_SANDBOX_BACKEND === 'docker' ? env.AGENT_SANDBOX_NETWORK : undefined,
    commandCount: commands.length,
    totalDurationMs: durations.reduce((sum, value) => sum + value, 0),
    maxCommandDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
    failedCommand: failed?.command,
  };
}
```

**Commit message/report callback pattern** (`runJob.ts:454-492`): preserve `Ref: ${job.issueIdentifier}`, optional `Co-authored-by`, POST URL `/runs/${result.runId}/result`, and bearer auth header.

**Tests to copy:** `runJob.test.ts:64-101`.

---

### `apps/worker-code/src/executor/codegen.ts` (service facade, transform + file-I/O)

**Analog:** `apps/worker-code/src/executor/codegen.ts`

**Owner boundary:** Keep `generateAndApplyCode`, `applyFix`, and existing helper exports available from `codegen.ts` until all imports/tests are moved. Use compatibility re-exports from new files; do not change model alias `strong_coder`, prompt semantics, Zod parsing, or generated file filtering.

**Imports convention** (`codegen.ts:1-8`):

```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { buildSkillInstructions } from './agentSkills.js';
import { buildExamples, readConventions } from './context.js';
import { runCommand } from './worktree.js';
```

**Facade recommendation:**

```typescript
export { extractJson, completeJson } from './codegenJson.js';
export { filterAllowedFiles, worktreeFilePath } from './codegenFiles.js';
export { filterDocumentationTargets, filterReviewCreates } from './codegenSelection.js';
export { buildFixCandidateFiles, selectFixCandidateFiles, isTextFixablePath } from './codegenFixes.js';
export { generateAndApplyCode, applyFix } from './codegenOrchestrator.js';
```

If planner does not create `codegenOrchestrator.ts`, keep orchestration in `codegen.ts` and move only pure helpers first.

---

### `apps/worker-code/src/executor/codegenJson.ts` (utility, transform)

**Analog:** `apps/worker-code/src/executor/codegen.ts:141-244`

**JSON extraction pattern** (`codegen.ts:141-155`):

```typescript
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const sample = candidate.replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(
      sample
        ? `resposta do modelo não contém JSON. Amostra: ${sample}`
        : 'resposta do modelo não contém JSON',
    );
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
```

**LLM repair pattern** (`codegen.ts:180-244`): preserve `alias: 'strong_coder'`, `jsonMode: true`, `onUsage`, two normal attempts, and repair only when `lastRaw` appears to contain an object.

**Tests to copy:** `codegen.test.ts:40-64` for `extractJson`; `codegen.test.ts:114-154` for `completeJson` repair/no-repair/maxTokens.

---

### `apps/worker-code/src/executor/codegenFiles.ts` (utility, file-I/O)

**Analog:** `apps/worker-code/src/executor/codegen.ts:247-355`, `737-740`

**Path safety and apply pattern** (`codegen.ts:247-254`, `323-355`):

```typescript
function safeJoin(dir: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, '');
  const full = resolve(dir, normalized);
  if (full !== dir && !full.startsWith(`${dir}/`)) {
    throw new Error(`caminho de arquivo fora do worktree: ${relPath}`);
  }
  return full;
}

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

**Allowed-file filter pattern** (`codegen.ts:337-355`):

```typescript
export function filterAllowedFiles(
  files: { path: string; content: string }[],
  allowedPaths: string[],
): { files: { path: string; content: string }[]; dropped: string[] } {
  const allowed = new Set(allowedPaths.map((path) => path.replace(/^\/+/, '')));
  const out: { path: string; content: string }[] = [];
  const dropped: string[] = [];
  // normalize, keep allowed, collect dropped
  return { files: out, dropped };
}
```

**Tests to copy:** `codegen.test.ts:287-304`.

---

### `apps/worker-code/src/executor/codegenSelection.ts` (utility, transform)

**Analog:** `apps/worker-code/src/executor/codegen.ts:365-400`, `462-474`

**Docs/review filtering pattern** (`codegen.ts:380-400`, `462-474`):

```typescript
export function filterDocumentationTargets(
  selection: { edit: string[]; create: string[] },
  ctx: { title: string; description: string },
): { selection: { edit: string[]; create: string[] }; droppedDocs: string[] } {
  if (issueExplicitlyRequestsDocs(ctx.title)) {
    return { selection, droppedDocs: [] };
  }
  const droppedDocs = [...selection.edit, ...selection.create].filter(isDocumentationPath);
  if (droppedDocs.length === 0) return { selection, droppedDocs };
  return {
    selection: {
      edit: selection.edit.filter((path) => !isDocumentationPath(path)),
      create: selection.create.filter((path) => !isDocumentationPath(path)),
    },
    droppedDocs,
  };
}

export function filterReviewCreates(
  selection: { edit: string[]; create: string[] },
  reviewFeedback?: string,
): { selection: { edit: string[]; create: string[] }; droppedCreates: string[] } {
  if (!reviewFeedback?.trim() || selection.create.length === 0) {
    return { selection, droppedCreates: [] };
  }
  return { selection: { edit: selection.edit, create: [] }, droppedCreates: selection.create };
}
```

**Tests to copy:** `codegen.test.ts:156-191`, `264-285`.

---

### `apps/worker-code/src/executor/codegenFixes.ts` (utility, transform)

**Analog:** `apps/worker-code/src/executor/codegen.ts:402-452`

**Fix candidate pattern** (`codegen.ts:402-452`):

```typescript
export function selectFixCandidateFiles(filesChanged: string[], failureTail: string): string[] {
  const candidates = [...new Set(filesChanged)].slice(0, MAX_EDIT_FILES);
  const normalizedTail = failureTail.replaceAll('\\', '/');
  const changedTests = candidates.filter(isTestPath);
  const mentioned = candidates.filter((path) => {
    const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/');
    const suffixes = normalized
      .split('/')
      .map((_, index, parts) => parts.slice(index).join('/'))
      .filter((suffix) => suffix.includes('/'));
    const fileName = normalized.split('/').pop() ?? normalized;
    return normalizedTail.includes(normalized) || suffixes.some((suffix) => normalizedTail.includes(suffix)) || normalizedTail.includes(fileName);
  });
  return mentioned.length > 0
    ? [...new Set([...mentioned, ...changedTests])].slice(0, MAX_EDIT_FILES)
    : candidates.slice(0, 6);
}

export function isTextFixablePath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/').toLowerCase();
  if (normalized.startsWith('public/generated/')) return false;
  return !/\.(?:avif|bin|gif|ico|jpe?g|mov|mp4|otf|pdf|png|ttf|webm|webp|woff2?|zip)$/.test(normalized);
}
```

**Tests to copy:** `codegen.test.ts:193-262`.

---

### `apps/worker-code/src/executor/codegenPrompts.ts` (utility, transform)

**Analog:** `apps/worker-code/src/executor/codegen.ts:10-78`, `162-173`, `501-590`, `709-719`

**Pattern:** Move prompt constants and agent-instruction assembly without changing Portuguese prompt text. Keep instruction owner as `agentSkills.ts`.

**Agent instruction pattern** (`codegen.ts:162-173`):

```typescript
export function buildAgentInstructions(
  agentKey?: string,
  capabilities: string[] = [],
  root?: string,
  opts: { skills?: string[] } = {},
): string {
  return buildSkillInstructions(agentKey, capabilities, root, opts);
}

function buildCoderInstructions(agentKey?: string, capabilities: string[] = []): string {
  return buildAgentInstructions(agentKey, capabilities, undefined, { skills: ['software-coder'] });
}
```

**Shared owner:** `agentSkills.ts:56-95` owns registry loading and fallback instruction strings. Do not duplicate registry parsing.

---

### Research provider modules and `researchOutput.ts` (service + utility, request-response/transform)

**Analogs:** `firecrawlResearch.ts`, `playwrightResearch.ts`, `instagramGraphResearch.ts`, `apifyInstagramResearch.ts`, `scrapingPolicy.ts`

**Owner boundary:** Share only pure helpers: `truncate`, `bulletList`, `instagramProfileUrl`, limitation text builders, exact-secret redaction wrappers, section assembly helpers. Do not introduce a generic provider runner. Firecrawl, Playwright, Graph, and Apify keep their own request/command/result contracts.

**Shared policy pattern** (`scrapingPolicy.ts:69-101`):

```typescript
export function buildScrapingPolicy(input: ScrapingPolicyInput): ScrapingPolicyResult {
  const text = [input.title, input.description, input.plan].join('\n');
  const limitCeiling = input.defaults ?? input.limits;
  const urls = extractExplicitUrls(text, limitCeiling.maxPages);
  const reasons: string[] = [];
  if (urls.length === 0) reasons.push('no explicit authorized URL found in card or plan');
  for (const url of urls) {
    const reason = blockedUrlReason(url);
    if (reason) reasons.push(`${url}: ${reason}`);
  }
  if (hasUnsafeBypassInstruction(text)) reasons.push('bypass/login/captcha/paywall instruction is not allowed');
  return {
    allowed: reasons.length === 0,
    urls,
    reasons,
    limits: clampLimits(input.limits, limitCeiling),
  };
}
```

**Firecrawl pack pattern** (`firecrawlResearch.ts:329-431`):

```typescript
function buildResearchPack(
  job: Job,
  sources: ResearchSource[],
  generatedAt: Date,
  limits: ScrapingLimits,
  instagramHandles: string[] = [],
  instagramGraphFindings: InstagramGraphFinding[] = [],
  apifyInstagramFindings: ApifyInstagramFinding[] = [],
  persistedSecrets: string[] = [],
): string {
  const lines = [
    `# Research Pack - ${job.issueIdentifier}`,
    '',
    `Generated at: ${generatedAt.toISOString()}`,
    '',
    '## Objective',
    '',
    job.title,
    '',
    '## Scope',
    '',
    job.description.trim() || 'Sem descrição adicional.',
    '',
    ...formatLandingPageBrief({ job, sources, instagramHandles, graphFindings: instagramGraphFindings, apifyFindings: apifyInstagramFindings }),
    '',
    '## Sources',
    '',
  ];
  // provider sections and limitations
  return sanitizeStoredText(lines.join('\n').trim(), persistedSecrets);
}
```

**Landing Page Brief headings are contract** (`firecrawlResearch.ts:448-514`):

```typescript
return [
  '## Landing Page Brief',
  '',
  '### Brand / Subject',
  '',
  `- Primary subject: ${subject}`,
  `- Request: ${args.job.title}`,
  `- Public handles: ${args.instagramHandles.length > 0 ? args.instagramHandles.map((handle) => `@${handle}`).join(', ') : 'none detected'}`,
  '',
  '### Audience Hypotheses',
  // ...
  '### Source Handling',
  '',
  ...bulletList(primaryUrls.map((url) => `Use as source evidence: ${url}`), '- No explicit source URLs were available after policy filtering.'),
];
```

**Provider formatting examples:**

```typescript
// instagramGraphResearch.ts:247-257
export function redactSensitiveText(value: string, exactSecrets: string[] = []): string {
  let redacted = value;
  for (const secret of new Set(exactSecrets.filter(Boolean))) {
    redacted = redacted.split(secret).join('[redacted]');
    const encodedSecret = encodeURIComponent(secret);
    if (encodedSecret && encodedSecret !== secret) redacted = redacted.split(encodedSecret).join('[redacted]');
  }
  return redacted.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]');
}

// apifyInstagramResearch.ts:252-295
export function formatApifyInstagramFindings(findings: ApifyInstagramFinding[]): string[] {
  if (findings.length === 0) return [];
  const lines = ['## Apify Instagram Findings', '', '### Sources', ''];
  // profile/media/limitations sections
  return lines;
}
```

**Tests to copy:** `firecrawlResearch.test.ts:251-306` for `Landing Page Brief`/Apify/provider failures; `firecrawlResearch.test.ts:545-563` for token redaction; `scrapingPolicy.test.ts:25-126` for URL policy; `playwrightResearch.test.ts:77-146` for limits/navigation/download/form blocking; `instagramGraphResearch.test.ts:85-142` and `apifyInstagramResearch.test.ts:97-160` for redacted limitations and formatter output.

---

### Eval facade and modules (CLI/service/utilities, batch + file-I/O)

**Analogs:** `apps/worker-code/src/eval/runEval.ts`, `runtime.ts`, `scoring.ts`, `types.ts`, `workerDryRun.ts`

**Owner boundary:** Keep CLI entrypoint and `runEvalSuite` facade in `runEval.ts`; extract scenario loading, scenario execution, report rendering, trend comparison, and harness checks. Do not change `EvalReport`, score thresholds, artifact names, or `.eval-runs` output shape.

**Suite facade pattern** (`runEval.ts:41-82`):

```typescript
export async function runEvalSuite(args: {
  fixturesDir: string;
  outRoot: string;
}): Promise<EvalReport> {
  const generatedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactRoot = join(args.outRoot, generatedAt);
  await mkdir(artifactRoot, { recursive: true });

  const scenarios = await loadScenarios(args.fixturesDir);
  const results: EvalResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, join(artifactRoot, scenario.id)));
  }
  // score, trend, report.json, report.md, latest-report.json, history.jsonl
  return report;
}
```

**`scenarioRunner.ts` pattern** (`runEval.ts:107-152`):

```typescript
async function runScenario(scenario: EvalScenario, artifactDir: string): Promise<EvalResult> {
  await mkdir(artifactDir, { recursive: true });
  const workdir = await mkdtemp(join(tmpdir(), `agent-platform-eval-${scenario.id}-`));
  try {
    await writeFiles(workdir, scenario.repo.files);
    await initRepo(workdir);
    let commands: CommandResult[];
    let dryRun: WorkerDryRunResult | undefined;
    if (scenario.workerDryRun) {
      dryRun = await runWorkerDryRun({ scenario, workdir, artifactDir });
      commands = dryRun.commands;
    } else {
      await applyCandidate(workdir, scenario.candidate);
      commands = await runCommands(workdir, scenario.commands);
    }
    const changedFiles = dryRun ? [...dryRun.filesChanged].sort() : await listChangedFiles(workdir);
    const scored = await scoreScenario({ scenario, workdir, changedFiles, commands });
    const harnessChecks = createHarnessChecks(scenario, { changedFiles, commands, dryRun });
    // write result.json and diff.patch
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
```

**`scenarioLoader.ts` pattern** (`runEval.ts:154-210`):

```typescript
async function loadScenarios(fixturesDir: string): Promise<EvalScenario[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const scenarios: EvalScenario[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const raw = await readFile(join(fixturesDir, entry.name, 'scenario.json'), 'utf8');
    scenarios.push(evalScenarioSchema.parse(normalizeScenarioFixture(JSON.parse(raw))));
  }
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}
```

**`reportRenderer.ts` pattern** (`runEval.ts:212-255`):

```typescript
export function renderMarkdown(report: EvalReport): string {
  const lines = [
    '# Agent Eval Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Result: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Score: ${report.score}`,
    `Scenarios: ${report.passedCount}/${report.total}`,
  ];
  if (report.trend?.previousScore !== undefined) {
    lines.push(`Previous score: ${report.trend.previousScore}`);
    lines.push(`Score delta: ${formatDelta(report.trend.scoreDelta ?? 0)}`);
    lines.push(`Regressed scenarios: ${report.trend.regressedScenarios.join(', ') || '(none)'}`);
  }
  // preserve insight and check line wording
  return `${lines.join('\n')}\n`;
}
```

**`trend.ts` pattern** (`runEval.ts:84-105`):

```typescript
export function compareReports(
  results: EvalResult[],
  score: number,
  previous?: EvalReport,
): EvalTrend {
  if (!previous) return { regressed: false, regressedScenarios: [] };
  const previousScores = new Map(previous.results.map((result) => [result.id, result.score]));
  const regressedScenarios = results
    .filter((result) => {
      const previousScore = previousScores.get(result.id);
      return previousScore !== undefined && result.score < previousScore;
    })
    .map((result) => result.id);
  const scoreDelta = score - previous.score;
  return { previousGeneratedAt: previous.generatedAt, previousScore: previous.score, scoreDelta, regressed: scoreDelta < 0 || regressedScenarios.length > 0, regressedScenarios };
}
```

**`harnessChecks.ts` pattern** (`runEval.ts:257-402`): preserve check names and details such as `eval verdict`, `review outcome`, `auto-merge expectation`, `commit Ref trailer`, `commit Co-authored-by trailer`, `commit author`, and `isolation policy`; `combineScores` keeps `Math.min(baseScore, complianceScore)` (`runEval.ts:551-557`).

**Types owner:** Keep schemas and interfaces in `apps/worker-code/src/eval/types.ts:363-909`; new modules should import `type EvalReport`, `type EvalResult`, `type EvalScenario`, `type EvalTrend`, and `evalScenarioSchema`.

**Tests to copy:** `runEval.test.ts:5-33` for trend; `35-174` for scenario normalization; `176-327` for markdown wording; `scoring.test.ts:56-359` for report JSON expectations; `workerDryRun.test.ts:9-57` for dry-run self-correction.

---

## Shared Patterns

### TypeScript ESM Imports

**Source:** `tsconfig.base.json:4-18`, existing worker imports
**Apply to:** All moved/new TypeScript modules

```json
{
  "module": "ESNext",
  "moduleResolution": "Bundler",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "verbatimModuleSyntax": true,
  "isolatedModules": true
}
```

Use explicit `.js` specifiers for local imports and `import type` for types:

```typescript
import type { Logger } from 'pino';
import type { CommandResult, Job, JobResult } from '../types.js';
import { summarizeFailureTail } from './validation.js';
```

### Vitest Style

**Source:** `apps/worker-code/src/executor/codegen.test.ts:1-38`, provider tests
**Apply to:** All new test files

```typescript
import { describe, expect, it, vi } from 'vitest';

function fakeLlm(responses: string[]): { llm: LlmClient; calls: () => number } {
  let i = 0;
  return {
    llm: {
      complete: async () => responses[Math.min(i++, responses.length - 1)] ?? '',
    },
    calls: () => i,
  };
}
```

Prefer deterministic fakes (`vi.fn`, fake `fetchImpl`, fixture-local temp repos) over live providers.

### Command Safety

**Source:** `apps/worker-code/src/executor/commandPolicy.ts:16-30`, `sandbox.ts:25-31`, `eval/runtime.ts:87-105`
**Apply to:** validation helpers, eval scenario runner, self-correction loops

Never add ad hoc shell parsing. Use `checkCommand` before validation commands and `runSandboxedCommand`/`runCommands` for execution.

### Git/Worktree Ownership

**Source:** `apps/worker-code/src/executor/worktree.ts:45-94`, `git.ts:21-68`
**Apply to:** runner coordinator and self-correction

Do not inline Git shell commands into extracted runner modules except through existing helpers:

```typescript
const dir = await prepareWorktree({ runId, repoUrl, baseBranch, branch, checkoutOnly, revise });
const commit = await commitAll(dir, message);
base.diff = await diffAgainst(dir, job.baseBranch);
await pushBranch(dir, job.branch);
await cleanupWorktree(job.runId);
```

### Research Security Boundaries

**Source:** `scrapingPolicy.ts:149-188`, `instagramGraphResearch.ts:247-257`, provider tests
**Apply to:** all research helper extractions

Preserve blocks for credentials, localhost/private/internal/metadata hosts, bypass/captcha/paywall instructions, broad crawling, and exact-secret/token-pattern redaction.

### Eval Artifact Shape

**Source:** `runEval.ts:71-80`, `types.ts:893-909`, `docs/runbooks/eval-harness.md`
**Apply to:** eval facade/renderer/trend/loader/runner modules

Keep these outputs unchanged:

- `.eval-runs/<timestamp>/report.json`
- `.eval-runs/<timestamp>/report.md`
- `.eval-runs/<timestamp>/<scenario-id>/result.json`
- `.eval-runs/<timestamp>/<scenario-id>/diff.patch`
- `.eval-runs/latest-report.json`
- `.eval-runs/history.jsonl`

## Recommended Module Boundaries

### Runner

- `runJob.ts`: public facade, LLM/env wiring, high-level try/catch/finally cleanup, compatibility re-exports.
- `jobDispatch.ts`: only selects data-collector branch vs codegen branch and maps env to provider options.
- `jobValidation.ts`: `runGuarded`, `runValidation`, `runLandingAwareValidation`.
- `jobSelfCorrection.ts`: validation fix loop and commit-failure retry loop; calls `applyFix` and media restore hooks.
- `jobMedia.ts`: landing media prompt/context/path/restore helpers and Higgsfield generation glue.
- `jobResult.ts`: `summarizeSandbox`, `buildCommitMessage`, `commitErrorResult`, result helpers.

### Codegen

- `codegen.ts`: compatibility facade.
- `codegenPrompts.ts`: prompt constants and agent instruction assembly.
- `codegenJson.ts`: JSON extraction, parse/repair, LLM completion helper.
- `codegenFiles.ts`: `safeJoin`, repo file listing, current-file read, `applyFiles`, allowed-file filtering, worktree path helper.
- `codegenSelection.ts`: docs/review target filtering and chunk/available-file formatting if moved.
- `codegenFixes.ts`: text-fixability and fix candidate selection.

### Research

- `researchOutput.ts`: `truncate`, `bulletList`, limitation formatting, section builders, shared sanitizer wrappers.
- `researchInstagram.ts`: handle extraction/profile URL helpers if extraction stays narrow.
- Provider modules keep request, API schema, command audit, and provider-specific output section ownership.

### Eval

- `runEval.ts`: CLI, `runEvalSuite`, file writes, compatibility re-exports.
- `scenarioLoader.ts`: `loadScenarios`, `normalizeScenarioFixture`, fixture aliases.
- `scenarioRunner.ts`: temp repo orchestration, dry-run/candidate branch, scoring, result/diff artifacts.
- `reportRenderer.ts`: `renderMarkdown`, insight extraction, formatting helpers.
- `trend.ts`: `compareReports`, `reportSummary`, delta formatting if needed.
- `harnessChecks.ts`: expectation extraction, actual dry-run extraction, harness check creation, `combineScores`.

## Anti-Patterns To Avoid

- Do not modify `apps/worker-code/src/routes/jobs.ts`; route auth, `/jobs`, `/jobs/sync`, async callback behavior, and response shapes are Phase 6 scope fences.
- Do not move or rename Plane/Linear provider defaults, worker env vars, workflow labels, agent keys, `coder-agent` compatibility aliases, or model aliases.
- Do not add runtime dependencies or change `apps/worker-code/package.json` / lockfile for this refactor.
- Do not rewrite prompts while moving `codegenPrompts.ts`; preserve exact prompt semantics.
- Do not drop compatibility exports from `runJob.ts`, `codegen.ts`, or `runEval.ts` during the split.
- Do not create a generic research provider abstraction. Share pure output helpers only.
- Do not change research pack headings, especially `## Landing Page Brief`, provider findings headings, and limitation wording asserted by tests/docs.
- Do not change eval scoring formulas, check names, report markdown wording, report JSON fields, or `.eval-runs` artifact filenames unless a characterization test proves equivalence.
- Do not hand-roll command execution, Git, worktree, path safety, scraping policy, or redaction logic.

## Verification Patterns

Focused commands copied from research and package scripts:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scoring.test.ts apps/worker-code/src/eval/workerDryRun.test.ts apps/worker-code/src/eval/roleQuality.test.ts
rtk corepack pnpm --filter @agent-platform/worker-code typecheck
rtk corepack pnpm verify
```

## No Analog Found

No files are without an analog. Two areas have only partial analogs and need RED characterization before movement:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/worker-code/src/executor/runJob.seams.test.ts` | test | request-response | No existing test covers full `runJob` branch orchestration with mocked worktree/codegen/git/provider seams. |
| `apps/worker-code/src/executor/jobSelfCorrection.ts` | service | batch + file-I/O | Existing behavior is inline in `runJob.ts`; `workerDryRun.ts` is a partial dry-run analog only. |

## Metadata

**Analog search scope:** `apps/worker-code/src/executor`, `apps/worker-code/src/eval`, `apps/worker-code/src/routes`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, worker runbooks.
**Files scanned:** 41 source/test/config/doc/planning files.
**Pattern extraction date:** 2026-07-02.
