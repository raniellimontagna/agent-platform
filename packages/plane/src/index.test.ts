import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaneGateway } from './index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('createPlaneGateway', () => {
  it('normalizes retrieved work items into CardContext', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'work-1',
        sequence_id: 7,
        name: 'Build cards',
        description_stripped: 'Description',
        labels: [{ name: 'ai-ready' }],
        project_detail: { identifier: 'AGP' },
      }),
    } as Response);

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.getCard('work-1')).resolves.toEqual({
      provider: 'plane',
      id: 'work-1',
      identifier: 'AGP-7',
      title: 'Build cards',
      description: 'Description',
      labels: ['ai-ready'],
      projectId: 'project-1',
    });
  });

  it('creates work items with external provenance', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: 'work-2',
          sequence_id: 8,
          name: 'Migrated',
          description_stripped: 'Body',
          labels: [],
          project_detail: { identifier: 'AGP' },
        }),
      } as Response;
    });

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await gateway.createCard({
      title: 'Migrated',
      description: 'Body',
      externalSource: 'linear',
      externalId: 'MAC-121',
    });

    expect(calls[0]?.url).toBe(
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/',
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      name: 'Migrated',
      description_html: '<p>Body</p>',
      description_stripped: 'Body',
      external_source: 'linear',
      external_id: 'MAC-121',
    });
  });
});
