import { createPlaneGateway } from '@agent-platform/plane';
import { pathToFileURL } from 'node:url';
import { env } from './env.js';
import { ensurePlaneProjectAndLabels } from './planeBootstrap.js';
import { migrateLinearCardsToPlane, type LinearCardSnapshot } from './planeMigration.js';

const ACTIVE_LINEAR_STATES = ['Todo', 'Backlog', 'In Progress'] as const;
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

const LIST_LINEAR_ISSUES_QUERY = `
  query ListActiveLinearIssues($after: String, $first: Int!, $filter: IssueFilter) {
    issues(after: $after, first: $first, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        identifier
        title
        description
        priority
        url
        labels(first: 100) {
          nodes {
            name
          }
        }
      }
    }
  }
`;

interface LinearIssueNode {
  identifier: string;
  title: string;
  description?: string | null;
  priority: number;
  url: string;
  labels?: {
    nodes: Array<{ name: string }>;
  };
}

interface LinearIssuesResponse {
  issues: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes: LinearIssueNode[];
  };
}

interface LinearGraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

function getRequiredPlaneConfig() {
  if (!env.PLANE_API_KEY) {
    throw new Error('PLANE_API_KEY is required for plane:migrate-linear');
  }
  if (!env.LINEAR_API_KEY || !env.LINEAR_TEAM_ID) {
    throw new Error('LINEAR_API_KEY and LINEAR_TEAM_ID are required for plane:migrate-linear');
  }

  return {
    planeApiKey: env.PLANE_API_KEY,
    linearApiKey: env.LINEAR_API_KEY,
    linearTeamId: env.LINEAR_TEAM_ID,
  };
}

function toPlanePriority(priority: number): LinearCardSnapshot['priority'] {
  switch (priority) {
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'none';
  }
}

async function listActiveLinearCards(
  apiKey: string,
  teamId: string,
): Promise<LinearCardSnapshot[]> {
  const issues: LinearIssueNode[] = [];
  let after: string | null | undefined;

  do {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: LIST_LINEAR_ISSUES_QUERY,
        variables: {
          after,
          first: 100,
          filter: {
            team: { id: { eq: teamId } },
            state: { name: { in: [...ACTIVE_LINEAR_STATES] } },
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Linear migration fetch failed: ${response.status} ${body}`.trimEnd());
    }

    const payload = (await response.json()) as LinearGraphQlResponse<LinearIssuesResponse>;
    if (payload.errors?.length) {
      const message = payload.errors.map((error) => error.message ?? 'Unknown Linear error').join('; ');
      throw new Error(`Linear migration query failed: ${message}`);
    }
    if (!payload.data) {
      throw new Error('Linear migration query returned no data');
    }

    issues.push(...payload.data.issues.nodes);
    after = payload.data.issues.pageInfo.hasNextPage
      ? payload.data.issues.pageInfo.endCursor ?? null
      : null;
  } while (after);

  return issues.map((issue) => ({
    id: issue.identifier,
    title: issue.title,
    description: issue.description ?? '',
    labels: issue.labels?.nodes.map((label) => label.name) ?? [],
    priority: toPlanePriority(issue.priority),
    url: issue.url,
  }));
}

export async function main() {
  const config = getRequiredPlaneConfig();
  const bootstrap = await ensurePlaneProjectAndLabels({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: config.planeApiKey,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
  });
  const plane = createPlaneGateway({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: config.planeApiKey,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
    projectId: bootstrap.projectId,
  });
  const linearCards = await listActiveLinearCards(config.linearApiKey, config.linearTeamId);

  return migrateLinearCardsToPlane({
    plane,
    linearCards,
    labelIds: bootstrap.labelIds,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          { error: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
