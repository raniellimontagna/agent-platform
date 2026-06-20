export const REQUIRED_PLANE_LABELS = [
  'ai-ready',
  'approved',
  'auto-merge',
  'repo:create',
  'workflow:landing-page',
  'agent:reviewer',
  'agent:landing-page',
  'agent:data-collector',
  'Improvement',
  'Feature',
] as const;

export interface PlaneBootstrapConfig {
  baseUrl: string;
  apiKey: string;
  workspaceSlug: string;
  fetch?: typeof globalThis.fetch;
}

export interface PlaneBootstrapResult {
  projectId: string;
  labelIds: Record<string, string>;
}

interface PlaneProject {
  id: string;
  identifier: string;
}

interface PlaneLabel {
  id: string;
  name: string;
}

interface PlanePage<T> {
  results?: T[];
  next_cursor?: string | null;
  next_page_results?: boolean;
}

export async function ensurePlaneProjectAndLabels(
  config: PlaneBootstrapConfig,
): Promise<PlaneBootstrapResult> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const base = `${config.baseUrl.replace(/\/$/, '')}/api/v1/workspaces/${config.workspaceSlug}`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = typeof res.text === 'function' ? await res.text() : '';
      throw new Error(`Plane bootstrap failed: ${res.status} ${body}`.trimEnd());
    }
    return (await res.json()) as T;
  };

  const listAll = async <T>(path: string): Promise<T[]> => {
    const items: T[] = [];
    let cursor: string | null | undefined;

    do {
      const searchParams = new URLSearchParams({ per_page: '100' });
      if (cursor) {
        searchParams.set('cursor', cursor);
      }
      const page = await request<PlanePage<T>>(`${path}?${searchParams.toString()}`);
      items.push(...(page.results ?? []));
      cursor = page.next_cursor ?? null;
    } while (cursor);

    return items;
  };

  const projects = await listAll<PlaneProject>('/projects/');
  let project = projects.find((candidate) => candidate.identifier === 'AGP');

  if (!project) {
    project = await request<PlaneProject>('/projects/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Agent Platform',
        identifier: 'AGP',
        description:
          'Automation cards for /root/agent-platform. Plane is the primary provider; Linear remains optional for legacy cards.',
        emoji: 'gear',
        module_view: true,
        cycle_view: true,
        issue_views_view: true,
        page_view: true,
        intake_view: true,
      }),
    });
  }

  const labels = await listAll<PlaneLabel>(`/projects/${project.id}/labels/`);
  const byName = new Map(labels.map((label) => [label.name, label.id]));
  const labelIds: Record<string, string> = {};

  for (const name of REQUIRED_PLANE_LABELS) {
    let id = byName.get(name);
    if (!id) {
      const created = await request<{ id: string }>(`/projects/${project.id}/labels/`, {
        method: 'POST',
        body: JSON.stringify({ name, color: '#64748b' }),
      });
      id = created.id;
    }
    labelIds[name] = id;
  }

  return {
    projectId: project.id,
    labelIds,
  };
}
