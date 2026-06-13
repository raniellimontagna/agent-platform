/**
 * Motivos de aprovação que NÃO podem ser auto-aprovados por um run agendado
 * (MAC-38/41): mudanças sensíveis sempre exigem humano. `plan` e `cost_limit`
 * não bloqueiam a autonomia.
 */
const CRITICAL_REASONS = new Set([
  'migration',
  'auth_security',
  'infra',
  'deploy',
  'critical_deps',
  'file_deletion',
]);

/** Um motivo de aprovação exige humano mesmo em run auto-aprovável? */
export function isCriticalReason(reason: string): boolean {
  return CRITICAL_REASONS.has(reason);
}

/** Há ao menos um motivo crítico na lista? */
export function hasCriticalReason(reasons: string[]): boolean {
  return reasons.some(isCriticalReason);
}
