import { describe, expect, it, vi } from 'vitest';
import { REQUIRED_PLANE_LABELS, ensurePlaneProjectAndLabels } from './planeBootstrap.js';

describe('ensurePlaneProjectAndLabels', () => {
  it('creates Agent Platform when AGP is missing', async () => {
    const calls: string[] = [];
    const fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/projects/?per_page=100')) {
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }
      if (url.endsWith('/projects/')) {
        return {
          ok: true,
          json: async () => ({ id: 'project-1', identifier: 'AGP' }),
        } as Response;
      }
      if (url.endsWith('/labels/') && !init?.method) {
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ id: 'label-1' }) } as Response;
    });

    const result = await ensurePlaneProjectAndLabels({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      fetch,
    });

    expect(result.projectId).toBe('project-1');
    expect(result.labelIds['ai-ready']).toBe('label-1');
    expect(calls.some((call) => call.includes('POST'))).toBe(true);
  });

  it('reuses an existing AGP project and matching labels without creating duplicates', async () => {
    const calls: string[] = [];
    const fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/projects/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'project-9', identifier: 'AGP' }] }),
        } as Response;
      }
      if (url.endsWith('/projects/project-9/labels/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({
            results: REQUIRED_PLANE_LABELS.map((name, index) => ({
              id: `label-${index + 1}`,
              name,
            })),
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await ensurePlaneProjectAndLabels({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      fetch,
    });

    expect(result).toEqual({
      projectId: 'project-9',
      labelIds: Object.fromEntries(
        REQUIRED_PLANE_LABELS.map((name, index) => [name, `label-${index + 1}`]),
      ),
    });
    expect(calls.every((call) => !call.startsWith('POST '))).toBe(true);
  });

  it('finds an existing AGP project on later pagination pages', async () => {
    const calls: string[] = [];
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/projects/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ id: 'project-1', identifier: 'OPS' }],
            next_cursor: '100:1:0',
            next_page_results: true,
          }),
        } as Response;
      }
      if (url.endsWith('/projects/?per_page=100&cursor=100%3A1%3A0')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ id: 'project-9', identifier: 'AGP' }],
            next_cursor: '',
            next_page_results: false,
          }),
        } as Response;
      }
      if (url.endsWith('/projects/project-9/labels/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({
            results: REQUIRED_PLANE_LABELS.map((name, index) => ({
              id: `label-${index + 1}`,
              name,
            })),
            next_cursor: '',
            next_page_results: false,
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await ensurePlaneProjectAndLabels({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      fetch,
    });

    expect(result.projectId).toBe('project-9');
    expect(calls).toContain(
      'http://plane.local/api/v1/workspaces/attodev/projects/?per_page=100&cursor=100%3A1%3A0',
    );
  });

  it('finds existing labels on later pagination pages without recreating them', async () => {
    const calls: string[] = [];
    const fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/projects/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'project-9', identifier: 'AGP' }] }),
        } as Response;
      }
      if (url.endsWith('/projects/project-9/labels/?per_page=100')) {
        return {
          ok: true,
          json: async () => ({
            results: REQUIRED_PLANE_LABELS.slice(0, 4).map((name, index) => ({
              id: `label-${index + 1}`,
              name,
            })),
            next_cursor: '100:1:0',
            next_page_results: true,
          }),
        } as Response;
      }
      if (url.endsWith('/projects/project-9/labels/?per_page=100&cursor=100%3A1%3A0')) {
        return {
          ok: true,
          json: async () => ({
            results: REQUIRED_PLANE_LABELS.slice(4).map((name, index) => ({
              id: `label-${index + 5}`,
              name,
            })),
            next_cursor: '',
            next_page_results: false,
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await ensurePlaneProjectAndLabels({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      fetch,
    });

    expect(result.labelIds).toEqual(
      Object.fromEntries(REQUIRED_PLANE_LABELS.map((name, index) => [name, `label-${index + 1}`])),
    );
    expect(calls).toContain(
      'GET http://plane.local/api/v1/workspaces/attodev/projects/project-9/labels/?per_page=100&cursor=100%3A1%3A0',
    );
    expect(calls.every((call) => !call.startsWith('POST '))).toBe(true);
  });
});
