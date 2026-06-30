import { type Context, Hono, type Next } from 'hono';
import { getAgent } from '../agent.js';
import { listArtifacts } from '../artifacts.js';
import { env } from '../env.js';
import { isPaused, setPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import {
  ACTIVE_STATUSES,
  countRunsByStatus,
  listApprovals,
  listRuns,
  listRunsForCard,
} from '../runs.js';
import { listE2eMissionScenarios, type E2eMissionScenario } from '../missionScenarios.js';
import { buildMissionTimeline, type MissionTimelineStageStatus } from '../missionTimeline.js';

export const adminRoute = new Hono();

interface MissionControlSummary {
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

/** Protege os controles operacionais com o token interno compartilhado. */
async function requireAdmin(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

adminRoute.use('/admin/*', requireAdmin);

/** Liga o kill switch: para de aceitar e adia os runs (MAC-32). */
adminRoute.post('/admin/pause', async (c) => {
  await setPaused(true);
  logger.warn('KILL SWITCH ligado — agentes pausados');
  return c.json({ paused: true });
});

/** Desliga o kill switch: volta a processar. */
adminRoute.post('/admin/resume', async (c) => {
  await setPaused(false);
  logger.warn('kill switch desligado — agentes retomados');
  return c.json({ paused: false });
});

adminRoute.get('/admin/status', async (c) => {
  return c.json({ paused: await isPaused() });
});

/** Snapshot de saúde dos runners conhecidos (MAC-39). */
adminRoute.get('/admin/runners', async (c) => {
  const { workerManager } = await getAgent();
  return c.json({ runners: await workerManager.probeAll() });
});

/** Observabilidade de concorrência (MAC-47): limite + runs ativos por status. */
adminRoute.get('/admin/concurrency', async (c) => {
  const byStatus = await countRunsByStatus();
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  return c.json({ limit: env.AGENT_MAX_CONCURRENCY, active, byStatus });
});

adminRoute.get('/admin/mission-control', async (c) => {
  const scenarios = listE2eMissionScenarios();
  const missions = await buildRecentMissionSummaries(20, scenarios);
  return c.html(renderMissionControlPage({ scenarios, missions }));
});

adminRoute.get('/admin/mission-control/scenarios', async (c) => {
  return c.json({ scenarios: listE2eMissionScenarios() });
});

adminRoute.get('/admin/mission-control/missions', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
  const missions = await buildRecentMissionSummaries(safeLimit, listE2eMissionScenarios());

  return c.json({ missions });
});

async function buildRecentMissionSummaries(
  limit: number,
  scenarios: E2eMissionScenario[],
): Promise<MissionControlSummary[]> {
  const scenarioByWorkflow = new Map(scenarios.map((scenario) => [scenario.workflow, scenario]));
  const runs = (await listRuns(limit, 0)).filter((run) =>
    scenarioByWorkflow.has(run.workflow ?? ''),
  );

  const missions = await Promise.all(
    runs.map(async (run) => {
      const scenario = scenarioByWorkflow.get(run.workflow ?? '');
      if (!scenario) return undefined;

      const [artifacts, approvals] = await Promise.all([
        listArtifacts(run.id),
        listApprovals(run.id),
      ]);
      const timeline = buildMissionTimeline({
        scenarioId: scenario.id,
        runs: [run],
        artifacts: artifacts.map((artifact) => ({ ...artifact, runId: run.id })),
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
        branch: run.branch,
        prUrl: run.prUrl,
        testsPassed: run.testsPassed,
      };
    }),
  );

  return missions.filter((mission) => mission !== undefined);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}

function humanizeStatus(value: string | undefined): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function stageStatusClass(status: MissionTimelineStageStatus | undefined): string {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'active':
      return 'active';
    case 'failed':
      return 'failed';
    case 'locked':
      return 'locked';
    case 'skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function renderScenarioCard(scenario: E2eMissionScenario): string {
  const labels = scenario.requiredLabels.map((label) => label.name).join(', ');
  const checklist = scenario.verificationChecklist
    .map((item) => `<li>${escapeHtml(item.label)}</li>`)
    .join('');
  return `<article class="scenario">
    <div class="scenario-head">
      <div>
        <h3>${escapeHtml(scenario.name)}</h3>
        <p>${escapeHtml(scenario.summary)}</p>
      </div>
      <span class="badge risk-${escapeHtml(scenario.riskLevel)}">${escapeHtml(scenario.riskLevel)}</span>
    </div>
    <p class="labels">required labels: ${escapeHtml(labels)}</p>
    <ol>${checklist}</ol>
  </article>`;
}

function renderStageTrack(
  scenario: E2eMissionScenario,
  mission?: MissionControlSummary,
): string {
  return scenario.expectedStages
    .map((stage) => {
      const status = mission?.stageStatuses[stage.id] ?? 'pending';
      return `<li class="stage ${stageStatusClass(status)}">
        <strong>${escapeHtml(stage.label)}</strong>
        <span>${escapeHtml(status)}</span>
      </li>`;
    })
    .join('');
}

function renderMissionRow(
  mission: MissionControlSummary,
  scenario: E2eMissionScenario | undefined,
): string {
  const artifacts = mission.artifactKinds.length > 0 ? mission.artifactKinds.join(', ') : 'none';
  const card = mission.card.identifier ?? mission.card.id;
  return `<article class="mission">
    <div class="mission-meta">
      <div>
        <h3>${escapeHtml(mission.title)}</h3>
        <p>${escapeHtml(card)} · ${escapeHtml(scenario?.name ?? mission.scenarioId)}</p>
      </div>
      <span class="badge state-${escapeHtml(mission.state)}">${escapeHtml(humanizeStatus(mission.state))}</span>
    </div>
    <ul class="track">${scenario ? renderStageTrack(scenario, mission) : ''}</ul>
    <dl>
      <div><dt>Updated</dt><dd>${escapeHtml(formatDate(mission.updatedAt))}</dd></div>
      <div><dt>Approval</dt><dd>${escapeHtml(mission.approvalStatus ?? 'none')}</dd></div>
      <div><dt>Artifacts</dt><dd>${escapeHtml(artifacts)}</dd></div>
      <div><dt>PR</dt><dd>${mission.prUrl ? `<a href="${escapeHtml(mission.prUrl)}">${escapeHtml(mission.prUrl)}</a>` : '-'}</dd></div>
    </dl>
  </article>`;
}

export function renderMissionControlPage(input: {
  scenarios: E2eMissionScenario[];
  missions: MissionControlSummary[];
}): string {
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const activeMissions = input.missions.filter(
    (mission) => !['completed', 'failed', 'cancelled'].includes(mission.state),
  ).length;
  const scenarioCards = input.scenarios.map(renderScenarioCard).join('');
  const missionCards = input.missions
    .map((mission) => renderMissionRow(mission, scenarioById.get(mission.scenarioId)))
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mission Control</title>
  <style>
    :root { color-scheme: light; --bg:#f5f7fb; --panel:#ffffff; --ink:#1f2937; --muted:#667085; --line:#d9dee7; --green:#0f766e; --amber:#b45309; --red:#b91c1c; --blue:#2563eb; --violet:#7c3aed; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding: 26px 28px 18px; background: var(--panel); border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; letter-spacing: 0; }
    h3 { margin: 0; font-size: 15px; letter-spacing: 0; }
    p { margin: 4px 0 0; color: var(--muted); }
    main { padding: 20px 28px 34px; display: grid; gap: 18px; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric, section, .scenario, .mission { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric { padding: 14px 16px; }
    .metric strong { display: block; font-size: 25px; line-height: 1.1; }
    .metric span { display: block; color: var(--muted); margin-top: 2px; }
    section { padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .scenario, .mission { padding: 14px; }
    .scenario-head, .mission-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .labels { margin-top: 12px; font-weight: 650; color: var(--ink); }
    ol { margin: 10px 0 0; padding-left: 20px; color: var(--muted); }
    .badge { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #eef2f6; color: #344054; white-space: nowrap; }
    .risk-caution, .state-awaiting_approval { background: #fff4df; color: var(--amber); }
    .risk-safe, .state-completed { background: #e6f6f3; color: var(--green); }
    .risk-dangerous, .state-failed { background: #fee4e2; color: var(--red); }
    .state-collecting_research, .state-landing_generation, .state-pull_request, .state-planning { background: #e8efff; color: var(--blue); }
    .track { list-style: none; margin: 14px 0; padding: 0; display: grid; grid-template-columns: repeat(7, minmax(84px, 1fr)); gap: 8px; overflow-x: auto; }
    .stage { min-height: 58px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: #f8fafc; }
    .stage strong, .stage span { display: block; }
    .stage strong { font-size: 12px; }
    .stage span { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .stage.passed { border-color: #99d6cd; background: #effaf8; }
    .stage.active { border-color: #f4c76b; background: #fff8eb; }
    .stage.failed { border-color: #f6a19b; background: #fff1f0; }
    .stage.locked, .stage.skipped { opacity: 0.72; }
    dl { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    dt { color: var(--muted); font-size: 12px; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    a { color: var(--blue); }
    @media (max-width: 900px) { header, main { padding-left: 14px; padding-right: 14px; } .summary, .grid, dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Mission Control</h1>
    <p>Read-only rehearsal mode for E2E Studio workflows. This page inspects scenarios and recent state only; it does not launch runs or call external providers.</p>
  </header>
  <main>
    <div class="summary">
      <div class="metric"><strong>${input.scenarios.length}</strong><span>available missions</span></div>
      <div class="metric"><strong>${input.missions.length}</strong><span>recent mission summaries</span></div>
      <div class="metric"><strong>${activeMissions}</strong><span>active or waiting missions</span></div>
    </div>
    <section>
      <h2>Mission Readiness</h2>
      <div class="grid">${scenarioCards || '<p>No E2E scenarios registered.</p>'}</div>
    </section>
    <section>
      <h2>Recent Missions</h2>
      <div class="grid">${missionCards || '<p>No recent Mission Control runs found.</p>'}</div>
    </section>
  </main>
</body>
</html>`;
}

adminRoute.get('/admin/card-runs', async (c) => {
  const provider = c.req.query('provider');
  const cardId = c.req.query('cardId');
  const limit = Number(c.req.query('limit') ?? 20);

  if (!provider || !cardId) {
    return c.json({ error: 'provider and cardId are required' }, 400);
  }
  if (provider !== 'plane' && provider !== 'linear') {
    return c.json({ error: 'provider must be plane or linear' }, 400);
  }

  const runs = await listRunsForCard(
    provider,
    cardId,
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20,
  );
  return c.json({ runs });
});
