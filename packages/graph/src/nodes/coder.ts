import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';

export interface CoderDeps {
  linear: LinearGateway;
  /** URL de clone do repo alvo (vai no body do job). */
  repoUrl: string;
  /** Despacha o job pro runner com health/failover (MAC-39). */
  dispatch: DispatchFn;
  /** Comandos de validação rodados no sandbox após o push (MAC-29). */
  testCommands: string[];
  /** Carrega as lições do repo já formatadas p/ o codegen (MAC-23). Opcional. */
  loadLessons?: () => Promise<string>;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Corpo do job enviado ao runner (MAC-39: despachado via dispatch injetado). */
export interface RunnerJobBody {
  runId: string;
  issueIdentifier: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  title: string;
  description: string;
  plan: string;
  commands: string[];
  lessons: string;
  reviewFeedback: string;
}

export interface RunnerResult {
  status: 'succeeded' | 'failed';
  branch: string;
  error?: string;
  commitSha?: string;
  filesChanged?: string[];
  summary?: string;
  pushed?: boolean;
  diff?: string;
  testsPassed?: boolean;
  commands?: CommandResult[];
  costUsd?: number;
  prTitle?: string;
  fixAttempts?: number;
}

/** Despacha um job pro runner e devolve o resultado (impl no orchestrator). */
export type DispatchFn = (body: RunnerJobBody) => Promise<RunnerResult>;

/** Resumo curto dos comandos de validação: status + tail do que falhou. */
function summarizeTests(commands: CommandResult[] = []): string {
  if (commands.length === 0) return '';
  return commands
    .map((c) => {
      const ok = c.exitCode === 0;
      const head = `- \`${c.command}\` → ${ok ? '✅' : `❌ exit ${c.exitCode}`}`;
      if (ok) return head;
      const tail = (c.stderr || c.stdout || '').trim().slice(-600);
      return `${head}\n\`\`\`\n${tail}\n\`\`\``;
    })
    .join('\n');
}

/** Normaliza um texto p/ slug de branch (exportado p/ teste). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Nó CODING (MAC-17): cria a branch de trabalho e despacha o job para o runner
 * (worker-code) de forma síncrona, passando o plano aprovado. O runner clona um
 * worktree isolado, gera o código via `strong_coder`, commita e pusha a branch,
 * roda as validações e devolve o resultado. Reporta no Linear (MAC-21).
 *
 * Em sucesso, mantém o status `coding` e marca `pushed` para o nó PR (MAC-26)
 * abrir o Draft PR em seguida.
 */
export function makeCoderNode(deps: CoderDeps, opts: { revise?: boolean } = {}) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    // Sufixo com short runId torna a branch única por run — evita colisão de
    // push (non-fast-forward) e PR 422 ao re-executar a mesma issue.
    const shortRun = state.runId.slice(0, 8);
    const branch = opts.revise
      ? state.branch
      : `agent/${state.issueIdentifier.toLowerCase()}-${slugify(state.title)}-${shortRun}`;

    try {
      const lessons = deps.loadLessons ? await deps.loadLessons() : '';

      const result = await deps.dispatch({
        runId: state.runId,
        issueIdentifier: state.issueIdentifier,
        repoUrl: deps.repoUrl,
        baseBranch: 'main',
        branch,
        title: state.title,
        description: state.description,
        plan: state.plan,
        commands: deps.testCommands,
        lessons,
        reviewFeedback: opts.revise ? (state.reviewFeedback ?? '') : '',
      });
      const ok = result.status === 'succeeded';
      const errorBlock = result.error ? `\n\n\`\`\`\n${result.error}\n\`\`\`` : '';
      const files = result.filesChanged?.length
        ? `\n\nArquivos: ${result.filesChanged.map((f) => `\`${f}\``).join(', ')}`
        : '';

      const testSummary = summarizeTests(result.commands);
      const testsBlock =
        result.testsPassed === undefined
          ? ''
          : `\n\n**Validação:** ${result.testsPassed ? '✅ passou' : '❌ falhou'}\n${testSummary}`;
      const fixBlock =
        result.fixAttempts && result.fixAttempts > 0
          ? `\n\n🔧 Auto-correção: ${result.fixAttempts} tentativa(s) antes da validação final.`
          : '';

      await deps.linear.comment(
        state.issueId,
        `## 🤖 Execução${opts.revise ? ` (revisão ${state.reviewRounds ?? 1})` : ''}\nBranch \`${branch}\` — runner: **${result.status}**.` +
          `${result.summary ? `\n\n${result.summary}` : ''}${files}${testsBlock}${fixBlock}${errorBlock}`,
      );

      return {
        branch,
        commitSha: result.commitSha,
        summary: result.summary,
        pushed: result.pushed ?? false,
        diff: result.diff,
        testsPassed: result.testsPassed,
        testSummary,
        fixAttempts: result.fixAttempts,
        codeCostUsd: result.costUsd,
        prTitle: result.prTitle,
        // Mantém `coding` no sucesso → roteia para o nó review (MAC-18) → pr.
        status: ok ? 'coding' : 'failed',
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.linear.comment(
        state.issueId,
        `## ⚠️ Execução falhou\n\n\`\`\`\n${message}\n\`\`\``,
      );
      return { branch, status: 'failed', error: message };
    }
  };
}
