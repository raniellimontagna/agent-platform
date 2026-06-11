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
 * (worker-code) de forma síncrona. O runner clona um worktree isolado, roda os
 * comandos e devolve o resultado. Reporta no Linear (MAC-21).
 *
 * TODO(Fase 4): inserir a etapa de geração de código via `strong_coder` antes
 * dos testes. Por ora o runner só valida o ciclo clonar → comandos → resultado.
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
          commands: [],
        }),
      });

      if (!res.ok) {
        throw new Error(`runner respondeu ${res.status}: ${await res.text()}`);
      }

      const result = (await res.json()) as RunnerResult;
      const ok = result.status === 'succeeded';
      const errorBlock = result.error ? `\n\n\`\`\`\n${result.error}\n\`\`\`` : '';

      await deps.linear.comment(
        state.issueId,
        `## 🤖 Execução\nBranch \`${branch}\` — runner: **${result.status}**.${errorBlock}`,
      );

      return { branch, status: ok ? 'completed' : 'failed', error: result.error };
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
