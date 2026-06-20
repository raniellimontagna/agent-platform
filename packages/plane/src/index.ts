import {
  markdownToPlaneHtml,
  type CardContext,
  type CardGateway,
  type CreateCardInput,
} from '@agent-platform/cards';

export interface PlaneConfig {
  baseUrl: string;
  apiKey: string;
  workspaceSlug: string;
  projectId: string;
}

export type PlaneLabelIds = Record<string, string>;

export interface PlaneGateway extends CardGateway {
  provider: 'plane';
  projectId: string;
  listCardsByExternal(input: { externalSource: string; externalId: string }): Promise<CardContext[]>;
}

interface PlaneWorkItem {
  id: string;
  sequence_id?: number;
  sequenceId?: number;
  name: string;
  description_stripped?: string | null;
  description_html?: string | null;
  labels?: Array<{ name?: string } | string>;
  project_detail?: { identifier?: string };
  project_identifier?: string;
}

export function createPlaneGateway(config: PlaneConfig): PlaneGateway {
  const base = `${config.baseUrl.replace(/\/$/, '')}/api/v1/workspaces/${config.workspaceSlug}`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Plane API ${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  }

  const gateway: PlaneGateway = {
    provider: 'plane',
    projectId: config.projectId,

    async getCard(id) {
      const item = await request<PlaneWorkItem>(`/projects/${config.projectId}/work-items/${id}/`);
      return toCardContext(item, config.projectId);
    },

    async comment(cardId, body) {
      await request(`/projects/${config.projectId}/work-items/${cardId}/comments/`, {
        method: 'POST',
        body: JSON.stringify({
          comment_html: markdownToPlaneHtml(body),
          access: 'EXTERNAL',
        }),
      });
    },

    async setCardState(cardId, stateId) {
      await request(`/projects/${config.projectId}/work-items/${cardId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ state: stateId }),
      });
    },

    async createCard(input: CreateCardInput) {
      const item = await request<PlaneWorkItem>(`/projects/${config.projectId}/work-items/`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.title,
          description_html: markdownToPlaneHtml(input.description),
          description_stripped: input.description,
          labels: input.labelIds,
          priority: input.priority,
          state: input.stateId,
          external_source: input.externalSource,
          external_id: input.externalId,
        }),
      });
      return toCardContext(item, config.projectId);
    },

    async listCardsByExternal(input) {
      const data = await request<{ results?: PlaneWorkItem[] } | PlaneWorkItem[]>(
        `/projects/${config.projectId}/work-items/?external_source=${encodeURIComponent(
          input.externalSource,
        )}&external_id=${encodeURIComponent(input.externalId)}`,
      );
      const rows = Array.isArray(data) ? data : (data.results ?? []);
      return rows.map((item) => toCardContext(item, config.projectId));
    },
  };

  return gateway;
}

function toCardContext(item: PlaneWorkItem, projectId: string): CardContext {
  const projectIdentifier =
    item.project_detail?.identifier ?? item.project_identifier ?? 'AGP';
  const sequence = item.sequence_id ?? item.sequenceId;
  return {
    provider: 'plane',
    id: item.id,
    identifier: sequence ? `${projectIdentifier}-${sequence}` : item.id,
    title: item.name,
    description: item.description_stripped ?? '',
    labels: (item.labels ?? [])
      .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
      .filter(Boolean),
    projectId,
  };
}
