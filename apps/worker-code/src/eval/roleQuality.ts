import type { EvalCheck } from './types.js';

function check(name: string, passed: boolean, detail: string): EvalCheck {
  return { name, passed, detail };
}

export function scorePlannerOutput(plan: string): EvalCheck[] {
  return [
    check('planner:understanding', /entendimento/i.test(plan), 'contains understanding section'),
    check('planner:scope', /escopo|fora de escopo/i.test(plan), 'contains scope section'),
    check(
      'planner:files',
      /`[^`]+\.(ts|tsx|js|jsx|md|json|astro)`/.test(plan),
      'contains exact file path',
    ),
    check(
      'planner:tdd',
      /RED\/GREEN\/REFACTOR|teste que falha|TDD/i.test(plan),
      'contains TDD guidance',
    ),
    check(
      'planner:validation',
      /rtk .*?(pnpm|vitest|test|lint|build)/i.test(plan),
      'contains rtk validation command',
    ),
    check(
      'planner:acceptance',
      /crit[eé]rios? de aceite|acceptance/i.test(plan),
      'contains acceptance criteria',
    ),
    check(
      'planner:approval-reasons',
      /APPROVAL_REASONS:\s*(none|migration|auth_security|infra|deploy|critical_deps|file_deletion)/.test(
        plan,
      ),
      'contains structured approval reasons line',
    ),
  ];
}

export function scoreCriticOutput(review: string): EvalCheck[] {
  const hasVerdict = /Veredito\**\s*:\s*\**\s*(APROVADO|APROVADO COM RESSALVAS|REPROVADO)/i.test(
    review,
  );
  const hasProblemsSection = /problemas/i.test(review);
  const hasPath = /`[^`]+\.(ts|tsx|js|jsx|md|json|astro)`/.test(review);
  const approved = /Veredito\**\s*:\s*\**\s*APROVADO\s*$/im.test(review);

  return [
    check('critic:verdict', hasVerdict, 'contains supported verdict'),
    check(
      'critic:problems-section',
      hasProblemsSection || approved,
      'contains problems section or clean approval',
    ),
    check('critic:file-path', hasPath || approved, 'contains file path for actionable feedback'),
    check(
      'critic:blocking-language',
      /bug|seguran[cç]a|regress[aã]o|teste|escopo|operacional|evid[eê]ncia|aprovado/i.test(review),
      'uses quality gate language',
    ),
  ];
}
