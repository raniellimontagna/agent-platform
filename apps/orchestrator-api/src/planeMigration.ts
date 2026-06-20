import type { PlaneGateway } from '@agent-platform/plane';

export interface LinearCardSnapshot {
  id: string;
  title: string;
  description: string;
  labels: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  state: string;
  url: string;
}

export interface PlaneMigrationInput {
  plane: Pick<PlaneGateway, 'listCardsByExternal' | 'createCard' | 'comment' | 'listComments'>;
  linearCards: LinearCardSnapshot[];
  labelIds: Record<string, string>;
  stateIdsByName: Record<string, string>;
}

export interface PlaneMigrationResult {
  created: number;
  commented: number;
  skipped: number;
  failed: Array<{ id: string; error: string }>;
}

function buildProvenanceComment(card: LinearCardSnapshot): string {
  return `Migrated from Linear: [${card.id}](${card.url}).`;
}

function extractProvenanceComment(commentHtml: string): { id: string; url: string } | null {
  const prefix = '<p>Migrated from Linear: ';
  const suffix = '.</p>';
  if (!commentHtml.startsWith(prefix) || !commentHtml.endsWith(suffix)) {
    return null;
  }

  const provenanceBody = commentHtml.slice(prefix.length, -suffix.length);
  const anchorMatch = provenanceBody.match(/^<a href="([^"]+)">([^<]+)<\/a>$/);
  if (anchorMatch?.[1] && anchorMatch?.[2]) {
    return { url: anchorMatch[1], id: anchorMatch[2] };
  }

  const markdownMatch = provenanceBody.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownMatch?.[1] && markdownMatch?.[2]) {
    return { id: markdownMatch[1], url: markdownMatch[2] };
  }

  return null;
}

const LINEAR_STATE_NAME_CANDIDATES: Record<string, string[]> = {
  Backlog: ['Backlog'],
  Todo: ['Todo', 'Unstarted'],
  'In Progress': ['In Progress', 'Started'],
};

function resolvePlaneStateId(
  linearStateName: string,
  stateIdsByName: Record<string, string>,
): string | undefined {
  const candidates = LINEAR_STATE_NAME_CANDIDATES[linearStateName] ?? [linearStateName];
  for (const candidate of candidates) {
    const stateId = stateIdsByName[candidate];
    if (stateId) {
      return stateId;
    }
  }
  return undefined;
}

async function ensureProvenanceComment(input: {
  plane: PlaneMigrationInput['plane'];
  cardId: string;
  card: LinearCardSnapshot;
  commentBody: string;
}): Promise<boolean> {
  const existingComments = await input.plane.listComments(input.cardId);
  if (
    existingComments.some((commentHtml) => {
      const provenance = extractProvenanceComment(commentHtml);
      return provenance?.id === input.card.id && provenance?.url === input.card.url;
    })
  ) {
    return false;
  }

  await input.plane.comment(input.cardId, input.commentBody);
  return true;
}

export async function migrateLinearCardsToPlane(
  input: PlaneMigrationInput,
): Promise<PlaneMigrationResult> {
  let created = 0;
  let commented = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const card of input.linearCards) {
    try {
      const provenanceComment = buildProvenanceComment(card);
      const existing = await input.plane.listCardsByExternal({
        externalSource: 'linear',
        externalId: card.id,
      });
      const existingCard = existing[0];
      if (existingCard) {
        skipped++;
        if (
          await ensureProvenanceComment({
            plane: input.plane,
            cardId: existingCard.id,
            card,
            commentBody: provenanceComment,
          })
        ) {
          commented++;
        }
        continue;
      }

      const stateId = resolvePlaneStateId(card.state, input.stateIdsByName);
      const createdCard = await input.plane.createCard({
        title: card.title,
        description: card.description,
        priority: card.priority,
        labelIds: card.labels
          .map((label) => input.labelIds[label])
          .filter((labelId): labelId is string => Boolean(labelId)),
        stateId,
        externalSource: 'linear',
        externalId: card.id,
      });

      await input.plane.comment(createdCard.id, provenanceComment);
      commented++;
      created++;
    } catch (err) {
      failed.push({
        id: card.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { created, commented, skipped, failed };
}
