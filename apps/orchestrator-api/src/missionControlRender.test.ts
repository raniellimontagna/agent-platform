import { describe, expect, it } from 'vitest';
import type { MissionControlSummary } from './missionControlData.js';
import { renderMissionControlPage, renderMissionDetailPage } from './missionControlRender.js';
import { listE2eMissionScenarios } from './missionScenarios.js';

const scenario = listE2eMissionScenarios()[0];
if (!scenario) {
  throw new Error('Expected at least one Mission Control scenario');
}

const summary: MissionControlSummary = {
  id: 'run-1',
  scenarioId: 'research-to-landing',
  title: 'Research landing page',
  card: {
    provider: 'plane',
    id: 'card-1',
    identifier: 'AGP-91',
  },
  state: 'awaiting_approval',
  activeStageId: 'awaiting_approval',
  stageStatuses: {
    queued: 'passed',
    planning: 'passed',
    awaiting_approval: 'active',
    collecting_research: 'locked',
    landing_generation: 'locked',
    pull_request: 'locked',
    completed: 'locked',
  },
  artifactKinds: ['research'],
  approvalStatus: 'pending',
  updatedAt: '2026-06-30T12:05:00.000Z',
  branch: null,
  prUrl: 'https://github.com/acme/site/pull/12',
  testsPassed: null,
};

