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

  it('accepts empty responses for write paths', async () => {
    const responses = [
      new Response(null, { status: 204, statusText: 'No Content' }),
      new Response(null, { status: 204, statusText: 'No Content' }),
    ];
    const fetchMock = vi.fn().mockImplementation(async () => responses.shift()!);
    globalThis.fetch = fetchMock as typeof fetch;

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.comment('work-3', 'Body')).resolves.toBeUndefined();
    await expect(gateway.setCardState('work-3', 'state-2')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/work-3/comments/',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/work-3/',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('renders markdown links into comment html payloads', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body ?? '');
      return new Response(null, { status: 204, statusText: 'No Content' });
    }) as typeof fetch;

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(
      gateway.comment('work-3', 'Migrated from Linear: [MAC-123](https://linear/MAC-123).'),
    ).resolves.toBeUndefined();

    expect(JSON.parse(String(capturedBody))).toEqual({
      comment_html: '<p>Migrated from Linear: <a href="https://linear/MAC-123">MAC-123</a>.</p>',
      access: 'EXTERNAL',
    });
  });

  it('surfaces Plane API errors with response details', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500, statusText: 'Internal Server Error' }),
    ) as typeof fetch;

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.getCard('work-4')).rejects.toThrow(
      'Plane API 500 Internal Server Error: boom',
    );
  });

  it('looks up cards by external provenance using encoded query params and normalized results', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'work-5',
              sequence_id: 12,
              name: 'Lookup result',
              description_stripped: null,
              labels: ['ready', { name: 'linked' }, { name: '' }],
              project_identifier: 'PROJ',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(
      gateway.listCardsByExternal({
        externalSource: 'linear board',
        externalId: 'MAC/121',
      }),
    ).resolves.toEqual([
      {
        provider: 'plane',
        id: 'work-5',
        identifier: 'PROJ-12',
        title: 'Lookup result',
        description: '',
        labels: ['ready', 'linked'],
        projectId: 'project-1',
      },
    ]);

    expect(calls[0]?.url).toBe(
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/?external_source=linear%20board&external_id=MAC%2F121',
    );
  });

  it('lists existing work item comment html for provenance dedupe', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const page =
        calls.length === 1
          ? {
              next_cursor: 'cursor-2',
              results: [{ id: 'comment-1', comment_html: '<p>Earlier comment.</p>' }],
            }
          : {
              next_cursor: null,
              results: [
                {
                  id: 'comment-2',
                  comment_html: '<p>Migrated from Linear: [MAC-5](https://linear/MAC-5).</p>',
                },
              ],
            };
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.listComments('work-5')).resolves.toEqual([
      '<p>Earlier comment.</p>',
      '<p>Migrated from Linear: [MAC-5](https://linear/MAC-5).</p>',
    ]);

    expect(calls[0]?.url).toBe(
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/work-5/comments/?per_page=100',
    );
    expect(calls[1]?.url).toBe(
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/work-5/comments/?per_page=100&cursor=cursor-2',
    );
  });

  it('lists project labels and states across paginated responses', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const responseByUrl = new Map<string, unknown>([
        [
          'http://plane.local/api/v1/workspaces/attodev/projects/project-1/labels/?per_page=100',
          {
            next_cursor: 'label-cursor-2',
            results: [{ id: 'label-1', name: 'ai-ready' }],
          },
        ],
        [
          'http://plane.local/api/v1/workspaces/attodev/projects/project-1/labels/?per_page=100&cursor=label-cursor-2',
          {
            next_cursor: null,
            results: [{ id: 'label-2', name: 'Customer Escalation' }],
          },
        ],
        [
          'http://plane.local/api/v1/workspaces/attodev/projects/project-1/states/?per_page=100',
          {
            next_cursor: 'state-cursor-2',
            results: [{ id: 'state-1', name: 'Backlog' }],
          },
        ],
        [
          'http://plane.local/api/v1/workspaces/attodev/projects/project-1/states/?per_page=100&cursor=state-cursor-2',
          {
            next_cursor: null,
            results: [{ id: 'state-2', name: 'Unstarted' }],
          },
        ],
      ]);
      const payload = responseByUrl.get(url);
      if (!payload) {
        throw new Error(`Unexpected request: ${url}`);
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.listLabels()).resolves.toEqual([
      { id: 'label-1', name: 'ai-ready' },
      { id: 'label-2', name: 'Customer Escalation' },
    ]);
    await expect(gateway.listStates()).resolves.toEqual([
      { id: 'state-1', name: 'Backlog' },
      { id: 'state-2', name: 'Unstarted' },
    ]);
  });
});
