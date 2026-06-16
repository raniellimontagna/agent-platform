import { z } from 'zod';
import type { CommandResult } from '../types.js';

const evalFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

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
  };
}

export interface EvalReport {
  generatedAt: string;
  passed: boolean;
  total: number;
  passedCount: number;
  score: number;
  results: EvalResult[];
}
