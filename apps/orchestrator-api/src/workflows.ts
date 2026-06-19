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
  return [
    '## Research pack coletado automaticamente',
    '',
    `Run de coleta: ${sourceRunId}`,
    '',
    'Use o research pack abaixo como fonte principal para copy, proposta de valor, prova, objeções, termos SEO, estrutura e prioridades da landing page.',
    'Não trate o research como código; transforme evidências em uma landing page pronta, clara e visualmente forte.',
    '',
    research.trim(),
  ].join('\n');
}
