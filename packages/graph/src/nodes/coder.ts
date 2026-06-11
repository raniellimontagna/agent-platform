import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';

export interface RunnerConfig {
  baseUrl: string;
  authToken: string;
  /** URL de clone (já com credencial embutida, se repo privado). */
  repoUrl: string;
}

export interface CoderDeps {
  linear: LinearGateway;
  runner: RunnerConfig;
}

interface RunnerResult {
  status: 'succeeded' | 'failed';
  branch: string;
  error?: string;
  commitSha?: string;
  filesChanged?: string[];
  summary?: string;
  pushed?: boolean;
}

function slugify(text: string): string {
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
export function makeCoderNode(deps: CoderDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const branch = `agent/${state.issueIdentifier.toLowerCase()}-${slugify(state.title)}`;

    try {
      const res = await fetch(`${deps.runner.baseUrl}/jobs/sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.runner.authToken}`,
        },
        body: JSON.stringify({
          runId: state.runId,
          issueIdentifier: state.issueIdentifier,
          repoUrl: deps.runner.repoUrl,
          baseBranch: 'main',
          branch,
          title: state.title,
          description: state.description,
          plan: state.plan,
          commands: [],
        }),
      });

      if (!res.ok) {
        throw new Error(`runner respondeu ${res.status}: ${await res.text()}`);
      }

      const result = (await res.json()) as RunnerResult;
      const ok = result.status === 'succeeded';
      const errorBlock = result.error ? `\n\n\`\`\`\n${result.error}\n\`\`\`` : '';
      const files = result.filesChanged?.length
        ? `\n\nArquivos: ${result.filesChanged.map((f) => `\`${f}\``).join(', ')}`
        : '';

      await deps.linear.comment(
        state.issueId,
        `## 🤖 Execução\nBranch \`${branch}\` — runner: **${result.status}**.` +
          `${result.summary ? `\n\n${result.summary}` : ''}${files}${errorBlock}`,
      );

      return {
        branch,
        commitSha: result.commitSha,
        summary: result.summary,
        pushed: result.pushed ?? false,
        status: ok ? 'completed' : 'failed',
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
