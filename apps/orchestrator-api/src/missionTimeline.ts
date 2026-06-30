import { type E2eMissionStageId, getE2eMissionScenario } from './missionScenarios.js';

export type MissionTimelineState =
  | 'queued'
  | 'planning'
  | 'awaiting_approval'
  | 'collecting_research'
  | 'landing_generation'
  | 'pull_request'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MissionTimelineStageStatus =
  | 'locked'
  | 'active'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'pending';

export interface MissionTimelineRun {
  id: string;
  title: string;
  status: string;
  workflow?: string | null;
  branch?: string | null;
  prUrl?: string | null;
  error?: string | null;
  testsPassed?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface MissionTimelineArtifact {
  id: string;
  runId: string;
  kind: string;
  createdAt?: Date | string | null;
}

export interface MissionTimelineApproval {
  id: string;
  runId: string;
  reason: string;
  status: string;
  summary: string;
  requestedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  resolvedBy?: string | null;
}

export interface MissionTimelineStage {
  id: E2eMissionStageId;
  label: string;
  description: string;
  status: MissionTimelineStageStatus;
  runId?: string;
  artifactKinds: string[];
}

export interface MissionTimeline {
  scenarioId: string;
  missionId?: string;
  title?: string;
  state: MissionTimelineState;
  activeStageId?: E2eMissionStageId;
  stages: MissionTimelineStage[];
  approval?: MissionTimelineApproval;
  metadata: {
    workflow?: string;
    branch?: string;
    prUrl?: string;
    error?: string;
    testsPassed?: boolean;
    updatedAt?: string;
  };
}

export interface BuildMissionTimelineInput {
  scenarioId: string;
  runs: MissionTimelineRun[];
  artifacts?: MissionTimelineArtifact[];
  approvals?: MissionTimelineApproval[];
}

const STAGE_ORDER: E2eMissionStageId[] = [
  'queued',
  'planning',
  'awaiting_approval',
  'collecting_research',
  'landing_generation',
  'pull_request',
  'completed',
];

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);

