import { z } from 'zod';
import type { CommandResult } from '../types.js';

const evalFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const evalReviewVerdictSchema = z.enum([
  'APROVADO',
  'APROVADO_COM_RESSALVAS',
  'MUDANCAS_SOLICITADAS',
]);

const evalReviewCaveatTypeSchema = z.enum([
  'none',
  'operational',
  'non-operational',
]);

const evalReviewActionSchema = z.enum(['noop', 'recode', 'pull-request']);

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  repo: z.object({
    files: z.record(z.string()),
  }),
  candidate: z
    .object({
      files: z.record(z.string()).default({}),
      delete: z.array(z.string()).default([]),
    })
    .default({ files: {}, delete: [] }),
  workerDryRun: z
    .object({
      plan: z.string().min(1),
      branch: z.string().min(1).default('agent/eval-dry-run'),
      prTitle: z.string().min(1),
      summary: z.string().default(''),
      files: z.array(evalFileSchema).default([]),
      llmResponses: z.array(z.string()).default([]),
      fixes: z
        .array(
          z.object({
            summary: z.string().default(''),
            files: z.array(evalFileSchema).default([]),
          }),
        )
        .default([]),
      maxFixAttempts: z.number().int().min(0).default(2),
      commitMessage: z.string().default(''),
      review: z
        .object({
          maxRounds: z.number().int().min(1).max(3).default(3),
          rounds: z
            .array(
              z.object({
                verdict: evalReviewVerdictSchema,
                rationale: z.string().default(''),
                caveatType: evalReviewCaveatTypeSchema.default('none'),
                action: evalReviewActionSchema.default('pull-request'),
                autoMergeBlockedReason: z.string().default(''),
              }),
            )
            .default([]),
        })
        .optional(),
    })
    .optional(),
  commands: z.array(z.string()).default([]),
  expected: z.object({
    changedFiles: z.array(z.string()),
    forbiddenFiles: z.array(z.string()).default([]),
    requiredContent: z
      .array(
        z.object({
          path: z.string().min(1),
          includes: z.string().min(1),
        }),
      )
      .default([]),
    verdict: evalReviewVerdictSchema.optional(),
    autoMerge: z
      .object({
        expected: z.boolean(),
        blockReason: z.string().default(''),
        rationaleType: evalReviewCaveatTypeSchema.default('none'),
      })
      .optional(),
    reviewFlow: z
      .object({
        outcome: evalReviewActionSchema,
        criticRounds: z.number().int().min(0).max(3),
      })
      .optional(),
    commit: z
      .object({
        mustIncludeRef: z.boolean().default(false),
        mustIncludeCoAuthoredBy: z.boolean().default(false),
        expectedAuthorName: z.string().default(''),
        expectedAuthorEmail: z.string().default(''),
      })
      .optional(),
  }),
});

export type EvalScenario = z.infer<typeof evalScenarioSchema>;

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EvalResult {
  id: string;
  title: string;
  passed: boolean;
  score: number;
  changedFiles: string[];
  commands: CommandResult[];
  checks: EvalCheck[];
  artifactDir: string;
  verdict?: 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'MUDANCAS_SOLICITADAS';
  autoMerge?: {
    expected: boolean;
    blocked: boolean;
    blockReason?: string;
    rationaleType?: 'none' | 'operational' | 'non-operational';
  };
  reviewFlow?: {
    outcome: 'noop' | 'recode' | 'pull-request';
    criticRounds: number;
  };
  commit?: {
    hasRef: boolean;
    hasCoAuthoredBy: boolean;
    authorName?: string;
    authorEmail?: string;
  };
  dryRun?: {
    branch: string;
    commitSha?: string;
    diff: string;
    filesChanged: string[];
    fixAttempts: number;
    prTitle: string;
    summary: string;
    pushed: false;
  };
}

export interface EvalReport {
  generatedAt: string;
  passed: boolean;
  total: number;
  passedCount: number;
  score: number;
  trend?: EvalTrend;
  results: EvalResult[];
}

export interface EvalTrend {
  previousGeneratedAt?: string;
  previousScore?: number;
  scoreDelta?: number;
  regressed: boolean;
  regressedScenarios: string[];
}
