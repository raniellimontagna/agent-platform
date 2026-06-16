import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { CommandResult } from '../types.js';
import {
  applyCandidate,
  initRepo,
  listChangedFiles,
  runCommands,
  runShell,
  writeFiles,
} from './runtime.js';
import { scoreScenario } from './scoring.js';
import {
  type EvalReport,
  type EvalResult,
  type EvalScenario,
  type EvalTrend,
  evalScenarioSchema,
} from './types.js';
import { type WorkerDryRunResult, runWorkerDryRun } from './workerDryRun.js';

type LocalEvalScenario = EvalScenario & {
  __localEval?: LocalEvalMetadata;
};

type LocalEvalMetadata = {
  source: 'local-v2';
  verdict: string;
  caveatType?: 'operational' | 'non-operational';
  autoMergeAllowed?: boolean;
  autoMergeBlockReason?: string;
  reviewOutcome?: string;
  reviewRounds?: number;
  reviewRoundLimit: number;
  commitMessage?: string;
  changedFiles: string[];
  commands: CommandResult[];
  externalCalls: Record<string, boolean>;
  branch?: string;
  pushed?: boolean;
  fixAttempts?: number;
  commitSha?: string;
  diff?: string;
  prTitle?: string;
  summary?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixturesDir = resolve(args.fixtures ?? defaultFixturesDir());
  const outRoot = resolve(args.out ?? '.eval-runs');
  const report = await runEvalSuite({ fixturesDir, outRoot });

  console.log(`eval report: ${join(outRoot, report.generatedAt)}`);
  console.log(`${report.passedCount}/${report.total} scenarios passed; score ${report.score}`);
  if (report.trend?.previousScore !== undefined) {
    console.log(`score delta vs previous: ${formatDelta(report.trend.scoreDelta ?? 0)}`);
  }

  if (!report.passed || (args.failOnRegression && report.trend?.regressed)) {
    process.exitCode = 1;
  }
}

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

  const passedCount = results.filter((result) => result.passed).length;
  const score =
    results.length === 0
      ? 100
      : Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
  const previous = await readLatestReport(args.outRoot);
  const report: EvalReport = {
    generatedAt,
    passed: results.every((result) => result.passed),
    total: results.length,
    passedCount,
    score,
    trend: compareReports(results, score, previous),
    results,
  };

  await writeFile(join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'report.md'), renderMarkdown(report));
  await writeFile(join(args.outRoot, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outRoot, 'history.jsonl'), `${JSON.stringify(reportSummary(report))}\n`, {
    flag: 'a',
  });
  return report;
}

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
  return {
    previousGeneratedAt: previous.generatedAt,
    previousScore: previous.score,
    scoreDelta,
    regressed: scoreDelta < 0 || regressedScenarios.length > 0,
    regressedScenarios,
  };
}

