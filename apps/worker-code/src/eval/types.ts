import { z } from 'zod';
import type { CommandResult } from '../types.js';

const evalFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const evalCommitAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const evalReviewNoteSchema = z.object({
  kind: z.enum(['operational', 'non-operational']),
  summary: z.string().min(1),
});

const evalReviewSchema = z.object({
  verdict: z.enum(['APROVADO', 'APROVADO COM RESSALVAS', 'SOLICITAR MUDANCAS']),
  notes: z.array(evalReviewNoteSchema).default([]),
  autoMergeEligible: z.boolean().default(false),
  blockReason: z.string().default(''),
  reviewOutcome: z.enum(['noop', 'recode']).default('noop'),
  criticRounds: z.number().int().min(0).max(3).default(0),
});

const evalIsolationSchema = z.object({
  allowNetwork: z.boolean().default(false),
  allowGitHub: z.boolean().default(false),
  allowLinear: z.boolean().default(false),
  allowLiteLLM: z.boolean().default(false),
  externalCalls: z.array(z.string()).default([]),
});

export const evalScenarioSchema = z.object({
  version: z.literal(2).default(2),
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
      commitAuthor: evalCommitAuthorSchema.optional(),
      commitTrailers: z.array(z.string()).default([]),
      review: evalReviewSchema.optional(),
      isolation: evalIsolationSchema.default({
        allowNetwork: false,
        allowGitHub: false,
        allowLinear: false,
        allowLiteLLM: false,
        externalCalls: [],
      }),
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
    review: evalReviewSchema.optional(),
    commit: z
      .object({
        author: evalCommitAuthorSchema.optional(),
        messageIncludes: z.array(z.string().min(1)).default([]),
        trailersInclude: z.array(z.string().min(1)).default([]),
      })
      .optional(),
    isolation: evalIsolationSchema.default({
      allowNetwork: false,
      allowGitHub: false,
      allowLinear: false,
      allowLiteLLM: false,
      externalCalls: [],
    }),
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
  dryRun?: {
    branch: string;
    commitSha?: string;
    diff: string;
    filesChanged: string[];
    fixAttempts: number;
    prTitle: string;
    summary: string;
    pushed: false;
    commitMessage?: string;
    commitAuthor?: {
      name: string;
      email: string;
    };
    commitTrailers?: string[];
    reviewVerdict?: 'APROVADO' | 'APROVADO COM RESSALVAS' | 'SOLICITAR MUDANCAS';
    reviewOutcome?: 'noop' | 'recode';
    criticRounds?: number;
    autoMergeExpected?: boolean;
    autoMergeBlockedBy?: string;
    externalCalls?: string[];
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
