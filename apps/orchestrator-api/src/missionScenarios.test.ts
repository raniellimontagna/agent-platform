import { describe, expect, it } from 'vitest';
import {
  RESEARCH_TO_LANDING_SCENARIO_ID,
  getE2eMissionScenario,
  listE2eMissionScenarios,
} from './missionScenarios.js';

describe('E2E mission scenario registry', () => {
  it('lists scenarios in priority order', () => {
    const scenarios = listE2eMissionScenarios();

    expect(scenarios.map((scenario) => scenario.id)).toEqual([RESEARCH_TO_LANDING_SCENARIO_ID]);
    expect(scenarios.map((scenario) => scenario.priority)).toEqual([1]);
  });

  it('describes the required Plane labels for research-to-landing', () => {
    const scenario = getE2eMissionScenario(RESEARCH_TO_LANDING_SCENARIO_ID);

    expect(scenario?.requiredLabels.map((label) => label.name)).toEqual([
      'ai-ready',
      'workflow:landing-page',
    ]);
  });

  it('describes the expected research-to-landing stage ids', () => {
    const scenario = getE2eMissionScenario(RESEARCH_TO_LANDING_SCENARIO_ID);

    expect(scenario?.expectedStages.map((stage) => stage.id)).toEqual([
      'queued',
      'planning',
      'awaiting_approval',
      'collecting_research',
      'landing_generation',
      'pull_request',
      'completed',
    ]);
  });

  it('includes operator-facing risk and verification checklist metadata', () => {
    const scenario = getE2eMissionScenario(RESEARCH_TO_LANDING_SCENARIO_ID);

    expect(scenario?.riskLevel).toBe('caution');
    expect(scenario?.verificationChecklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'plane-labels',
          label: expect.stringContaining('ai-ready'),
        }),
        expect.objectContaining({
          id: 'landing-brief',
          label: expect.stringContaining('Landing Page Brief'),
        }),
      ]),
    );
  });
});
