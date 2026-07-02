import type { LlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import type { CommandResult } from '../types.js';
import { applyFix as defaultApplyFix } from './codegen.js';
import { restoreLandingMediaAsset as defaultRestoreLandingMediaAsset } from './jobMedia.js';
import type { ValidationResult } from './jobValidation.js';
import { summarizeFailureTail } from './validation.js';

export interface SelfCorrectionState {
  filesChanged: string[];
  fixAttempts: number;
  costUsd?: number;
}

export interface LandingMediaRestore {
  artifactPath: string;
  assetPath: string;
}

export type CommitAttempt =
  | {
      committed: boolean;
      sha?: string;
    }
  | {
      failure: CommandResult;
    };

type ApplyFixImpl = typeof defaultApplyFix;
type RestoreLandingMediaAsset = typeof defaultRestoreLandingMediaAsset;

interface SelfCorrectionContext {
  llm: LlmClient;
  dir: string;
  plan: string;
  title: string;
  agentKey?: string;
  agentCapabilities?: string[];
  log: Logger;
  applyFix?: ApplyFixImpl;
  landingMedia?: LandingMediaRestore;
  restoreLandingMediaAsset?: RestoreLandingMediaAsset;
}

interface ApplySelfCorrectionArgs extends SelfCorrectionContext {
  state: SelfCorrectionState;
  failureTail: string;
  reason: string;
}

export async function applySelfCorrection(args: ApplySelfCorrectionArgs): Promise<{
  fixed: boolean;
  state: SelfCorrectionState;
}> {
  const fixAttempts = args.state.fixAttempts + 1;
  args.log.info({ attempt: fixAttempts, reason: args.reason }, 'tentando auto-correção');
  try {
    const fix = await (args.applyFix ?? defaultApplyFix)({
      llm: args.llm,
      dir: args.dir,
      filesChanged: args.state.filesChanged,
      failureTail: args.failureTail,
      plan: args.plan,
      title: args.title,
      agentKey: args.agentKey,
      agentCapabilities: args.agentCapabilities,
      log: args.log,
    });
    let filesChanged = [...new Set([...args.state.filesChanged, ...fix.filesChanged])];
    if (args.landingMedia) {
      await (args.restoreLandingMediaAsset ?? defaultRestoreLandingMediaAsset)(
        args.dir,
        args.landingMedia.artifactPath,
        args.landingMedia.assetPath,
      );
      filesChanged = [...new Set([...filesChanged, args.landingMedia.assetPath])];
    }
    return {
      fixed: true,
      state: {
        filesChanged,
        fixAttempts,
        costUsd: (args.state.costUsd ?? 0) + fix.costUsd,
      },
    };
  } catch (err) {
    args.log.warn({ err, attempt: fixAttempts }, 'fix falhou — encerrando o loop');
    return {
      fixed: false,
      state: {
        ...args.state,
        fixAttempts,
      },
    };
  }
}

interface FixValidationFailuresArgs extends SelfCorrectionContext {
  validation: ValidationResult;
  state: SelfCorrectionState;
  maxFixAttempts: number;
  runValidation: (filesChanged: string[]) => Promise<ValidationResult>;
}

export async function fixValidationFailures(args: FixValidationFailuresArgs): Promise<{
  validation: ValidationResult;
  state: SelfCorrectionState;
}> {
  let validation = args.validation;
  let state = args.state;
  while (!validation.passed && state.fixAttempts < args.maxFixAttempts) {
    const correction = await applySelfCorrection({
      ...args,
      state,
      failureTail: validation.failureTail,
      reason: 'validation failed',
    });
    state = correction.state;
    if (!correction.fixed) break;
    validation = await args.runValidation(state.filesChanged);
  }
  return { validation, state };
}

interface RetryCommitWithSelfCorrectionArgs extends SelfCorrectionContext {
  validation: ValidationResult;
  state: SelfCorrectionState;
  maxFixAttempts: number;
  tryCommit: () => Promise<CommitAttempt>;
  runValidation: (filesChanged: string[]) => Promise<ValidationResult>;
}

export async function retryCommitWithSelfCorrection(
  args: RetryCommitWithSelfCorrectionArgs,
): Promise<{
  commit: CommitAttempt;
  validation: ValidationResult;
  state: SelfCorrectionState;
  commitFailure?: CommandResult;
}> {
  let validation = args.validation;
  let state = args.state;
  let commitFailure: CommandResult | undefined;
  let commit = await args.tryCommit();

  while ('failure' in commit && state.fixAttempts < args.maxFixAttempts) {
    commitFailure = commit.failure;
    const correction = await applySelfCorrection({
      ...args,
      state,
      failureTail: summarizeFailureTail([commit.failure]),
      reason: 'git commit failed',
    });
    state = correction.state;
    if (!correction.fixed) break;
    validation = await args.runValidation(state.filesChanged);
    const validationResult = await fixValidationFailures({
      ...args,
      validation,
      state,
    });
    validation = validationResult.validation;
    state = validationResult.state;
    commit = await args.tryCommit();
  }

  return { commit, validation, state, commitFailure };
}