describe('renderMissionControlPage', () => {
  it('renders the read-only dashboard copy, empty states, and no operator controls', () => {
    const html = renderMissionControlPage({
      scenarios: listE2eMissionScenarios(),
      missions: [],
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Mission Control');
    expect(html).toContain('Read-only rehearsal mode');
    expect(html).toContain('Mission Readiness');
    expect(html).toContain('Safe Launch Checklist');
    expect(html).toContain('No recent Mission Control runs found.');
    expect(html).toContain(
      'This checklist does not trigger Plane, webhooks, GitHub, or live runs.',
    );
    expectNoOperatorControls(html);
  });

  it('renders recent mission cards, artifact summaries, and PR URLs', () => {
    const html = renderMissionControlPage({
      scenarios: listE2eMissionScenarios(),
      missions: [summary],
    });

    expect(html).toContain('Research landing page');
    expect(html).toContain('AGP-91');
    expect(html).toContain('Awaiting approval');
    expect(html).toContain('research');
    expect(html).toContain('https://github.com/acme/site/pull/12');
    expect(html).toContain('2026-06-30 12:05:00');
    expectNoOperatorControls(html);
  });

  it('escapes malicious scenario, run, card, artifact, approval, and PR values', () => {
    const maliciousHtml = '<script>alert("x")</script>';
    const html = renderMissionControlPage({
      scenarios: [
        {
          ...scenario,
          name: `Scenario ${maliciousHtml}`,
          summary: `Summary ${maliciousHtml}`,
          requiredLabels: [
            { name: `label-${maliciousHtml}`, description: `Label ${maliciousHtml}` },
          ],
          verificationChecklist: [{ id: 'xss', label: `Checklist ${maliciousHtml}` }],
        },
      ],
      missions: [
        {
          ...summary,
          title: `Run ${maliciousHtml}`,
          card: {
            provider: 'plane',
            id: `card-${maliciousHtml}`,
            identifier: `AGP-${maliciousHtml}`,
          },
          artifactKinds: [`artifact-${maliciousHtml}`],
          approvalStatus: `pending-${maliciousHtml}`,
          prUrl: `https://example.com/pr?q=${maliciousHtml}&name="quoted"`,
        },
      ],
    });

    expect(html).not.toContain(maliciousHtml);
    expect(html).toContain('Scenario &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Run &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('AGP-&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('artifact-&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('pending-&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain(
      'https://example.com/pr?q=&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;name=&quot;quoted&quot;',
    );
  });
});

describe('renderMissionDetailPage', () => {
  it('renders detail copy, artifact links, approval state, and PR continuation metadata', () => {
    const html = renderMissionDetailPage({
      scenario,
      run: {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-91',
        status: 'reviewing',
        title: 'Research landing page',
        branch: 'agent/agp-91-landing',
        prUrl: 'https://github.com/acme/site/pull/12',
        testsPassed: true,
        error: null,
        workflow: 'research_landing_page',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        updatedAt: new Date('2026-06-30T12:10:00.000Z'),
      },
      artifacts: [
        {
          id: 'artifact-research',
          kind: 'research',
          createdAt: new Date('2026-06-30T12:06:00.000Z'),
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          runId: 'run-1',
          reason: 'plan',
          status: 'approved',
          summary: 'Operator approved continuation.',
          requestedAt: new Date('2026-06-30T12:05:00.000Z'),
          resolvedAt: new Date('2026-06-30T12:06:00.000Z'),
          resolvedBy: 'operator',
        },
      ],
    });

    expect(html).toContain('Mission Detail');
    expect(html).toContain('Read-only inspection');
    expect(html).toContain('/artifacts/artifact-research');
    expect(html).toContain('Operator approved continuation.');
    expect(html).toContain('agent/agp-91-landing');
    expect(html).toContain('https://github.com/acme/site/pull/12');
    expect(html).toContain('Tests passed');
    expectNoOperatorControls(html);
  });

  it('renders explicit empty detail states without controls', () => {
    const html = renderMissionDetailPage({
      scenario,
      run: {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-91',
        status: 'planning',
        title: 'Research landing page',
        branch: null,
        prUrl: null,
        testsPassed: null,
        error: null,
        workflow: 'research_landing_page',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        updatedAt: new Date('2026-06-30T12:02:00.000Z'),
      },
      artifacts: [],
      approvals: [],
    });

    expect(html).toContain('No artifacts recorded for this mission.');
    expect(html).toContain('No approval recorded for this mission.');
    expect(html).toContain('No downstream continuation has started yet.');
    expectNoOperatorControls(html);
  });

  it('escapes malicious detail values before interpolating them into HTML', () => {
    const maliciousHtml = '<script>alert("detail")</script>';
    const html = renderMissionDetailPage({
      scenario: {
        ...scenario,
        name: `Scenario ${maliciousHtml}`,
        expectedStages: scenario.expectedStages.map((stage) => ({
          ...stage,
          label: `${stage.label} ${maliciousHtml}`,
          description: `${stage.description} ${maliciousHtml}`,
        })),
      },
      run: {
        id: `run-${maliciousHtml}`,
        cardProvider: 'plane',
        cardId: `card-${maliciousHtml}`,
        cardIdentifier: `AGP-${maliciousHtml}`,
        status: 'awaiting_approval',
        title: `Run ${maliciousHtml}`,
        branch: `agent/${maliciousHtml}`,
        prUrl: `https://example.com/pr?q=${maliciousHtml}&name="quoted"`,
        testsPassed: false,
        error: `Error ${maliciousHtml}`,
        workflow: 'research_landing_page',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        updatedAt: new Date('2026-06-30T12:05:00.000Z'),
      },
      artifacts: [
        {
          id: `artifact-${maliciousHtml}`,
          kind: `research-${maliciousHtml}`,
          createdAt: new Date('2026-06-30T12:04:00.000Z'),
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          runId: `run-${maliciousHtml}`,
          reason: `plan-${maliciousHtml}`,
          status: `pending-${maliciousHtml}`,
          summary: `Approval ${maliciousHtml}`,
          requestedAt: new Date('2026-06-30T12:05:00.000Z'),
          resolvedAt: null,
          resolvedBy: `operator-${maliciousHtml}`,
        },
      ],
    });

    expect(html).not.toContain(maliciousHtml);
    expect(html).toContain('Scenario &lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain('Run &lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain('AGP-&lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain('/artifacts/artifact-&lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain('research-&lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain('Approval &lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;');
    expect(html).toContain(
      'https://example.com/pr?q=&lt;script&gt;alert(&quot;detail&quot;)&lt;/script&gt;&amp;name=&quot;quoted&quot;',
    );
  });
});

function expectNoOperatorControls(html: string) {
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Launch run');
  expect(html).not.toContain('Start mission');
  expect(html).not.toContain('Replay run');
  expect(html).not.toContain('Approve run');
  expect(html).not.toContain('Retry run');
  expect(html).not.toContain('Cancel run');
  expect(html).not.toContain('Deploy');
}
