import { formatDelta } from './trend.js';
import type { EvalReport, EvalResult } from './types.js';

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
    const insights = extractResultInsights(result);
    lines.push(`## ${result.id}: ${result.title}`);
    lines.push('');
    lines.push(`Result: ${result.passed ? 'PASS' : 'FAIL'} (${result.score})`);
    if (insights.verdict) lines.push(`Verdict: ${insights.verdict}`);
    if (insights.reviewOutcome) lines.push(`Review outcome: ${insights.reviewOutcome}`);
    if (insights.autoMergeExpected)
      lines.push(`Expected auto-merge: ${insights.autoMergeExpected}`);
    if (insights.blockReason) lines.push(`Auto-merge block reason: ${insights.blockReason}`);
    if (insights.criticRounds) lines.push(`Critic rounds: ${insights.criticRounds}`);
    if (insights.commitSummary) lines.push(`Commit policy: ${insights.commitSummary}`);
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

function extractResultInsights(result: EvalResult): {
  verdict?: string;
  reviewOutcome?: string;
  autoMergeExpected?: string;
  blockReason?: string;
  criticRounds?: string;
  commitSummary?: string;
} {
  const dryRun = asRecord(result.dryRun);
  const checks = result.checks;

  const verdict =
    readString(dryRun, ['reviewVerdict', 'verdict', 'finalVerdict']) ??
    findCheckValue(checks, ['eval verdict']) ??
    findCheckDetail(checks, ['verdict']);

  const reviewOutcome =
    readString(dryRun, ['reviewOutcome', 'reviewAction']) ??
    findCheckValue(checks, ['review outcome']) ??
    inferReviewOutcomeFromChecks(checks);

  const autoMerge =
    readBooleanLike(dryRun, ['expectedAutoMerge', 'autoMergeExpected', 'shouldAutoMerge']) ??
    parseYesNo(findCheckValue(checks, ['auto-merge expectation'])) ??
    inferAutoMergeFromChecks(checks);
  const autoMergeExpected = autoMerge === undefined ? undefined : autoMerge ? 'yes' : 'no';

  const structuredBlockReason = readString(dryRun, [
    'autoMergeBlockReason',
    'blockReason',
    'blockedReason',
  ]);
  const inferredBlockReason =
    autoMerge === false
      ? (findCheckValue(checks, ['auto-merge block reason']) ??
        findAutoMergeBlockReasonFromChecks(checks))
      : undefined;
  const blockReason = structuredBlockReason ?? inferredBlockReason;

  const rounds =
    readNumberLike(dryRun, ['criticRounds', 'reviewRounds', 'criticRoundCount']) ??
    parseNumber(findCheckValue(checks, ['critic rounds'])) ??
    parseFractionLeft(findCheckValue(checks, ['critic rounds limit']));
  const maxRounds =
    readNumberLike(dryRun, ['maxCriticRounds', 'maxReviewRounds', 'agentMaxReviewRounds']) ??
    parseFractionRight(findCheckValue(checks, ['critic rounds limit'])) ??
    undefined;
  const criticRounds =
    rounds === undefined
      ? undefined
      : maxRounds === undefined
        ? String(rounds)
        : `${rounds}/${maxRounds}`;

  const commitSummary = summarizeCommitPolicy(result, dryRun);

  return {
    verdict,
    reviewOutcome,
    autoMergeExpected,
    blockReason,
    criticRounds,
    commitSummary,
  };
}