export function buildMissionTimeline(input: BuildMissionTimelineInput): MissionTimeline {
  const scenario = getE2eMissionScenario(input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown mission scenario: ${input.scenarioId}`);
  }

  const runs = [...input.runs].sort(compareRuns);
  const sourceRun = runs.find((run) => run.workflow === scenario.workflow) ?? runs[0];
  const continuationRun = sourceRun
    ? runs.find((run) => run.id !== sourceRun.id && compareRuns(run, sourceRun) >= 0)
    : undefined;
  const displayRun = continuationRun ?? sourceRun;
  const state = resolveTimelineState(sourceRun, continuationRun);
  const activeStageId = resolveActiveStageId(state, sourceRun, continuationRun);
  const terminalFailure = state === 'failed' || state === 'cancelled';
  const artifactsByStage = mapArtifactsToStages(input.artifacts ?? []);
  const approval = findRelevantApproval(input.approvals ?? [], sourceRun?.id);

  const stages = scenario.expectedStages.map<MissionTimelineStage>((stage) => {
    const status = resolveStageStatus({
      stageId: stage.id,
      activeStageId,
      state,
      terminalFailure,
    });

    return {
      ...stage,
      status,
      runId: runIdForStage(stage.id, sourceRun, continuationRun),
      artifactKinds: artifactsByStage.get(stage.id) ?? [],
    };
  });

  return {
    scenarioId: scenario.id,
    missionId: sourceRun?.id,
    title: sourceRun?.title,
    state,
    activeStageId,
    stages,
    approval,
    metadata: {
      workflow: sourceRun?.workflow ?? scenario.workflow,
      branch: displayRun?.branch ?? undefined,
      prUrl: displayRun?.prUrl ?? undefined,
      error: displayRun?.error ?? sourceRun?.error ?? undefined,
      testsPassed: displayRun?.testsPassed ?? undefined,
      updatedAt: toIsoString(displayRun?.updatedAt ?? sourceRun?.updatedAt),
    },
  };
}

function compareRuns(a: MissionTimelineRun, b: MissionTimelineRun): number {
  return timestamp(a.createdAt) - timestamp(b.createdAt);
}

function timestamp(value: MissionTimelineRun['createdAt']): number {
  return timestampValue(value);
}

function timestampValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  return new Date(value).getTime();
}

function resolveTimelineState(
  sourceRun: MissionTimelineRun | undefined,
  continuationRun: MissionTimelineRun | undefined,
): MissionTimelineState {
  if (!sourceRun) return 'queued';
  if (sourceRun.status === 'failed' || continuationRun?.status === 'failed') return 'failed';
  if (sourceRun.status === 'cancelled' || continuationRun?.status === 'cancelled')
    return 'cancelled';
  if (continuationRun) return stateForContinuationRun(continuationRun);
  return stateForSourceRun(sourceRun);
}

function stateForSourceRun(run: MissionTimelineRun): MissionTimelineState {
  switch (run.status) {
    case 'pending':
      return 'queued';
    case 'planning':
      return 'planning';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'executing':
      return 'collecting_research';
    case 'reviewing':
      return 'pull_request';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function stateForContinuationRun(run: MissionTimelineRun): MissionTimelineState {
  switch (run.status) {
    case 'pending':
    case 'planning':
    case 'awaiting_approval':
    case 'executing':
      return 'landing_generation';
    case 'reviewing':
      return 'pull_request';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'landing_generation';
  }
}

function resolveActiveStageId(
  state: MissionTimelineState,
  sourceRun: MissionTimelineRun | undefined,
  continuationRun: MissionTimelineRun | undefined,
): E2eMissionStageId | undefined {
  if (!sourceRun) return 'queued';
  if (state === 'failed' || state === 'cancelled') {
    return continuationRun
      ? stageForRunStatus(continuationRun.status, true)
      : stageForRunStatus(sourceRun.status);
  }
  return state === 'completed' ? 'completed' : state;
}

function stageForRunStatus(status: string, continuation = false): E2eMissionStageId {
  if (continuation) {
    if (status === 'reviewing') return 'pull_request';
    if (TERMINAL_STATES.has(status)) return 'landing_generation';
    return 'landing_generation';
  }

  switch (status) {
    case 'pending':
      return 'queued';
    case 'planning':
      return 'planning';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'reviewing':
      return 'pull_request';
    case 'completed':
      return 'completed';
    default:
      return 'collecting_research';
  }
}

function resolveStageStatus(args: {
  stageId: E2eMissionStageId;
  activeStageId?: E2eMissionStageId;
  state: MissionTimelineState;
  terminalFailure: boolean;
}): MissionTimelineStageStatus {
  const stageIndex = STAGE_ORDER.indexOf(args.stageId);
  const activeIndex = args.activeStageId ? STAGE_ORDER.indexOf(args.activeStageId) : -1;

  if (args.terminalFailure) {
    if (stageIndex < activeIndex) return 'passed';
    if (stageIndex === activeIndex) return args.state === 'failed' ? 'failed' : 'skipped';
    return 'skipped';
  }

  if (args.state === 'awaiting_approval' && stageIndex > activeIndex) return 'locked';
  if (args.state === 'completed') return 'passed';
  if (stageIndex < activeIndex) return 'passed';
  if (stageIndex === activeIndex) return 'active';
  return 'pending';
}

function runIdForStage(
  stageId: E2eMissionStageId,
  sourceRun: MissionTimelineRun | undefined,
  continuationRun: MissionTimelineRun | undefined,
): string | undefined {
  if (stageId === 'landing_generation' || stageId === 'pull_request' || stageId === 'completed') {
    return continuationRun?.id ?? sourceRun?.id;
  }
  return sourceRun?.id;
}

function mapArtifactsToStages(
  artifacts: MissionTimelineArtifact[],
): Map<E2eMissionStageId, string[]> {
  const byStage = new Map<E2eMissionStageId, string[]>();
  for (const artifact of artifacts) {
    const stageId = stageForArtifactKind(artifact.kind);
    const kinds = byStage.get(stageId) ?? [];
    byStage.set(stageId, [...kinds, artifact.kind]);
  }
  return byStage;
}

function stageForArtifactKind(kind: string): E2eMissionStageId {
  switch (kind) {
    case 'plan':
      return 'planning';
    case 'research':
      return 'collecting_research';
    case 'review':
      return 'pull_request';
    case 'patch':
    case 'validation':
    case 'summary':
      return 'landing_generation';
    default:
      return 'planning';
  }
}

function findRelevantApproval(
  approvals: MissionTimelineApproval[],
  runId: string | undefined,
): MissionTimelineApproval | undefined {
  const matching = runId ? approvals.filter((approval) => approval.runId === runId) : approvals;
  return (
    matching.find((approval) => approval.status === 'pending') ??
    matching.sort((a, b) => timestampValue(b.requestedAt) - timestampValue(a.requestedAt))[0]
  );
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}
