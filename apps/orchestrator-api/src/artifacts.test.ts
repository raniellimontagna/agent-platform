import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertValues = vi.fn();
const insert = vi.fn(() => ({ values: insertValues }));

vi.mock('./db/client.js', () => ({
  db: { insert: (...a: unknown[]) => insert(...a) },
  schema: { artifacts: { __table: 'artifacts' } },
}));

import { saveArtifacts } from './artifacts.js';

beforeEach(() => {
  vi.clearAllMocks();
  insertValues.mockResolvedValue(undefined);
});

describe('saveArtifacts', () => {
  it('grava só os kinds não-vazios', async () => {
    await saveArtifacts('run-1', {
      plan: 'P',
      patch: '',
      review: undefined,
      summary: 'S',
      research: 'R',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insertValues.mock.calls[0][0];
    expect(rows).toEqual([
      { runId: 'run-1', kind: 'plan', content: 'P' },
      { runId: 'run-1', kind: 'summary', content: 'S' },
      { runId: 'run-1', kind: 'research', content: 'R' },
    ]);
  });

  it('não chama insert quando tudo vazio', async () => {
    await saveArtifacts('run-1', { plan: '', patch: undefined });
    expect(insert).not.toHaveBeenCalled();
  });

  it('trata content só-espaços como vazio', async () => {
    await saveArtifacts('run-1', { plan: '   ' });
    expect(insert).not.toHaveBeenCalled();
  });
});
