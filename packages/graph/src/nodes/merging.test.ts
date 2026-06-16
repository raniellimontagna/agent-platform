import { describe, expect, it, vi } from 'vitest';
import { makeMergingNode } from './merging.js';

function deps() {
  return {
    github: { mergePullRequest: vi.fn(async () => {}), deleteBranch: vi.fn(async () => {}) },
    linear: { comment: vi.fn(async () => {}), setIssueState: vi.fn(async () => {}) },
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
  it('no-op quando o gate não passa (sem chamar github/linear)', async () => {
    const d = deps();
    const node = makeMergingNode(d as never);
    const out = await node({ ...okState, autoMerge: false } as never);
    expect(d.github.mergePullRequest).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });

  it('mergeia (squash), deleta branch, comenta e move pra Done', async () => {
    const d = deps();
    await makeMergingNode(d as never)(okState as never);
    expect(d.github.mergePullRequest).toHaveBeenCalledWith({ number: 7, method: 'squash' });
    expect(d.github.deleteBranch).toHaveBeenCalledWith('agent/x');
    expect(d.linear.setIssueState).toHaveBeenCalledWith('iss', 'done-id');
    expect(d.linear.comment).toHaveBeenCalled();
  });

  it('merge falha → comenta e segue (non-fatal, não lança)', async () => {
    const d = deps();
    d.github.mergePullRequest = vi.fn(async () => {
      throw new Error('not mergeable');
    });
    const out = await makeMergingNode(d as never)(okState as never);
    expect(d.linear.comment).toHaveBeenCalled();
    expect(d.github.deleteBranch).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });
});
