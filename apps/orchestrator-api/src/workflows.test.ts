import { describe, expect, it } from 'vitest';
import {
  RESEARCH_TO_LANDING_WORKFLOW,
  formatResearchToLandingContext,
  shouldStartResearchToLandingContinuation,
  workflowFromLabels,
} from './workflows.js';

describe('workflowFromLabels', () => {
  it('ativa research→landing pela label workflow:landing-page', () => {
    expect(workflowFromLabels(['ai-ready', 'workflow:landing-page'])).toBe(
      RESEARCH_TO_LANDING_WORKFLOW,
    );
  });

  it('não ativa workflow sem label explícita', () => {
    expect(workflowFromLabels(['ai-ready', 'agent:data-collector'])).toBeUndefined();
  });
});

describe('shouldStartResearchToLandingContinuation', () => {
  it('continua só quando o run de coleta completou com research', () => {
    expect(
      shouldStartResearchToLandingContinuation({
        workflow: RESEARCH_TO_LANDING_WORKFLOW,
        status: 'completed',
        research: '# Research',
      }),
    ).toBe(true);
  });

  it('bloqueia runs sem workflow, falhos ou sem research', () => {
    expect(
      shouldStartResearchToLandingContinuation({
        workflow: undefined,
        status: 'completed',
        research: '# Research',
      }),
    ).toBe(false);
    expect(
      shouldStartResearchToLandingContinuation({
        workflow: RESEARCH_TO_LANDING_WORKFLOW,
        status: 'failed',
        research: '# Research',
      }),
    ).toBe(false);
    expect(
      shouldStartResearchToLandingContinuation({
        workflow: RESEARCH_TO_LANDING_WORKFLOW,
        status: 'completed',
        research: '   ',
      }),
    ).toBe(false);
  });
});

describe('formatResearchToLandingContext', () => {
  it('inclui run de origem e research no contexto do planner', () => {
    const context = formatResearchToLandingContext('# Research Pack', 'run-1');

    expect(context).toContain('Run de coleta: run-1');
    expect(context).toContain('fonte principal');
    expect(context).toContain('# Research Pack');
  });

  it('promove briefing estruturado antes do research pack completo', () => {
    const context = formatResearchToLandingContext(
      [
        '# Research Pack - AGP-1',
        '',
        '## Landing Page Brief',
        '',
        '### Brand / Subject',
        '',
        '- Camera e Carburador',
        '',
        '### Recommended Page Structure',
        '',
        '- Hero com proposta de valor.',
        '',
        '## Apify Instagram Findings',
        '',
        '- AP1: @cameraecarburador via Apify actor.',
      ].join('\n'),
      'run-1',
    );

    expect(context.indexOf('## Structured landing/page brief')).toBeLessThan(
      context.indexOf('## Full research pack'),
    );
    expect(context).toContain('### Recommended Page Structure');
    expect(context).toContain('# Research Pack - AGP-1');
  });
});
