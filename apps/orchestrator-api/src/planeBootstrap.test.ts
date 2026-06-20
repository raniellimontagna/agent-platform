import { describe, expect, it, vi } from 'vitest';
import { ensurePlaneProjectAndLabels, REQUIRED_PLANE_LABELS } from './planeBootstrap.js';

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
      if (url.endsWith('/projects/project-9/labels/')) {
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
});
