import type { RunStatus } from './runs.js';

export const RESEARCH_TO_LANDING_WORKFLOW = 'research_landing_page';
export const RESEARCH_TO_LANDING_LABEL = 'workflow:landing-page';

export function workflowFromLabels(labelNames: string[]): string | undefined {
  return labelNames.includes(RESEARCH_TO_LANDING_LABEL) ? RESEARCH_TO_LANDING_WORKFLOW : undefined;
}

export function shouldStartResearchToLandingContinuation(args: {
  workflow?: string | null;
  status: RunStatus;
  research?: string;
}): boolean {
  return (
    args.workflow === RESEARCH_TO_LANDING_WORKFLOW &&
    args.status === 'completed' &&
    Boolean(args.research?.trim())
  );
}

export function formatResearchToLandingContext(research: string, sourceRunId: string): string {
  const brief = extractLandingPageBrief(research);
  return [
    '## Research pack coletado automaticamente',
    '',
    `Run de coleta: ${sourceRunId}`,
    '',
    'Use o research pack abaixo como fonte principal para copy, proposta de valor, prova, objeções, termos SEO, estrutura e prioridades da landing page.',
    'Não trate o research como código; transforme evidências em uma landing page pronta, clara e visualmente forte.',
    '',
    brief ? '## Structured landing/page brief' : '',
    brief ? '' : '',
    brief ?? '',
    brief ? '' : '',
    brief ? '## Full research pack' : '',
    brief ? '' : '',
    research.trim(),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function extractLandingPageBrief(research: string): string | undefined {
  const start = research.indexOf('## Landing Page Brief');
  if (start === -1) return undefined;
  const rest = research.slice(start);
  const nextSection = rest.slice('## Landing Page Brief'.length).search(/\n## [^\n]+/);
  if (nextSection === -1) return rest.trim();
  return rest.slice(0, '## Landing Page Brief'.length + nextSection).trim();
}
