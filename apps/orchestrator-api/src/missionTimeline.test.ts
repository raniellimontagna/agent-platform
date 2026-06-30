import { describe, expect, it } from 'vitest';
import { RESEARCH_TO_LANDING_SCENARIO_ID } from './missionScenarios.js';
import { buildMissionTimeline } from './missionTimeline.js';
import { RESEARCH_TO_LANDING_WORKFLOW } from './workflows.js';

const baseRun = {
  id: 'run-1',
  title: 'Launch research mission',
  workflow: RESEARCH_TO_LANDING_WORKFLOW,
  status: 'pending',
  createdAt: new Date('2026-06-30T10:00:00Z'),
  updatedAt: new Date('2026-06-30T10:01:00Z'),
};

describe('mission timeline view model', () => {
  it('marks a completed mission through PR and completed stages', () => {
    const timeline = buildMissionTimeline({
      scenarioId: RESEARCH_TO_LANDING_SCENARIO_ID,
      runs: [
        {
          ...baseRun,
          status: 'completed',
          branch: 'feat/landing-page',
          prUrl: 'https://github.com/acme/site/pull/12',
          testsPassed: true,
        },
      ],
      artifacts: [
        { id: 'artifact-research', runId: 'run-1', kind: 'research' },
        { id: 'artifact-summary', runId: 'run-1', kind: 'summary' },
      ],
    });

    expect(timeline.state).toBe('completed');
    expect(timeline.activeStageId).toBe('completed');
    expect(stageStatuses(timeline)).toMatchObject({
      queued: 'passed',
      planning: 'passed',
      awaiting_approval: 'passed',
      collecting_research: 'passed',
      landing_generation: 'passed',
      pull_request: 'passed',
      completed: 'passed',
    });
    expect(timeline.metadata).toMatchObject({
      branch: 'feat/landing-page',
      prUrl: 'https://github.com/acme/site/pull/12',
      testsPassed: true,
    });
  });

  it('shows awaiting approval as the active stage and locks downstream work', () => {
    const timeline = buildMissionTimeline({
      scenarioId: RESEARCH_TO_LANDING_SCENARIO_ID,
      runs: [{ ...baseRun, status: 'awaiting_approval' }],
      artifacts: [{ id: 'artifact-plan', runId: 'run-1', kind: 'plan' }],
      approvals: [
        {
          id: 'approval-1',
          runId: 'run-1',
          reason: 'plan',
          status: 'pending',
          summary: 'Operator approval required before code generation.',
        },
      ],
    });

    expect(timeline.state).toBe('awaiting_approval');
    expect(timeline.activeStageId).toBe('awaiting_approval');
    expect(stageStatuses(timeline)).toMatchObject({
      queued: 'passed',
      planning: 'passed',
      awaiting_approval: 'active',
      collecting_research: 'locked',
      landing_generation: 'locked',
      pull_request: 'locked',
      completed: 'locked',
    });
    expect(timeline.approval).toMatchObject({
      id: 'approval-1',
      status: 'pending',
      reason: 'plan',
    });
  });

  it('pins a failed mission to the stage where progress stopped', () => {
    const timeline = buildMissionTimeline({
      scenarioId: RESEARCH_TO_LANDING_SCENARIO_ID,
      runs: [
        {
          ...baseRun,
          status: 'failed',
          error: 'research collector timed out',
        },
      ],
      artifacts: [{ id: 'artifact-plan', runId: 'run-1', kind: 'plan' }],
    });

    expect(timeline.state).toBe('failed');
    expect(timeline.activeStageId).toBe('collecting_research');
    expect(stageStatuses(timeline)).toMatchObject({
      queued: 'passed',
      planning: 'passed',
      awaiting_approval: 'passed',
      collecting_research: 'failed',
      landing_generation: 'skipped',
      pull_request: 'skipped',
      completed: 'skipped',
    });
    expect(timeline.metadata.error).toBe('research collector timed out');
  });

  it('activates landing generation when a completed research run has a continuation run', () => {
    const timeline = buildMissionTimeline({
      scenarioId: RESEARCH_TO_LANDING_SCENARIO_ID,
      runs: [
        { ...baseRun, status: 'completed', updatedAt: new Date('2026-06-30T10:30:00Z') },
        {
          ...baseRun,
          id: 'run-landing',
          title: 'Launch research mission - landing page',
          workflow: undefined,
          status: 'planning',
          createdAt: new Date('2026-06-30T10:31:00Z'),
          updatedAt: new Date('2026-06-30T10:32:00Z'),
        },
      ],
      artifacts: [{ id: 'artifact-research', runId: 'run-1', kind: 'research' }],
    });

    expect(timeline.state).toBe('landing_generation');
    expect(timeline.activeStageId).toBe('landing_generation');
    expect(stageStatuses(timeline)).toMatchObject({
      queued: 'passed',
      planning: 'passed',
      awaiting_approval: 'passed',
      collecting_research: 'passed',
      landing_generation: 'active',
      pull_request: 'pending',
      completed: 'pending',
    });
    expect(timeline.stages.find((stage) => stage.id === 'landing_generation')).toMatchObject({
      runId: 'run-landing',
      artifactKinds: [],
    });
  });
});

function stageStatuses(timeline: ReturnType<typeof buildMissionTimeline>) {
  return Object.fromEntries(timeline.stages.map((stage) => [stage.id, stage.status]));
}
