import type { PlaneGateway } from '@agent-platform/plane';

export interface LinearCardSnapshot {
  id: string;
  title: string;
  description: string;
  labels: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  url: string;
}

export interface PlaneMigrationInput {
  plane: Pick<PlaneGateway, 'listCardsByExternal' | 'createCard' | 'comment'>;
  linearCards: LinearCardSnapshot[];
  labelIds: Record<string, string>;
}

export interface PlaneMigrationResult {
  created: number;
  skipped: number;
  failed: Array<{ id: string; error: string }>;
}

export async function migrateLinearCardsToPlane(
  input: PlaneMigrationInput,
): Promise<PlaneMigrationResult> {
  let created = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const card of input.linearCards) {
    try {
      const existing = await input.plane.listCardsByExternal({
        externalSource: 'linear',
        externalId: card.id,
      });
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const createdCard = await input.plane.createCard({
        title: card.title,
        description: card.description,
        priority: card.priority,
        labelIds: card.labels
          .map((label) => input.labelIds[label])
          .filter((labelId): labelId is string => Boolean(labelId)),
        externalSource: 'linear',
        externalId: card.id,
      });

      await input.plane.comment(createdCard.id, `Migrated from Linear: [${card.id}](${card.url}).`);
      created++;
    } catch (err) {
      failed.push({
        id: card.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { created, skipped, failed };
}
