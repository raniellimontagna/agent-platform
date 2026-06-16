import { z } from 'zod';
import type { CommandResult } from '../types.js';

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  repo: z.object({
    files: z.record(z.string()),
  }),
  candidate: z.object({
    files: z.record(z.string()).default({}),
    delete: z.array(z.string()).default([]),
  }),
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
}

export interface EvalReport {
  generatedAt: string;
  passed: boolean;
  total: number;
  passedCount: number;
  score: number;
  results: EvalResult[];
}
