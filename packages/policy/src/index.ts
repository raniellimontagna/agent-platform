/**
 * Approval Policies (MAC-41). O Planner emite uma linha estruturada
 * `APPROVAL_REASONS: <lista>` com SÓ os motivos que de fato exigem aprovação
 * humana — migrations, deploy, auth/segurança, infra, deleção de arquivos,
 * dependências críticas. Espelha o enum `approval_reason` do banco.
 *
 * Lemos essa linha em vez de escanear a prosa: o template do plano sempre cita
 * "riscos: migrations, auth, infra, deploy" (mesmo dizendo "não aplicável"),
 * então um scan de palavras dá falso positivo.
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

const VALID = new Set<ApprovalReason>([
  'migration',
  'auth_security',
  'infra',
  'deploy',
  'critical_deps',
  'cost_limit',
  'file_deletion',
]);

const REASONS_LINE = /APPROVAL_REASONS\s*:\s*([^\n]+)/i;

/**
 * Lê a linha `APPROVAL_REASONS:` do plano e devolve os motivos. Sempre inclui
 * `plan` (todo run passa por aprovação humana no MVP). Tokens desconhecidos e
 * `none` são ignorados.
 */
export function parseApprovalReasons(plan: string): ApprovalReason[] {
  const found = new Set<ApprovalReason>(['plan']);
  const match = plan.match(REASONS_LINE);
  if (match?.[1]) {
    for (const raw of match[1].split(/[,;]/)) {
      const token = raw.trim().toLowerCase() as ApprovalReason;
      if (VALID.has(token)) found.add(token);
    }
  }
  return [...found];
}

/** Remove a linha de controle `APPROVAL_REASONS:` do plano antes de exibir. */
export function stripApprovalReasonsLine(plan: string): string {
  return plan
    .replace(/^.*APPROVAL_REASONS\s*:.*$/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