function summarizeCommitPolicy(
  result: EvalResult,
  dryRun: Record<string, unknown> | undefined,
): string | undefined {
  const commitMessage =
    readString(dryRun, ['commitMessage', 'finalCommitMessage']) ??
    findCheckDetail(result.checks, ['commit message']);
  const authorName =
    readString(dryRun, ['commitAuthorName', 'authorName']) ??
    parseAuthorField(findCheckValue(result.checks, ['commit author']), 'name');
  const authorEmail =
    readString(dryRun, ['commitAuthorEmail', 'authorEmail']) ??
    parseAuthorField(findCheckValue(result.checks, ['commit author']), 'email');
  const explicitRefStatus = findCheckValue(result.checks, ['commit Ref trailer']);
  const explicitCoauthoredStatus = findCheckValue(result.checks, ['commit Co-authored-by trailer']);
  const hasRef = explicitRefStatus
    ? explicitRefStatus === 'present'
    : (commitMessage?.includes('Ref:') ?? false);
  const hasCoauthored = explicitCoauthoredStatus
    ? explicitCoauthoredStatus === 'present'
    : (commitMessage?.includes('Co-authored-by: Codex <noreply@openai.com>') ?? false);

  if (
    !commitMessage &&
    !authorName &&
    !authorEmail &&
    !explicitRefStatus &&
    !explicitCoauthoredStatus
  ) {
    return undefined;
  }

  const parts: string[] = [];
  if (authorName || authorEmail) {
    parts.push(`author ${authorName ?? '(unknown)'} <${authorEmail ?? '(unknown)'}>`);
  }
  if (commitMessage || explicitRefStatus) {
    parts.push(`Ref: ${hasRef ? 'present' : 'missing'}`);
    parts.push(`Co-authored-by: ${hasCoauthored ? 'present' : 'missing'}`);
  }
  return parts.join('; ');
}

function findCheckDetail(checks: EvalResult['checks'], keywords: string[]): string | undefined {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (loweredKeywords.every((keyword) => haystack.includes(keyword))) {
      return check.detail;
    }
  }
  return undefined;
}

function findCheckValue(checks: EvalResult['checks'], keywords: string[]): string | undefined {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const check of checks) {
    const haystack = check.name.toLowerCase();
    if (loweredKeywords.every((keyword) => haystack.includes(keyword))) {
      if (!check.detail.startsWith('expected ')) return check.detail;
    }
  }
  return undefined;
}

function inferReviewOutcomeFromChecks(checks: EvalResult['checks']): string | undefined {
  const noOp = checks.find((check) => includesAll(`${check.name} ${check.detail}`, ['no-op']));
  if (noOp) return 'no-op';
  const recode = checks.find((check) => includesAll(`${check.name} ${check.detail}`, ['recode']));
  if (recode) return 'recode';
  return undefined;
}

function inferAutoMergeFromChecks(checks: EvalResult['checks']): boolean | undefined {
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (!haystack.includes('auto-merge')) continue;

    if (
      haystack.includes('not blocked') ||
      haystack.includes('not disabled') ||
      haystack.includes('no block reason') ||
      haystack.includes('without blockers')
    ) {
      return true;
    }

    if (
      haystack.includes('blocked') ||
      haystack.includes('disabled') ||
      haystack.includes('not allowed') ||
      haystack.includes('must not merge')
    ) {
      return false;
    }

    if (
      haystack.includes('allowed') ||
      haystack.includes('enabled') ||
      haystack.includes('approved for merge') ||
      haystack.includes('can merge')
    ) {
      return true;
    }

    if (/(^|\W)yes($|\W)/.test(haystack)) return true;
    if (/(^|\W)no($|\W)/.test(haystack)) return false;
  }
  return undefined;
}

function findAutoMergeBlockReasonFromChecks(checks: EvalResult['checks']): string | undefined {
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (!haystack.includes('auto-merge')) continue;
    if (haystack.includes('not blocked') || haystack.includes('no block reason')) continue;
    if (
      haystack.includes('blocked') ||
      haystack.includes('disabled') ||
      haystack.includes('not allowed') ||
      haystack.includes('must not merge')
    ) {
      return check.detail;
    }
  }
  return undefined;
}

function includesAll(value: string, keywords: string[]): boolean {
  const lowered = value.toLowerCase();
  return keywords.every((keyword) => lowered.includes(keyword.toLowerCase()));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function readBooleanLike(
  record: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
  }
  return undefined;
}

function readNumberLike(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseYesNo(value: string | undefined): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFractionLeft(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)\/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function parseFractionRight(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)\/(\d+)$/);
  return match ? Number(match[2]) : undefined;
}

function parseAuthorField(author: string | undefined, field: 'name' | 'email'): string | undefined {
  if (!author) return undefined;
  const match = author.match(/^(.*) <(.*)>$/);
  if (!match) return undefined;
  return field === 'name' ? match[1] : match[2];
}
