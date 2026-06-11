/**
 * Approval Policies (MAC-41). Classifica o plano do agente para detectar
 * mudanças que EXIGEM aprovação humana — migrations, deploy, auth/segurança,
 * infra, deleção de arquivos, dependências críticas. Espelha o enum
 * `approval_reason` do banco do orquestrador.
 */
export type ApprovalReason =
  | 'plan'
  | 'migration'
  | 'auth_security'
  | 'infra'
  | 'deploy'
  | 'critical_deps'
  | 'cost_limit'
  | 'file_deletion';

const RULES: { reason: ApprovalReason; pattern: RegExp }[] = [
  { reason: 'migration', pattern: /\bmigrat|\bmigração|\bmigracao|schema do banco|alter table/i },
  {
    reason: 'auth_security',
    pattern: /\bauth|autentica|autoriza|senha|password|token|secret|segurança|seguranca|permiss/i,
  },
  {
    reason: 'infra',
    pattern: /\binfra|docker|kubernet|k8s|terraform|proxmox|compose|nginx|caddy/i,
  },
  { reason: 'deploy', pattern: /\bdeploy|publica|release|produção|producao|rollout/i },
  {
    reason: 'critical_deps',
    pattern: /\bdepend[eê]ncia|package\.json|lockfile|nova lib|new dependency/i,
  },
  { reason: 'file_deletion', pattern: /\bdelet|remover arquivo|remoção de arquivo|rm -rf|apagar/i },
];

/**
 * Detecta os motivos de aprovação presentes no plano. Sempre inclui `plan`
 * (todo run passa por aprovação humana no MVP) + os motivos críticos achados.
 */
export function detectApprovalReasons(plan: string): ApprovalReason[] {
  const found = new Set<ApprovalReason>(['plan']);
  for (const rule of RULES) {
    if (rule.pattern.test(plan)) found.add(rule.reason);
  }
  return [...found];
}

/** Motivos críticos (fora o `plan` base) — exigem atenção redobrada. */
export function criticalReasons(reasons: ApprovalReason[]): ApprovalReason[] {
  return reasons.filter((r) => r !== 'plan');
}

const LABELS: Record<ApprovalReason, string> = {
  plan: 'Plano',
  migration: 'Migração de banco',
  auth_security: 'Auth/Segurança',
  infra: 'Infraestrutura',
  deploy: 'Deploy',
  critical_deps: 'Dependências',
  cost_limit: 'Custo',
  file_deletion: 'Deleção de arquivos',
};

/** Rótulo legível de um motivo de aprovação. */
export function reasonLabel(reason: ApprovalReason): string {
  return LABELS[reason];
}
