import { z } from 'zod';

/** Job enviado pelo orquestrador para o runner executar em sandbox. */
export const jobSchema = z.object({
  runId: z.string().uuid(),
  issueIdentifier: z.string().min(1),
  repoUrl: z.string().min(1),
  baseBranch: z.string().min(1).default('main'),
  branch: z.string().min(1),
  /** Comandos a rodar após preparar o worktree (ex.: install, test). */
  commands: z.array(z.string()).default([]),
});

export type Job = z.infer<typeof jobSchema>;

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface JobResult {
  runId: string;
  status: 'succeeded' | 'failed';
  branch: string;
  commands: CommandResult[];
  error?: string;
}
