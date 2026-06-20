import type { CardGateway } from '@agent-platform/cards';
import { describe, expect, it, vi } from 'vitest';
import { makeMergingNode } from './merging.js';

function deps() {
  const cards: CardGateway = {
    provider: 'plane',
    getCard: async () => ({
      provider: 'plane',
      id: 'iss',
      identifier: 'MAC-1',
      title: 'Title',
      description: '',
      labels: [],
    }),
    comment: vi.fn(async () => {}),
    setCardState: vi.fn(async () => {}),
    createCard: async () => ({
      provider: 'plane',
      id: 'iss',
      identifier: 'MAC-1',
      title: 'Title',
      description: '',
      labels: [],
    }),
  };
  return {
    github: { mergePullRequest: vi.fn(async () => {}), deleteBranch: vi.fn(async () => {}) },
    cards,
    doneStateId: 'done-id',
  };
}
const okState = {
  autoMerge: true,
  testsPassed: true,
  review: 'Veredito: APROVADO',
  prNumber: 7,
  branch: 'agent/x',
  issueId: 'iss',
  status: 'completed',
};

describe('makeMergingNode', () => {
  it('no-op quando o gate não passa (sem chamar github/cards)', async () => {
    const d = deps();
    const node = makeMergingNode(d as never);
    const out = await node({ ...okState, autoMerge: false } as never);
    expect(d.github.mergePullRequest).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });

  it('mergeia (squash), deleta branch, comenta e move pra Done', async () => {
    const d = deps();
    const out = await makeMergingNode(d as never)(okState as never);
    expect(d.github.mergePullRequest).toHaveBeenCalledWith({ number: 7, method: 'squash' });
    expect(d.github.deleteBranch).toHaveBeenCalledWith('agent/x');
    expect(d.cards.setCardState).toHaveBeenCalledWith('iss', 'done-id');
    expect(d.cards.comment).toHaveBeenCalled();
    expect(out).toEqual({ autoMerged: true });
  });

  it('passa repo alvo para merge e delete quando targetRepo está no estado', async () => {
    const d = deps();
    await makeMergingNode(d as never)({ ...okState, targetRepo: 'attodevlabs/lp-acme' } as never);
    expect(d.github.mergePullRequest).toHaveBeenCalledWith({
      number: 7,
      method: 'squash',
      repo: { owner: 'attodevlabs', repo: 'lp-acme' },
    });
    expect(d.github.deleteBranch).toHaveBeenCalledWith('agent/x', {
      owner: 'attodevlabs',
      repo: 'lp-acme',
    });
  });

  it('merge falha → comenta e segue (non-fatal, não lança)', async () => {
    const d = deps();
    d.github.mergePullRequest = vi.fn(async () => {
      throw new Error('not mergeable');
    });
    const out = await makeMergingNode(d as never)(okState as never);
    expect(d.cards.comment).toHaveBeenCalled();
    expect(d.github.deleteBranch).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });
});
