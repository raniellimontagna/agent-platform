import { LinearClient } from '@linear/sdk';
import type { CardContext, CardGateway, CreateCardInput } from '@agent-platform/cards';

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (i - 1)));
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

function toIssueContext(issue: {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
}): IssueContext {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? '',
  };
}

function toCardContext(issue: IssueContext): CardContext {
  return {
    provider: 'linear',
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    labels: [],
  };
}

export interface LinearGateway extends CardGateway {
  provider: 'linear';
  getIssue(id: string): Promise<IssueContext>;
  createIssue(input: {
    title: string;
    description: string;
    teamId: string;
    labelIds?: string[];
  }): Promise<IssueContext>;
  setIssueState(issueId: string, stateId: string): Promise<void>;
}

/**
 * Wrapper mínimo sobre o SDK do Linear com só o que o orquestrador precisa:
 * ler a issue (contexto) e comentar (plano, progresso, resultado).
 */
export function createLinearGateway(apiKey: string, defaults?: { teamId?: string }): LinearGateway {
  const client = new LinearClient({ apiKey });

  const gateway: LinearGateway = {
    provider: 'linear',

    async getIssue(id) {
      const issue = await withRetry(() => client.issue(id));
      return toIssueContext(issue);
    },

    async getCard(id) {
      return toCardContext(await gateway.getIssue(id));
    },

    async comment(issueId, body) {
      await client.createComment({ issueId, body });
    },

    async setCardState(issueId, stateId) {
      await client.updateIssue(issueId, { stateId });
    },

    async setIssueState(issueId, stateId) {
      await gateway.setCardState(issueId, stateId);
    },

    async createIssue(input) {
      const payload = await client.createIssue({
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
      });
      const issue = await payload.issue;
      if (!issue) throw new Error('Linear createIssue nao retornou a issue');
      return toIssueContext(issue);
    },

    async createCard(input: CreateCardInput) {
      if (!defaults?.teamId) {
        throw new Error('Linear teamId default is required to create cards');
      }
      return toCardContext(
        await gateway.createIssue({
          title: input.title,
          description: input.description,
          teamId: defaults.teamId,
          labelIds: input.labelIds,
        }),
      );
    },
  };

  return gateway;
}