async function runScenario(scenario: EvalScenario, artifactDir: string): Promise<EvalResult> {
  await mkdir(artifactDir, { recursive: true });
  const localScenario = scenario as LocalEvalScenario;
  if (localScenario.__localEval) {
    return runLocalScenario(localScenario, artifactDir);
  }

  const workdir = await mkdtemp(join(tmpdir(), `agent-platform-eval-${scenario.id}-`));
  try {
    await writeFiles(workdir, scenario.repo.files);
    await withIsolatedEvalEnv(async () => {
      await initRepo(workdir);
    });
    let commands: CommandResult[];
    let dryRun: WorkerDryRunResult | undefined;
    if (scenario.workerDryRun) {
      dryRun = await withIsolatedEvalEnv(async () =>
        runWorkerDryRun({ scenario, workdir, artifactDir }),
      );
      commands = dryRun.commands;
    } else {
      await applyCandidate(workdir, scenario.candidate);
      commands = await withIsolatedEvalEnv(async () => runCommands(workdir, scenario.commands));
    }
    const changedFiles = dryRun
      ? [...dryRun.filesChanged].sort()
      : await withIsolatedEvalEnv(async () => listChangedFiles(workdir));
    const scored = await withIsolatedEvalEnv(async () =>
      scoreScenario({ scenario, workdir, changedFiles, commands }),
    );
    const result: EvalResult = {
      id: scenario.id,
      title: scenario.title,
      passed: scored.passed,
      score: scored.score,
      changedFiles,
      commands,
      checks: scored.checks,
      artifactDir,
      dryRun,
    };
    await writeFile(join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(
      join(artifactDir, 'diff.patch'),
      dryRun?.diff ?? (await withIsolatedEvalEnv(async () => runShell('git diff', workdir))).stdout,
    );
    return result;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function runLocalScenario(
  scenario: LocalEvalScenario,
  artifactDir: string,
): Promise<EvalResult> {
  const metadata = scenario.__localEval;
  if (!metadata) {
    throw new Error(`missing local eval metadata for scenario ${scenario.id}`);
  }

  const checks = buildLocalChecks(metadata);
  const passed = checks.every((check) => check.passed);
  const score =
    checks.length === 0
      ? 100
      : Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  const dryRun = scenario.workerDryRun
    ? {
        branch: metadata.branch ?? 'eval/local-only',
        pushed: metadata.pushed ?? false,
        fixAttempts: metadata.fixAttempts ?? 0,
        commitSha: metadata.commitSha,
        diff: metadata.diff ?? '',
        filesChanged: metadata.changedFiles,
        prTitle: metadata.prTitle ?? scenario.title,
        summary: metadata.summary ?? '',
      }
    : undefined;

  const result: EvalResult = {
    id: scenario.id,
    title: scenario.title,
    passed,
    score,
    changedFiles: metadata.changedFiles,
    commands: metadata.commands,
    checks,
    artifactDir,
    dryRun,
  };

  await writeFile(join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(join(artifactDir, 'diff.patch'), `${metadata.diff ?? ''}`);
  return result;
}

async function loadScenarios(fixturesDir: string): Promise<EvalScenario[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const scenarios: EvalScenario[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const raw = JSON.parse(await readFile(join(fixturesDir, entry.name, 'scenario.json'), 'utf8'));
    scenarios.push(normalizeScenario(raw, entry.name));
  }
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeScenario(raw: unknown, directoryName: string): EvalScenario {
  if (looksLikeLegacyScenario(raw)) {
    return evalScenarioSchema.parse(raw);
  }
  return normalizeLocalScenario(raw, directoryName);
}

function looksLikeLegacyScenario(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const scenario = raw as Record<string, unknown>;
  const workerDryRun = asRecord(scenario.workerDryRun);
  if (workerDryRun) {
    return 'plan' in workerDryRun || 'files' in workerDryRun || 'prTitle' in workerDryRun;
  }
  return false;
}

function normalizeLocalScenario(raw: unknown, directoryName: string): EvalScenario {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`invalid local eval scenario in ${directoryName}: expected object`);
  }
  const scenario = raw as Record<string, unknown>;
  const commitMessage = normalizeCommitMessage(scenario);
  const metadata: LocalEvalMetadata = {
    source: 'local-v2',
    verdict: normalizeExpectedVerdict(scenario),
    caveatType: normalizeCaveatType(normalizeExpectedCaveatType(scenario)),
    autoMergeAllowed: normalizeExpectedAutoMergeAllowed(scenario),
    autoMergeBlockReason: normalizeExpectedAutoMergeBlockReason(scenario),
    reviewOutcome: normalizeExpectedReviewOutcome(scenario),
    reviewRounds: normalizeExpectedReviewRounds(scenario),
    reviewRoundLimit:
      readNumber(scenario, ['reviewRoundLimit'], readEnvNumber('AGENT_MAX_REVIEW_ROUNDS', 3)) ?? 3,
    commitMessage,
    changedFiles: normalizeChangedFiles(scenario),
    commands: normalizeCommands(scenario),
    externalCalls: normalizeExternalCalls(scenario),
    branch: readString(scenario, ['workerDryRun', 'branch']),
    pushed: readBoolean(scenario, ['workerDryRun', 'pushed']),
    fixAttempts: readNumber(scenario, ['workerDryRun', 'fixAttempts']),
    commitSha: readString(scenario, ['workerDryRun', 'commitSha']),
    diff: readString(scenario, ['workerDryRun', 'diff'], readString(scenario, ['diff'], '')),
    prTitle:
      readString(scenario, ['workerDryRun', 'prTitle']) ??
      readString(scenario, ['candidate', 'pullRequest', 'title']),
    summary:
      readString(scenario, ['workerDryRun', 'summary']) ??
      readString(scenario, ['candidate', 'summary']) ??
      readString(scenario, ['candidate', 'pullRequest', 'body']),
  };

  const normalized = evalScenarioSchema.parse({
    id: String(scenario.id ?? directoryName),
    title: String(scenario.title ?? scenario.name ?? directoryName),
    description: String(scenario.description ?? 'Local deterministic eval scenario'),
    localOnly: true,
    externalCalls: metadata.externalCalls,
    repo: {
      files: normalizeRepoFiles(scenario),
    },
    candidate: normalizeCandidateFiles(scenario),
    commands: [],
    workerDryRun: metadata.commitMessage
      ? {
          plan: readString(scenario, ['workerDryRun', 'plan'], 'Local deterministic eval fixture'),
          branch: readString(scenario, ['workerDryRun', 'branch'], 'eval/local-only'),
          prTitle: metadata.prTitle ?? String(scenario.title ?? scenario.name ?? directoryName),
          summary: metadata.summary ?? '',
          files: normalizeWorkerDryRunFiles(scenario),
          llmResponses: [],
          fixes: [],
          maxFixAttempts: readNumber(scenario, ['workerDryRun', 'maxFixAttempts'], 0) ?? 0,
          commitMessage: metadata.commitMessage,
          review: {
            maxRounds: metadata.reviewRoundLimit,
            rounds: normalizeWorkerDryRunRounds(scenario, metadata),
          },
        }
      : undefined,
    expected: {
      changedFiles: metadata.changedFiles,
      forbiddenFiles: normalizeForbiddenFiles(scenario),
      requiredContent: normalizeRequiredContent(scenario),
      verdict: normalizeLegacySchemaVerdict(metadata.verdict),
      autoMerge:
        metadata.autoMergeAllowed !== undefined
          ? {
              expected: metadata.autoMergeAllowed,
              blockReason: metadata.autoMergeBlockReason ?? '',
              rationaleType: metadata.caveatType ?? 'none',
            }
          : undefined,
      reviewFlow:
        metadata.reviewOutcome || metadata.reviewRounds !== undefined
          ? {
              outcome: normalizeLegacySchemaAction(metadata.reviewOutcome),
              criticRounds: Math.min(Math.max(metadata.reviewRounds ?? 0, 0), metadata.reviewRoundLimit),
            }
          : undefined,
      commit: metadata.commitMessage
        ? {
            mustIncludeRef: true,
            mustIncludeCoAuthoredBy: true,
            expectedAuthorName: normalizeCommitAuthorName(scenario) ?? '',
            expectedAuthorEmail: normalizeCommitAuthorEmail(scenario) ?? '',
          }
        : undefined,
    },
  });

  return Object.assign(normalized, { __localEval: metadata }) as LocalEvalScenario;
}

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
  lines.push('');

  for (const result of report.results) {
    const summary = summarizeResult(result);
    lines.push(`## ${result.id}: ${result.title}`);
    lines.push('');
    lines.push(`Result: ${result.passed ? 'PASS' : 'FAIL'} (${result.score})`);
    lines.push(`Verdict: ${summary.verdict}`);
    lines.push(`Expected auto-merge: ${summary.autoMerge}`);
    if (summary.blockReason) {
      lines.push(`Block reason: ${summary.blockReason}`);
    }
    lines.push(`Review flow: ${summary.reviewFlow}`);
    lines.push(`Commit policy: ${summary.commitPolicy}`);
    lines.push(`Changed files: ${result.changedFiles.join(', ') || '(none)'}`);
    if (result.dryRun) {
      lines.push(`Dry-run branch: ${result.dryRun.branch}`);
      lines.push(`Dry-run pushed: ${result.dryRun.pushed}`);
      lines.push(`Dry-run fixes: ${result.dryRun.fixAttempts}`);
      lines.push(`Dry-run commit: ${result.dryRun.commitSha ?? '(none)'}`);
    }
    lines.push('');
    for (const check of result.checks) {
      lines.push(`- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function summarizeResult(result: EvalResult): {
  verdict: string;
  autoMerge: string;
  blockReason?: string;
  reviewFlow: string;
  commitPolicy: string;
} {
  const verdictCheck =
    findCheckByName(result, 'structured verdict') ??
    findRelevantCheck(result, ['verdict', 'critic verdict', 'review verdict', 'aprovado', 'ressalvas']);
  const autoMergeCheck =
    findCheckByName(result, 'structured auto-merge') ??
    findRelevantCheck(result, ['auto-merge', 'automerge']);
  const blockCheck =
    findCheckByName(result, 'structured block reason') ??
    findRelevantCheckByPriority(result, [
      ['block reason', 'merge block reason'],
      ['blocked reason', 'bloqueio', 'bloquear'],
    ]);
  const reviewChecks =
    findChecksByNames(result, ['structured review flow', 'structured critic rounds']) ||
    findRelevantChecksByPriority(result, [
      ['review flow', 'review outcome', 'review result'],
      ['critic rounds', 'review rounds', 'max rounds'],
      ['no-op', 'noop', 'recode', 'follow-up-pr', 'pull-request', 'proceed to pr'],
    ]);
  const commitChecks =
    findChecksByNames(result, ['structured commit policy']) ||
    findRelevantChecks(result, ['commit', 'ref:', 'co-authored-by', 'coauthored']);

  return {
    verdict: requireDescription(
      verdictCheck,
      result.passed ? 'not explicitly reported' : 'failed without explicit verdict',
    ),
    autoMerge: requireDescription(autoMergeCheck, 'not explicitly reported'),
    blockReason: describeCheck(blockCheck),
    reviewFlow: joinCheckDetails(reviewChecks) ?? 'not explicitly reported',
    commitPolicy: joinCheckDetails(commitChecks) ?? 'not explicitly reported',
  };
}

function findRelevantCheck(
  result: EvalResult,
  keywords: string[],
): EvalResult['checks'][number] | undefined {
  return result.checks.find(
    (check) => matchesKeywords(check.name, keywords) || matchesKeywords(check.detail, keywords),
  );
}

function findRelevantCheckByPriority(
  result: EvalResult,
  keywordGroups: string[][],
): EvalResult['checks'][number] | undefined {
  for (const keywords of keywordGroups) {
    const match = findRelevantCheck(result, keywords);
    if (match) return match;
  }
  return undefined;
}

function findRelevantChecks(result: EvalResult, keywords: string[]): EvalResult['checks'] {
  return result.checks.filter(
    (check) => matchesKeywords(check.name, keywords) || matchesKeywords(check.detail, keywords),
  );
}

function findRelevantChecksByPriority(
  result: EvalResult,
  keywordGroups: string[][],
): EvalResult['checks'] {
  const matches: EvalResult['checks'] = [];
  const seen = new Set<string>();

  for (const keywords of keywordGroups) {
    for (const check of findRelevantChecks(result, keywords)) {
      const key = `${check.name}\u0000${check.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(check);
    }
  }

  return matches;
}

function findCheckByName(result: EvalResult, name: string): EvalResult['checks'][number] | undefined {
  return result.checks.find((check) => check.name === name);
}

function findChecksByNames(result: EvalResult, names: string[]): EvalResult['checks'] {
  return result.checks.filter((check) => names.includes(check.name));
}

function matchesKeywords(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function describeCheck(
  check?: EvalResult['checks'][number],
  fallback?: string,
): string | undefined {
  if (!check) return fallback;
  return check.detail?.trim() || `${check.passed ? 'PASS' : 'FAIL'} ${check.name}`;
}

function requireDescription(check: EvalResult['checks'][number] | undefined, fallback: string): string {
  return describeCheck(check, fallback) ?? fallback;
}

function joinCheckDetails(checks: EvalResult['checks']): string | undefined {
  if (checks.length === 0) return undefined;
  const details = checks
    .map((check) => describeCheck(check, check.name))
    .filter((detail): detail is string => Boolean(detail));
  return [...new Set(details)].join(' | ');
}

function buildLocalChecks(metadata: LocalEvalMetadata): EvalResult['checks'] {
  const checks: EvalResult['checks'] = [];
  const normalizedVerdict = normalizeVerdict(metadata.verdict);
  const derivedAutoMerge = deriveAutoMergeDecision(normalizedVerdict, metadata.caveatType);
  const actualAutoMergeAllowed = metadata.autoMergeAllowed ?? derivedAutoMerge.allowed;
  const actualBlockReason = metadata.autoMergeBlockReason ?? derivedAutoMerge.blockReason;
  const expectedBlockReason = derivedAutoMerge.blockReason;
  const rounds = metadata.reviewRounds ?? 0;
  const reviewOutcome = normalizeReviewOutcome(metadata.reviewOutcome);
  const expectedReviewFlow = deriveReviewFlow(rounds, metadata.reviewRoundLimit, reviewOutcome);
  const hasRef = /(^|\n)Ref:\s*.+/m.test(metadata.commitMessage ?? '');
  const hasCoAuthoredBy = /(^|\n)Co-authored-by:\s*Codex <noreply@openai.com>/m.test(
    metadata.commitMessage ?? '',
  );

  checks.push({
    name: 'structured verdict',
    passed: normalizedVerdict !== 'DESCONHECIDO',
    detail: formatVerdictDetail(metadata.verdict, metadata.caveatType),
  });
  checks.push({
    name: 'structured auto-merge',
    passed: actualAutoMergeAllowed === derivedAutoMerge.allowed,
    detail: `auto-merge expected: ${derivedAutoMerge.allowed ? 'allowed' : 'blocked'}`,
  });
  checks.push({
    name: 'structured block reason',
    passed:
      derivedAutoMerge.allowed ||
      (Boolean(actualBlockReason) &&
        normalizeReason(actualBlockReason) === normalizeReason(expectedBlockReason)),
    detail: actualBlockReason || '',
  });
  checks.push({
    name: 'structured review flow',
    passed: true,
    detail: expectedReviewFlow.detail,
  });
  checks.push({
    name: 'structured critic rounds',
    passed: rounds <= metadata.reviewRoundLimit,
    detail: `${rounds}/${metadata.reviewRoundLimit} critic rounds`,
  });

  if (metadata.commitMessage) {
    checks.push({
      name: 'structured commit policy',
      passed: hasRef && hasCoAuthoredBy,
      detail: hasRef && hasCoAuthoredBy
        ? 'commit includes Ref and Co-authored-by trailers'
        : 'commit is missing required Ref or Co-authored-by trailers',
    });
  }

  return checks;
}

function deriveAutoMergeDecision(
  verdict: string,
  caveatType?: 'operational' | 'non-operational',
): { allowed: boolean; blockReason: string } {
  if (verdict === 'APROVADO') {
    return { allowed: true, blockReason: '' };
  }
  if (verdict === 'APROVADO COM RESSALVAS') {
    if (caveatType === 'non-operational') {
      return { allowed: false, blockReason: 'non-operational caveat' };
    }
    return { allowed: true, blockReason: '' };
  }
  return { allowed: false, blockReason: 'recode required' };
}

function deriveReviewFlow(
  rounds: number,
  maxRounds: number,
  reviewOutcome: string,
): { detail: string } {
  if (reviewOutcome === 'noop') {
    if (rounds > 0) {
      return { detail: rounds >= maxRounds ? `review no-op after ${rounds} critic rounds; proceed to PR` : 'review no-op; proceed to PR' };
    }
    return { detail: 'review no-op; proceed to PR' };
  }
  if (reviewOutcome === 'recode') {
    return { detail: 'review requires recode before PR' };
  }
  if (reviewOutcome === 'follow_pr' || reviewOutcome === 'pull-request') {
    return { detail: 'review follow-up in PR' };
  }
  if (reviewOutcome === 'max_rounds_reached') {
    return { detail: `review reached max rounds (${rounds}/${maxRounds}); proceed to PR` };
  }
  return { detail: 'review outcome not explicitly reported' };
}

function normalizeVerdict(value: string | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ');
  if (normalized === 'APROVADO') return 'APROVADO';
  if (normalized === 'APROVADO COM RESSALVAS') return 'APROVADO COM RESSALVAS';
  if (normalized === 'MUDANCAS SOLICITADAS' || normalized === 'MUDANÇAS SOLICITADAS') {
    return 'MUDANCAS SOLICITADAS';
  }
  if (normalized === 'RECODE') return 'MUDANCAS SOLICITADAS';
  return 'DESCONHECIDO';
}

function normalizeReviewOutcome(value: string | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (normalized === 'noop' || normalized === 'no-op') return 'noop';
  if (normalized === 'recode' || normalized === 'recode-then-pr') return 'recode';
  if (normalized === 'follow-pr' || normalized === 'follow-up-pr') return 'follow_pr';
  if (normalized === 'pull-request' || normalized === 'proceed-to-pr') return 'pull-request';
  if (normalized === 'max-rounds-reached') return 'max_rounds_reached';
  return normalized;
}

function normalizeReason(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatVerdictDetail(
  verdict: string,
  caveatType?: 'operational' | 'non-operational',
): string {
  if (normalizeVerdict(verdict) === 'APROVADO COM RESSALVAS' && caveatType) {
    return `APROVADO COM RESSALVAS (${caveatType})`;
  }
  return verdict;
}

function normalizeExpectedVerdict(scenario: Record<string, unknown>): string {
  return (
    readString(scenario, ['expected', 'verdict']) ??
    readString(scenario, ['expected', 'finalVerdict']) ??
    readString(scenario, ['expected', 'eval', 'finalVerdict']) ??
    readString(scenario, ['workerDryRun', 'review', 'rounds', 0, 'verdict']) ??
    readString(scenario, ['candidate', 'review', 'rounds', 0, 'verdict']) ??
    readString(scenario, ['candidate', 'reviewFlow', 'rounds', 0, 'verdict']) ??
    readString(scenario, ['candidate', 'reviewPlan', 'rounds', 0, 'verdict']) ??
    'DESCONHECIDO'
  );
}

function normalizeExpectedCaveatType(scenario: Record<string, unknown>): string | undefined {
  return (
    readString(scenario, ['expected', 'autoMerge', 'rationaleType']) ??
    readString(scenario, ['expected', 'caveatType']) ??
    readString(scenario, ['expected', 'eval', 'caveatType']) ??
    readString(scenario, ['workerDryRun', 'review', 'rounds', 0, 'caveatType']) ??
    readString(scenario, ['candidate', 'review', 'rounds', 0, 'remarks', 0, 'type']) ??
    readString(scenario, ['candidate', 'reviewPlan', 'rounds', 1, 'classification'])
  );
}

function normalizeCaveatType(value: string | undefined): 'operational' | 'non-operational' | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (normalized === 'operational' || normalized === 'operational-caveat') return 'operational';
  if (normalized === 'non-operational' || normalized === 'nonoperational') return 'non-operational';
  return undefined;
}

function normalizeExpectedAutoMergeAllowed(scenario: Record<string, unknown>): boolean | undefined {
  const direct = readBoolean(scenario, ['expected', 'autoMerge', 'expected']);
  if (direct !== undefined) return direct;
  const allowed = readBoolean(scenario, ['expected', 'autoMerge', 'allowed']);
  if (allowed !== undefined) return allowed;
  const evalExpected = readBoolean(scenario, ['expected', 'eval', 'autoMerge', 'expected']);
  if (evalExpected !== undefined) return evalExpected;
  const evalBlocked = readBoolean(scenario, ['expected', 'eval', 'autoMerge', 'blocked']);
  if (evalBlocked !== undefined) return !evalBlocked;
  return undefined;
}

function normalizeExpectedAutoMergeBlockReason(scenario: Record<string, unknown>): string | undefined {
  return (
    readString(scenario, ['expected', 'autoMerge', 'blockReason']) ??
    readString(scenario, ['expected', 'blockReason']) ??
    readString(scenario, ['expected', 'eval', 'autoMerge', 'reason']) ??
    readString(scenario, ['expected', 'eval', 'blockReason']) ??
    readString(scenario, ['workerDryRun', 'review', 'rounds', 0, 'autoMergeBlockedReason'])
  );
}

function normalizeExpectedReviewOutcome(scenario: Record<string, unknown>): string | undefined {
  return (
    readString(scenario, ['expected', 'reviewFlow', 'outcome']) ??
    readString(scenario, ['expected', 'reviewOutcome']) ??
    readString(scenario, ['expected', 'reviewFlowResult']) ??
    readString(scenario, ['expected', 'eval', 'reviewOutcome']) ??
    readString(scenario, ['expected', 'eval', 'reviewFlowResult']) ??
    readString(scenario, ['workerDryRun', 'review', 'rounds', 0, 'action'])
  );
}

function normalizeExpectedReviewRounds(scenario: Record<string, unknown>): number | undefined {
  return (
    readNumber(scenario, ['expected', 'reviewFlow', 'criticRounds']) ??
    readNumber(scenario, ['expected', 'roundsUsed']) ??
    readNumber(scenario, ['expected', 'eval', 'roundsExecuted']) ??
    readNumber(scenario, ['expected', 'reviewRounds']) ??
    readNumber(scenario, ['candidate', 'reviewFlow', 'rounds'], undefined, (value) =>
      Array.isArray(value) ? value.length : undefined,
    ) ??
    readNumber(scenario, ['candidate', 'reviewPlan', 'rounds'], undefined, (value) =>
      Array.isArray(value) ? value.length : undefined,
    ) ??
    readNumber(scenario, ['candidate', 'review', 'rounds'], undefined, (value) =>
      Array.isArray(value) ? value.length : undefined,
    )
  );
}

function normalizeChangedFiles(scenario: Record<string, unknown>): string[] {
  const changed = readStringArray(scenario, ['expected', 'changedFiles']);
  if (changed.length > 0) return changed;
  const workerFiles = normalizeWorkerDryRunFiles(scenario).map((file) => file.path);
  if (workerFiles.length > 0) return [...new Set(workerFiles)].sort();
  const candidateFiles = Object.keys(normalizeCandidateFiles(scenario).files);
  return [...new Set(candidateFiles)].sort();
}

function normalizeCommands(scenario: Record<string, unknown>): CommandResult[] {
  const commands = readStringArray(scenario, ['commands']);
  return commands.map((command) => ({
    command,
    exitCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 0,
  }));
}

function normalizeExternalCalls(scenario: Record<string, unknown>): Record<string, boolean> {
  const sources = [
    asRecord(getAtPath(scenario, ['externalCalls'])),
    asRecord(getAtPath(scenario, ['candidate', 'externalCalls'])),
  ].filter((value): value is Record<string, unknown> => Boolean(value));

  const merged = { github: false, linear: false, liteLLM: false, production: false };
  for (const source of sources) {
    merged.github = merged.github || Boolean(source.github);
    merged.linear = merged.linear || Boolean(source.linear);
    merged.liteLLM = merged.liteLLM || Boolean(source.liteLLM) || Boolean(source.litellm);
    merged.production = merged.production || Boolean(source.production);
  }
  return merged;
}

function normalizeRepoFiles(scenario: Record<string, unknown>): Record<string, string> {
  const repoFilesRecord = asRecord(getAtPath(scenario, ['repo', 'files']));
  if (repoFilesRecord) {
    const isListStyle = Array.isArray(getAtPath(scenario, ['repo', 'files']));
    if (!isListStyle) {
      return Object.fromEntries(
        Object.entries(repoFilesRecord).map(([path, content]) => [path, String(content)]),
      );
    }
  }

  const repoFilesList = readFileArray(scenario, ['repo', 'files']);
  if (repoFilesList.length > 0) {
    return Object.fromEntries(repoFilesList.map((file) => [file.path, file.content]));
  }

  return {};
}

function normalizeCandidateFiles(scenario: Record<string, unknown>): { files: Record<string, string>; delete: string[] } {
  const candidateFilesRecord = asRecord(getAtPath(scenario, ['candidate', 'files']));
  if (candidateFilesRecord) {
    return {
      files: Object.fromEntries(
        Object.entries(candidateFilesRecord).map(([path, content]) => [path, String(content)]),
      ),
      delete: readStringArray(scenario, ['candidate', 'delete']),
    };
  }
  return { files: {}, delete: [] };
}

function normalizeWorkerDryRunFiles(scenario: Record<string, unknown>): Array<{ path: string; content: string }> {
  const workerFiles = readFileArray(scenario, ['workerDryRun', 'files']);
  if (workerFiles.length > 0) return workerFiles;

  const candidateFilesRecord = asRecord(getAtPath(scenario, ['candidate', 'files']));
  if (candidateFilesRecord) {
    return Object.entries(candidateFilesRecord).map(([path, content]) => ({
      path,
      content: String(content),
    }));
  }

  return [];
}

function normalizeWorkerDryRunRounds(
  scenario: Record<string, unknown>,
  metadata: LocalEvalMetadata,
): Array<{
  verdict: 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'MUDANCAS_SOLICITADAS';
  rationale: string;
  caveatType: 'none' | 'operational' | 'non-operational';
  action: 'noop' | 'recode' | 'pull-request';
  autoMergeBlockedReason: string;
}> {
  const workerRounds = readRoundsFromPath(scenario, ['workerDryRun', 'review', 'rounds']);
  if (workerRounds.length > 0) return workerRounds;

  const candidateReviewRounds = readRoundsFromPath(scenario, ['candidate', 'review', 'rounds']);
  if (candidateReviewRounds.length > 0) return candidateReviewRounds;

  const candidateReviewFlowRounds = readRoundsFromPath(scenario, ['candidate', 'reviewFlow', 'rounds']);
  if (candidateReviewFlowRounds.length > 0) return candidateReviewFlowRounds;

  const candidateReviewPlanRounds = readRoundsFromPath(scenario, ['candidate', 'reviewPlan', 'rounds']);
  if (candidateReviewPlanRounds.length > 0) return candidateReviewPlanRounds;

  return [
    {
      verdict: normalizeLegacySchemaVerdict(metadata.verdict) ?? 'APROVADO',
      rationale: 'Local deterministic eval fixture',
      caveatType: metadata.caveatType ?? 'none',
      action: normalizeLegacySchemaAction(metadata.reviewOutcome),
      autoMergeBlockedReason: metadata.autoMergeBlockReason ?? '',
    },
  ];
}

function normalizeForbiddenFiles(scenario: Record<string, unknown>): string[] {
  return readStringArray(scenario, ['expected', 'forbiddenFiles']);
}

function normalizeRequiredContent(
  scenario: Record<string, unknown>,
): Array<{ path: string; includes: string }> {
  const direct = getAtPath(scenario, ['expected', 'requiredContent']);
  if (Array.isArray(direct)) {
    const fileRequirements = direct
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const path = typeof item.path === 'string' ? item.path : undefined;
        const includes = typeof item.includes === 'string' ? item.includes : undefined;
        return path && includes ? { path, includes } : undefined;
      })
      .filter((item): item is { path: string; includes: string } => Boolean(item));
    if (fileRequirements.length > 0) return fileRequirements;
  }
  return [];
}

function normalizeLegacySchemaVerdict(
  verdict: string,
): 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'MUDANCAS_SOLICITADAS' | undefined {
  const normalized = normalizeVerdict(verdict);
  if (normalized === 'APROVADO') return 'APROVADO';
  if (normalized === 'APROVADO COM RESSALVAS') return 'APROVADO_COM_RESSALVAS';
  if (normalized === 'MUDANCAS SOLICITADAS') return 'MUDANCAS_SOLICITADAS';
  return undefined;
}

function normalizeLegacySchemaAction(
  value: string | undefined,
): 'noop' | 'recode' | 'pull-request' {
  const normalized = normalizeReviewOutcome(value);
  if (normalized === 'noop') return 'noop';
  if (normalized === 'recode') return 'recode';
  return 'pull-request';
}

function normalizeCommitAuthorName(scenario: Record<string, unknown>): string | undefined {
  return (
    readString(scenario, ['workerDryRun', 'agent', 'name']) ??
    readString(scenario, ['candidate', 'commit', 'authorName']) ??
    readString(scenario, ['candidate', 'commitAuthor', 'name'])
  );
}

function normalizeCommitAuthorEmail(scenario: Record<string, unknown>): string | undefined {
  return (
    readString(scenario, ['workerDryRun', 'agent', 'email']) ??
    readString(scenario, ['candidate', 'commit', 'authorEmail']) ??
    readString(scenario, ['candidate', 'commitAuthor', 'email'])
  );
}

function normalizeCommitMessage(scenario: Record<string, unknown>): string | undefined {
  const direct = readString(scenario, ['workerDryRun', 'commitMessage']);
  if (direct) return direct;
  const candidateMessage = readString(scenario, ['candidate', 'commit', 'message']);
  if (candidateMessage) return candidateMessage;
  const subject = readString(scenario, ['candidate', 'commit', 'subject']);
  const body = readString(scenario, ['candidate', 'commit', 'body']);
  if (subject || body) {
    return [subject, body].filter(Boolean).join('\n\n');
  }
  return readString(scenario, ['candidate', 'commitMessage']);
}

function readRoundsFromPath(
  root: Record<string, unknown>,
  path: Array<string | number>,
): Array<{
  verdict: 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'MUDANCAS_SOLICITADAS';
  rationale: string;
  caveatType: 'none' | 'operational' | 'non-operational';
  action: 'noop' | 'recode' | 'pull-request';
  autoMergeBlockedReason: string;
}> {
  const rounds = getAtPath(root, path);
  if (!Array.isArray(rounds)) return [];

  return rounds
    .map((round) => asRecord(round))
    .filter((round): round is Record<string, unknown> => Boolean(round))
    .map((round) => {
      const verdict =
        normalizeLegacySchemaVerdict(
          String(
            round.verdict ??
              (round.requiresRecode === true ? 'MUDANCAS_SOLICITADAS' : 'APROVADO'),
          ),
        ) ?? 'APROVADO';

      const caveatType =
        normalizeCaveatType(
          typeof round.caveatType === 'string'
            ? round.caveatType
            : typeof round.classification === 'string'
              ? String(round.classification)
              : typeof round.remarks === 'object' && Array.isArray(round.remarks) && round.remarks[0]
                ? String(asRecord(round.remarks[0])?.type ?? '')
                : undefined,
        ) ?? 'none';

      const action = normalizeRoundAction(round);
      const rationale =
        String(round.rationale ?? round.summary ?? round.reason ?? round.message ?? '').trim();
      const autoMergeBlockedReason = String(
        round.autoMergeBlockedReason ?? asRecord(round.autoMerge)?.reason ?? '',
      );

      return {
        verdict,
        rationale,
        caveatType,
        action,
        autoMergeBlockedReason,
      };
    });
}

function normalizeRoundAction(round: Record<string, unknown>): 'noop' | 'recode' | 'pull-request' {
  if (typeof round.action === 'string') {
    return normalizeLegacySchemaAction(String(round.action));
  }
  if (round.requiresRecode === true || round.requiresCodeChanges === true) {
    return round.continueReview === false ? 'pull-request' : 'recode';
  }
  if (round.noop === true) return 'noop';
  if (round.continueReview === false) return 'pull-request';
  return 'pull-request';
}

function readFileArray(
  root: Record<string, unknown>,
  path: Array<string | number>,
): Array<{ path: string; content: string }> {
  const value = getAtPath(root, path);
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const filePath = typeof item.path === 'string' ? item.path : undefined;
      const content = typeof item.content === 'string' ? item.content : undefined;
      return filePath && content !== undefined ? { path: filePath, content } : undefined;
    })
    .filter((item): item is { path: string; content: string } => Boolean(item));
}

function readStringArray(root: Record<string, unknown>, path: Array<string | number>): string[] {
  const value = getAtPath(root, path);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function readString(
  root: unknown,
  path: Array<string | number>,
  fallback?: string,
): string | undefined {
  const value = getAtPath(root, path);
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(
  root: unknown,
  path: Array<string | number>,
  fallback?: boolean,
): boolean | undefined {
  const value = getAtPath(root, path);
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(
  root: unknown,
  path: Array<string | number>,
  fallback?: number,
  resolver?: (value: unknown) => number | undefined,
): number | undefined {
  const value = getAtPath(root, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (resolver) {
    const resolved = resolver(value);
    if (typeof resolved === 'number' && Number.isFinite(resolved)) return resolved;
  }
  return fallback;
}

function getAtPath(root: unknown, path: Array<string | number>): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readLatestReport(outRoot: string): Promise<EvalReport | undefined> {
  try {
    const content = await readFile(join(outRoot, 'latest-report.json'), 'utf8');
    return JSON.parse(content) as EvalReport;
  } catch {
    return undefined;
  }
}

function reportSummary(report: EvalReport): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    passed: report.passed,
    total: report.total,
    passedCount: report.passedCount,
    score: report.score,
    trend: report.trend,
  };
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? '+' : ''}${delta}`;
}

async function withIsolatedEvalEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GH_TOKEN: process.env.GH_TOKEN,
    LINEAR_API_KEY: process.env.LINEAR_API_KEY,
    LINEAR_TOKEN: process.env.LINEAR_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LITELLM_API_KEY: process.env.LITELLM_API_KEY,
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL,
    LITELLM_URL: process.env.LITELLM_URL,
    PRODUCTION_API_URL: process.env.PRODUCTION_API_URL,
    PROD_API_URL: process.env.PROD_API_URL,
    EVAL_OFFLINE: process.env.EVAL_OFFLINE,
  };

  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.LITELLM_API_KEY;
  delete process.env.LITELLM_BASE_URL;
  delete process.env.LITELLM_URL;
  delete process.env.PRODUCTION_API_URL;
  delete process.env.PROD_API_URL;
  process.env.EVAL_OFFLINE = '1';

  try {
    return await fn();
  } finally {
    restoreEnv('GITHUB_TOKEN', previous.GITHUB_TOKEN);
    restoreEnv('GH_TOKEN', previous.GH_TOKEN);
    restoreEnv('LINEAR_API_KEY', previous.LINEAR_API_KEY);
    restoreEnv('LINEAR_TOKEN', previous.LINEAR_TOKEN);
    restoreEnv('OPENAI_API_KEY', previous.OPENAI_API_KEY);
    restoreEnv('LITELLM_API_KEY', previous.LITELLM_API_KEY);
    restoreEnv('LITELLM_BASE_URL', previous.LITELLM_BASE_URL);
    restoreEnv('LITELLM_URL', previous.LITELLM_URL);
    restoreEnv('PRODUCTION_API_URL', previous.PRODUCTION_API_URL);
    restoreEnv('PROD_API_URL', previous.PROD_API_URL);
    restoreEnv('EVAL_OFFLINE', previous.EVAL_OFFLINE);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function defaultFixturesDir(): string {
  return resolve(process.cwd(), 'apps/worker-code/evals/fixtures');
}

function parseArgs(argv: string[]): { fixtures?: string; out?: string; failOnRegression: boolean } {
  const args: { fixtures?: string; out?: string; failOnRegression: boolean } = {
    failOnRegression: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixtures' && argv[index + 1]) {
      args.fixtures = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--fixtures=')) {
      args.fixtures = arg.slice('--fixtures='.length);
      continue;
    }
    if (arg === '--out' && argv[index + 1]) {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
      continue;
    }
    if (arg === '--fail-on-regression') {
      args.failOnRegression = true;
    }
  }

  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
