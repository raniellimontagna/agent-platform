import { LinearClient } from '@linear/sdk';

export interface IssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string;
}

export interface LinearGateway {
  getIssue(id: string): Promise<IssueContext>;
  comment(issueId: string, body: string): Promise<void>;
}

/**
 * Wrapper mínimo sobre o SDK do Linear com só o que o orquestrador precisa:
 * ler a issue (contexto) e comentar (plano, progresso, resultado).
 */
export function createLinearGateway(apiKey: string): LinearGateway {
  const client = new LinearClient({ apiKey });

  return {
    async getIssue(id) {
      const issue = await client.issue(id);
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
  };
}
