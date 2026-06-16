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

const evalExternalCallsSchema = z
  .object({
    github: z.boolean().default(false),
    linear: z.boolean().default(false),
    liteLLM: z.boolean().default(false),
    production: z.boolean().default(false),
  })
  .default({
    github: false,
    linear: false,
    liteLLM: false,
    production: false,
  });

const evalReviewRoundSchema = z.object({
  verdict: evalReviewVerdictSchema,
  rationale: z.string().default(''),
  caveatType: evalReviewCaveatTypeSchema.default('none'),
  action: evalReviewActionSchema.default('pull-request'),
  autoMergeBlockedReason: z.string().default(''),
});

const evalExpectedAutoMergeSchema = z.object({
  expected: z.boolean(),
  blockReason: z.string().default(''),
  rationaleType: evalReviewCaveatTypeSchema.default('none'),
});

const evalExpectedReviewFlowSchema = z.object({
  outcome: evalReviewActionSchema,
  criticRounds: z.number().int().min(0).max(3),
});

const evalExpectedCommitSchema = z.object({
  mustIncludeRef: z.boolean().default(false),
  mustIncludeCoAuthoredBy: z.boolean().default(false),
  expectedAuthorName: z.string().default(''),
  expectedAuthorEmail: z.string().default(''),
});

export const evalScenarioSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    localOnly: z.boolean().default(true),
    externalCalls: evalExternalCallsSchema,
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
            rounds: z.array(evalReviewRoundSchema).default([]),
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
      autoMerge: evalExpectedAutoMergeSchema.optional(),
      reviewFlow: evalExpectedReviewFlowSchema.optional(),
      commit: evalExpectedCommitSchema.optional(),
    }),
  })
  .superRefine((scenario, ctx) => {
    if (scenario.localOnly) {
      const enabledExternalCalls = Object.entries(scenario.externalCalls).filter(
        ([, enabled]) => enabled,
      );

      if (enabledExternalCalls.length > 0) {
        for (const [service] of enabledExternalCalls) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['externalCalls', service],
            message: `localOnly scenarios must not enable external calls to ${service}`,
          });
        }
      }
    }

    const review = scenario.workerDryRun?.review;
    const commitMessage = scenario.workerDryRun?.commitMessage ?? '';

    if (review) {
      if (review.rounds.length > review.maxRounds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workerDryRun', 'review', 'rounds'],
          message: `review rounds (${review.rounds.length}) exceed maxRounds (${review.maxRounds})`,
        });
      }

      review.rounds.forEach((round, index) => {
        if (
          round.caveatType === 'non-operational' &&
          round.verdict === 'APROVADO_COM_RESSALVAS' &&
          !round.autoMergeBlockedReason.trim()
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'workerDryRun',
              'review',
              'rounds',
              index,
              'autoMergeBlockedReason',
            ],
            message:
              'non-operational caveats must declare an auto-merge block reason',
          });
        }
      });
    }

    if (scenario.expected.verdict && !review) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected', 'verdict'],
        message: 'expected.verdict requires workerDryRun.review fixtures',
      });
    }

    if (scenario.expected.autoMerge) {
      if (!review || review.rounds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expected', 'autoMerge'],
          message: 'expected.autoMerge requires at least one structured review round',
        });
      }

      if (
        scenario.expected.autoMerge.expected &&
        scenario.expected.autoMerge.rationaleType === 'non-operational'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expected', 'autoMerge', 'rationaleType'],
          message:
            'non-operational caveats must block auto-merge in expected.autoMerge',
        });
      }

      if (
        !scenario.expected.autoMerge.expected &&
        !scenario.expected.autoMerge.blockReason.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expected', 'autoMerge', 'blockReason'],
          message: 'blocked auto-merge expectations must provide a block reason',
        });
      }
    }

    if (scenario.expected.reviewFlow) {
      if (!review) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expected', 'reviewFlow'],
          message: 'expected.reviewFlow requires workerDryRun.review fixtures',
        });
      } else if (scenario.expected.reviewFlow.criticRounds > review.maxRounds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expected', 'reviewFlow', 'criticRounds'],
          message:
            'expected.reviewFlow.criticRounds cannot exceed workerDryRun.review.maxRounds',
        });
      }
    }

    if (scenario.expected.commit) {
      if (!commitMessage.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workerDryRun', 'commitMessage'],
          message: 'expected.commit requires workerDryRun.commitMessage',
        });
      }

      if (
        scenario.expected.commit.mustIncludeRef &&
        !commitMessage.includes('Ref:')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workerDryRun', 'commitMessage'],
          message: 'commitMessage must include a Ref: trailer when required',
        });
      }

      if (
        scenario.expected.commit.mustIncludeCoAuthoredBy &&
        !commitMessage.includes('Co-authored-by: Codex <noreply@openai.com>')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workerDryRun', 'commitMessage'],
          message:
            'commitMessage must include Co-authored-by: Codex <noreply@openai.com> when required',
        });
      }
    }
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
    pushed: boolean;
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
