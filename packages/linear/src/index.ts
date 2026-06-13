import { LinearClient } from '@linear/sdk';

/** Retry com backoff p/ chamadas read-only transitórias ao Linear (MAC-33). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1)));
    }
  }
  throw lastErr;
}

export interface IssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string;
}

export interface LinearGateway {
  getIssue(id: string): Promise<IssueContext>;
  comment(issueId: string, body: string): Promise<void>;
  createIssue(input: {
    title: string;
    description: string;
    teamId: string;
    labelIds?: string[];
  }): Promise<IssueContext>;
}

/**
 * Wrapper mínimo sobre o SDK do Linear com só o que o orquestrador precisa:
 * ler a issue (contexto) e comentar (plano, progresso, resultado).
 */
export function createLinearGateway(apiKey: string): LinearGateway {
  const client = new LinearClient({ apiKey });

  return {
    async getIssue(id) {
      // Read-only → seguro retentar em falha transitória de rede/API (MAC-33).
      const issue = await withRetry(() => client.issue(id));
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? '',
      };
    },

    async comment(issueId, body) {
      await client.createComment({ issueId, body });
    },

    async createIssue(input) {
      const payload = await client.createIssue({
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
      });
      const issue = await payload.issue;
      if (!issue) throw new Error('Linear createIssue não retornou a issue');
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? '',
      };
    },
  };
}
