import { describe, expect, it } from 'vitest';
import { PLANNER_BASE_PROMPT, PLANNER_SYSTEM_PROMPT, plannerModelAlias } from './planner.js';

describe('PLANNER_SYSTEM_PROMPT', () => {
  it('exige plano no estilo Superpowers com TDD, paths e validação objetiva', () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain('Superpowers-inspired');
    expect(PLANNER_SYSTEM_PROMPT).toContain('RED/GREEN/REFACTOR');
    expect(PLANNER_SYSTEM_PROMPT).toContain('paths exatos');
    expect(PLANNER_SYSTEM_PROMPT).toContain('comandos de validação');
    expect(PLANNER_SYSTEM_PROMPT).toContain('Self-review');
  });

  it('mantém a linha estruturada de approval reasons como última exigência', () => {
    expect(PLANNER_BASE_PROMPT).toContain('APPROVAL_REASONS:');
    expect(PLANNER_BASE_PROMPT).toContain('Valores válidos: migration');
  });

  it('compõe o prompt do planner com contrato de role', () => {
    expect(PLANNER_BASE_PROMPT).toContain('APPROVAL_REASONS:');
    expect(PLANNER_SYSTEM_PROMPT).toContain('Role contract: software-planner');
    expect(PLANNER_SYSTEM_PROMPT).toContain('Software Planner');
  });

  it('usa alias de modelo da role planner', () => {
    expect(plannerModelAlias()).toBe('research');
  });
});
