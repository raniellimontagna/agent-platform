import { describe, expect, it } from 'vitest';
import { scoreCriticOutput, scorePlannerOutput } from './roleQuality.js';

describe('scorePlannerOutput', () => {
  it('aprova plano com escopo, arquivos, TDD, validação e approval reasons', () => {
    const checks = scorePlannerOutput(
      [
        '## Entendimento do problema',
        '## Escopo',
        '- `apps/api/src/index.ts`',
        'RED/GREEN/REFACTOR',
        'rtk corepack pnpm test',
        '## Critérios de aceite',
        'APPROVAL_REASONS: none',
      ].join('\n'),
    );

    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('reprova plano sem approval reasons', () => {
    const checks = scorePlannerOutput('Plano sem linha estruturada.');
    expect(checks.find((check) => check.name === 'planner:approval-reasons')?.passed).toBe(false);
  });

  it('aceita path de artifact não-ts', () => {
    const checks = scorePlannerOutput(
      [
        '## Entendimento do problema',
        '## Escopo',
        '- `infra/compose/gateway/litellm-config.yaml`',
        'RED/GREEN/REFACTOR',
        'rtk corepack pnpm test',
        '## Critérios de aceite',
        'APPROVAL_REASONS: infra',
      ].join('\n'),
    );

    expect(checks.find((check) => check.name === 'planner:files')?.passed).toBe(true);
  });
});

describe('scoreCriticOutput', () => {
  it('aprova parecer com veredito e problema acionável com path', () => {
    const checks = scoreCriticOutput(
      [
        'Veredito: REPROVADO',
        '## Problemas',
        '- `src/index.ts` — bug funcional; corrija a condição.',
        '## Observações',
        '- Teste cobre regressão.',
      ].join('\n'),
    );

    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('reprova parecer sem veredito', () => {
    const checks = scoreCriticOutput('Parece bom, mas sem formato.');
    expect(checks.find((check) => check.name === 'critic:verdict')?.passed).toBe(false);
  });

  it('aprova aprovação limpa com observação pós-veredito', () => {
    const checks = scoreCriticOutput('Veredito: APROVADO\n\nSem problemas bloqueantes.');
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('aceita path de artifact não-ts no texto', () => {
    const checks = scoreCriticOutput(
      [
        'Veredito: REPROVADO',
        '## Problemas',
        '- `infra/compose/gateway/litellm-config.yaml` — configuração inválida',
      ].join('\n'),
    );

    expect(checks.find((check) => check.name === 'critic:file-path')?.passed).toBe(true);
  });
});
