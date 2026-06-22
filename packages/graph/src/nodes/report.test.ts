import type { CardGateway } from '@agent-platform/cards';
import { describe, expect, it } from 'vitest';
import { makeReportNode, verdictOf } from './report.js';

describe('verdictOf', () => {
  it('extrai veredito com markdown', () => {
    expect(verdictOf('## **Veredito**: APROVADO\n\nresto')).toBe('APROVADO');
  });

  it('extrai APROVADO COM RESSALVAS', () => {
    expect(verdictOf('**Veredito**: APROVADO COM RESSALVAS')).toBe('APROVADO COM RESSALVAS');
  });

  it('extrai REPROVADO sem markdown', () => {
    expect(verdictOf('Veredito: REPROVADO')).toBe('REPROVADO');
  });

  it('devolve travessão quando não há review', () => {
    expect(verdictOf(undefined)).toBe('—');
    expect(verdictOf('sem veredito aqui')).toBe('—');
  });
});

it('report node accepts a generic card gateway', async () => {
  const comments: string[] = [];
  const cards: CardGateway = {
    provider: 'plane',
    getCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
    comment: async (_cardId, body) => {
      comments.push(body);
    },
    setCardState: async () => undefined,
    createCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
  };

  const node = makeReportNode({ cards });
  await node({
    runId: 'run-1',
    issueId: 'card-1',
    issueIdentifier: 'AGP-1',
    title: 'Card',
    description: '',
    status: 'completed',
  } as never);

  expect(comments[0]).toContain('AGP-1');
});

it('inclui métricas de qualidade no comentário final', async () => {
  const comments: string[] = [];
  const cards: CardGateway = {
    provider: 'plane',
    getCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
    comment: async (_cardId, body) => {
      comments.push(body);
    },
    setCardState: async () => undefined,
    createCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
  };

  const node = makeReportNode({ cards });
  await node({
    runId: 'run-1',
    issueId: 'card-1',
    issueIdentifier: 'AGP-1',
    title: 'Card',
    description: '',
    status: 'completed',
    pushed: true,
    testsPassed: true,
    review: 'Veredito: APROVADO',
    reviewRounds: 1,
    fixAttempts: 0,
    prUrl: 'https://github.com/acme/repo/pull/1',
    autoMerge: true,
  } as never);

  expect(comments[0]).toContain('**Qualidade:** critic `APROVADO`, validação passou, PR aberto');
  expect(comments[0]).toContain('**Auto-merge:** elegível');
});
