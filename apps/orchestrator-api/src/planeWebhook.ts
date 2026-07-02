const PLANE_REMOVAL_ACTIONS = new Set([
  'delete',
  'deleted',
  'remove',
  'removed',
  'archive',
  'archived',
]);

export interface PlaneLabel {
  id?: string;
  name?: string;
}

export interface PlaneWorkItemData {
  id?: string;
  sequence_id?: number;
  sequenceId?: number;
  name?: string;
  labels?: PlaneLabel[];
  project_id?: string;
  project_detail?: { identifier?: string };
  project_identifier?: string;
}

export interface PlanePayload {
  action: string;
  type?: string;
  event?: string;
  data?: PlaneWorkItemData;
  updated_from?: { labels?: PlaneLabel[] };
  updatedFrom?: { labels?: PlaneLabel[] };
}

export type NormalizedPlaneWebhook =
  | {
      supported: false;
      action: string;
      event: string | undefined;
      reason: 'unsupported event type';
    }
  | {
      supported: true;
      action: string;
      event: string | undefined;
      cardId: string | undefined;
      cardIdentifier: string | undefined;
      cardProjectId: string | undefined;
      title: string;
      currentNames: string[];
      currentIds: string[];
      previousNames: string[] | undefined;
      previousIds: string[] | undefined;
      previousLabelsPresent: boolean;
      removal: boolean;
    };

export function isPlaneRemovalAction(action: string | undefined): boolean {
  return action ? PLANE_REMOVAL_ACTIONS.has(action.toLowerCase()) : false;
}

export function normalizePlaneWebhook(
  payload: PlanePayload,
  eventHeader: string | undefined,
): NormalizedPlaneWebhook {
  const event = eventHeader ?? payload.event ?? payload.type;
  if (event !== 'work_item' && event !== 'issue') {
    return {
      supported: false,
      action: payload.action,
      event,
      reason: 'unsupported event type',
    };
  }

  const item = payload.data;
  const previousLabels = payload.updated_from?.labels ?? payload.updatedFrom?.labels;

  return {
    supported: true,
    action: payload.action,
    event,
    cardId: item?.id,
    cardIdentifier: item ? planeCardIdentifier(item) : undefined,
    cardProjectId: item?.project_id,
    title: item?.name ?? '(sem título)',
    currentNames: planeLabelNames(item?.labels) ?? [],
    currentIds: planeLabelIds(item?.labels) ?? [],
    previousNames: planeLabelNames(previousLabels),
    previousIds: planeLabelIds(previousLabels),
    previousLabelsPresent: previousLabels !== undefined,
    removal: isPlaneRemovalAction(payload.action),
  };
}

function planeLabelNames(labels: PlaneLabel[] | undefined): string[] | undefined {
  return labels?.map((label) => label.name ?? '').filter(Boolean);
}

function planeLabelIds(labels: PlaneLabel[] | undefined): string[] | undefined {
  return labels?.map((label) => label.id ?? '').filter(Boolean);
}

function planeCardIdentifier(data: PlaneWorkItemData): string {
  const projectIdentifier = data.project_detail?.identifier ?? data.project_identifier ?? 'AGP';
  const sequence = data.sequence_id ?? data.sequenceId;
  return sequence ? `${projectIdentifier}-${sequence}` : (data.id ?? projectIdentifier);
}
