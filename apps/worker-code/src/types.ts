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
  /** Usa a branch base clonada sem criar uma branch de trabalho. */
  checkoutOnly: z.boolean().default(false),
  /** Título da issue — contexto para a geração de código (MAC-17). */
  title: z.string().default(''),
  /** Descrição da issue — contexto para a geração de código. */
  description: z.string().default(''),
  /** Plano aprovado (Planner, MAC-16) que guia a geração de código. */
  plan: z.string().default(''),
  /** Lições de runs anteriores do repo, já formatadas (Memory Layer, MAC-23). */
  lessons: z.string().default(''),
  /** Parecer do critic a endereçar — ativa o modo revisão (MAC-59). */
  reviewFeedback: z.string().default(''),
  /** Agente selecionado no Agent Registry. */
  agentKey: z.string().optional(),
  /** Capacidades declarativas do agente selecionado. */
  agentCapabilities: z.array(z.string()).default([]),
});

export type Job = z.infer<typeof jobSchema>;

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxSummary {
  backend: 'process' | 'docker';
  image?: string;
  network?: string;
  commandCount: number;
  totalDurationMs: number;
  maxCommandDurationMs: number;
  failedCommand?: string;
}

export interface JobResult {
  runId: string;
  status: 'succeeded' | 'failed';
  branch: string;
  commands: CommandResult[];
  error?: string;
  /** SHA do commit gerado pelo Coder (MAC-17), se houve mudança. */
  commitSha?: string;
  /** Arquivos alterados pela geração de código. */
  filesChanged?: string[];
  /** Resumo das alterações produzido pelo modelo. */
  summary?: string;
  /** Research pack produzido por agentes de coleta. */
  research?: string;
  /** Se a branch foi efetivamente enviada (push) ao remoto. */
  pushed?: boolean;
  /** Diff das alterações vs. base branch (para o Reviewer, MAC-18). */
  diff?: string;
  /** Todos os comandos de validação passaram (MAC-29). undefined = não rodou. */
  testsPassed?: boolean;
  /** Custo estimado das chamadas LLM do codegen em USD (MAC-40). */
  costUsd?: number;
  /** Título Conventional Commits em inglês p/ o PR (MAC-26). */
  prTitle?: string;
  /** Quantas correções de auto-fix rodaram após falha de validação (0 = passou de primeira). */
  fixAttempts?: number;
  /** Resumo agregado da execução de validação no sandbox (observabilidade). */
  sandbox?: SandboxSummary;
}
