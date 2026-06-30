import { RESEARCH_TO_LANDING_LABEL, RESEARCH_TO_LANDING_WORKFLOW } from './workflows.js';

export type E2eMissionRiskLevel = 'safe' | 'caution' | 'dangerous';

export type E2eMissionStageId =
  | 'queued'
  | 'planning'
  | 'awaiting_approval'
  | 'collecting_research'
  | 'landing_generation'
  | 'pull_request'
  | 'completed';

export interface E2eMissionLabelRequirement {
  name: string;
  description: string;
}

export interface E2eMissionStage {
  id: E2eMissionStageId;
  label: string;
  description: string;
}

export interface E2eMissionChecklistItem {
  id: string;
  label: string;
}

export interface E2eMissionScenario {
  id: string;
  workflow: string;
  version: number;
  priority: number;
  name: string;
  summary: string;
  riskLevel: E2eMissionRiskLevel;
  requiredLabels: E2eMissionLabelRequirement[];
  expectedStages: E2eMissionStage[];
  verificationChecklist: E2eMissionChecklistItem[];
}

export const RESEARCH_TO_LANDING_SCENARIO_ID = 'research-to-landing';

export const E2E_MISSION_SCENARIOS: E2eMissionScenario[] = [
  {
    id: RESEARCH_TO_LANDING_SCENARIO_ID,
    workflow: RESEARCH_TO_LANDING_WORKFLOW,
    version: 1,
    priority: 1,
    name: 'Research to landing page',
    summary:
      'Collect public research evidence, request operator approval, then continue into landing page generation.',
    riskLevel: 'caution',
    requiredLabels: [
      {
        name: 'ai-ready',
        description: 'Marks the Plane card as eligible for agent workflow intake.',
      },
      {
        name: RESEARCH_TO_LANDING_LABEL,
        description: 'Selects the research-to-landing E2E workflow.',
      },
    ],
    expectedStages: [
      {
        id: 'queued',
        label: 'Queued',
        description: 'The card has matching labels and is waiting for orchestration.',
      },
      {
        id: 'planning',
        label: 'Planning',
        description: 'The agent prepares research scope and execution steps.',
      },
      {
        id: 'awaiting_approval',
        label: 'Awaiting approval',
        description: 'Operator approval is required before continuing to implementation.',
      },
      {
        id: 'collecting_research',
        label: 'Collecting research',
        description: 'The workflow gathers source material and evidence for the landing page.',
      },
      {
        id: 'landing_generation',
        label: 'Landing generation',
        description: 'The approved research pack is transformed into a landing page branch.',
      },
      {
        id: 'pull_request',
        label: 'Pull request',
        description: 'Generated changes are reviewed through the repository PR flow.',
      },
      {
        id: 'completed',
        label: 'Completed',
        description: 'The E2E workflow reached its final successful state.',
      },
    ],
    verificationChecklist: [
      {
        id: 'plane-labels',
        label: 'Plane card has ai-ready and workflow:landing-page labels before intake.',
      },
      {
        id: 'public-url',
        label: 'Public URLs needed for research are reachable without private credentials.',
      },
      {
        id: 'research-artifact',
        label: 'Research artifact is created and attached to the originating run.',
      },
      {
        id: 'landing-brief',
        label: 'Research artifact includes a Landing Page Brief section for continuation.',
      },
      {
        id: 'pull-request',
        label: 'Landing generation produces a reviewable pull request when approved.',
      },
    ],
  },
];

export function listE2eMissionScenarios(): E2eMissionScenario[] {
  return [...E2E_MISSION_SCENARIOS].sort((a, b) => a.priority - b.priority);
}

export function getE2eMissionScenario(id: string): E2eMissionScenario | undefined {
  return E2E_MISSION_SCENARIOS.find((scenario) => scenario.id === id);
}
