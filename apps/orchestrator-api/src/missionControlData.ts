import type { CardProvider } from '@agent-platform/cards';
import { listArtifacts } from './artifacts.js';
import type { E2eMissionScenario } from './missionScenarios.js';
import { type MissionTimelineStageStatus, buildMissionTimeline } from './missionTimeline.js';
import { getRun, listApprovals, listRuns, listRunsForCard } from './runs.js';

export interface MissionControlSummary {
  id: string;
  scenarioId: string;
  title: string;
  card: {
    provider: string;
    id: string | null;
    identifier: string | null;
  };
  state: string;
  activeStageId?: string;
  stageStatuses: Record<string, MissionTimelineStageStatus>;
  artifactKinds: string[];
  approvalStatus: string | null;
  updatedAt: string;
  branch: string | null;
  prUrl: string | null;
  testsPassed: boolean | null;
}

export type MissionControlRun = NonNullable<Awaited<ReturnType<typeof getRun>>>;
export type MissionControlArtifact = Awaited<ReturnType<typeof listArtifacts>>[number];
export type MissionControlApproval = Awaited<ReturnType<typeof listApprovals>>[number];

export interface MissionControlDetailData {
  scenario: E2eMissionScenario;
  run: MissionControlRun;
  missionRuns: MissionControlRun[];
  artifacts: Array<MissionControlArtifact & { runId: string }>;
  approvals: MissionControlApproval[];
}

export function normalizeMissionLimit(
  value: string | number | null | undefined,
  fallback = 20,
  max = 100,
): number {
  const limit = Number(value ?? fallback);
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), max) : fallback;
}

export async function buildRecentMissionSummaries(
  limit: number,
  scenarios: E2eMissionScenario[],
): Promise<MissionControlSummary[]> {
  const scenarioByWorkflow = new Map(scenarios.map((scenario) => [scenario.workflow, scenario]));
  const runs = (await listRuns(limit, 0)).filter((run) =>
    scenarioByWorkflow.has(run.workflow ?? ''),
  );

  const missions: Array<MissionControlSummary | undefined> = await Promise.all(
    runs.map(async (run) => {
      const scenario = scenarioByWorkflow.get(run.workflow ?? '');
      if (!scenario) return undefined;

      const missionRuns = await listMissionRunsForSource(run);
      const [artifacts, approvals] = await Promise.all([
        listMissionArtifacts(missionRuns),
        listMissionApprovals(missionRuns),
      ]);
      const timeline = buildMissionTimeline({
        scenarioId: scenario.id,
        runs: missionRuns,
        artifacts,
        approvals,
      });

      return {
        id: run.id,
        scenarioId: scenario.id,
        title: run.title,
        card: {
          provider: run.cardProvider,
          id: run.cardId,
          identifier: run.cardIdentifier,
        },
        state: timeline.state,
        activeStageId: timeline.activeStageId,
        stageStatuses: Object.fromEntries(
          timeline.stages.map((stage) => [stage.id, stage.status] as const),
        ),
        artifactKinds: artifacts.map((artifact) => artifact.kind),
        approvalStatus: timeline.approval?.status ?? null,
        updatedAt: run.updatedAt.toISOString(),
        branch: timeline.metadata.branch ?? null,
        prUrl: timeline.metadata.prUrl ?? null,
        testsPassed: timeline.metadata.testsPassed ?? null,
      };
    }),
  );

  return missions.filter((mission): mission is MissionControlSummary => mission !== undefined);
}

export async function buildMissionDetailData(
  runId: string,
  scenarios: E2eMissionScenario[],
): Promise<MissionControlDetailData | null> {
  const run = await getRun(runId);
  if (!run) return null;

  const scenario = scenarios.find((item) => item.workflow === run.workflow);
  if (!scenario) return null;

  const missionRuns = await listMissionRunsForSource(run);
  const [artifacts, approvals] = await Promise.all([
    listMissionArtifacts(missionRuns),
    listMissionApprovals(missionRuns),
  ]);

  return { scenario, run, missionRuns, artifacts, approvals };
}

export async function listMissionRunsForSource(
  sourceRun: MissionControlRun,
): Promise<MissionControlRun[]> {
  if (!sourceRun.cardId) return [sourceRun];

  const relatedRuns = await listRunsForCard(
    sourceRun.cardProvider as CardProvider,
    sourceRun.cardId,
    20,
  );
  const sourceCreatedAt = new Date(sourceRun.createdAt).getTime();
  const nextSourceCreatedAt = relatedRuns
    .filter((run) => run.id !== sourceRun.id && run.workflow === sourceRun.workflow)
    .map((run) => new Date(run.createdAt).getTime())
    .filter((createdAt) => createdAt > sourceCreatedAt)
    .sort((a, b) => a - b)[0];

  const missionRuns = relatedRuns.filter((run) => {
    const createdAt = new Date(run.createdAt).getTime();
    return (
      createdAt >= sourceCreatedAt &&
      (nextSourceCreatedAt === undefined || createdAt < nextSourceCreatedAt)
    );
  });

  if (!missionRuns.some((run) => run.id === sourceRun.id)) {
    missionRuns.push(sourceRun);
  }

  return missionRuns;
}

export async function listMissionArtifacts(
  runs: MissionControlRun[],
): Promise<Array<MissionControlArtifact & { runId: string }>> {
  const artifactsByRun = await Promise.all(
    runs.map(async (run) => {
      const artifacts = await listArtifacts(run.id);
      return artifacts.map((artifact) => ({ ...artifact, runId: run.id }));
    }),
  );
  return artifactsByRun.flat();
}

export async function listMissionApprovals(
  runs: MissionControlRun[],
): Promise<MissionControlApproval[]> {
  const approvalsByRun = await Promise.all(runs.map((run) => listApprovals(run.id)));
  return approvalsByRun.flat();
}
