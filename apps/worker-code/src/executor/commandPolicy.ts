/**
 * Allowlist de comandos do runner (MAC-31). Os comandos rodam via `bash -lc`,
 * então além de restringir o binário (1º token) bloqueamos operadores de shell
 * que permitiriam encadear/escapar (`;`, `&&`, `|`, `$(...)`, redirecionamentos).
 */

/** Operadores que encadeiam ou injetam outro comando — proibidos. */
const SHELL_OPERATORS = /[;&|`<>\n]|\$\(/;

export interface CommandCheck {
  allowed: boolean;
  reason?: string;
}

/** Verifica um comando contra a allowlist de binários. */
export function checkCommand(command: string, allowlist: string[]): CommandCheck {
  const trimmed = command.trim();
  if (!trimmed) return { allowed: false, reason: 'comando vazio' };
  if (SHELL_OPERATORS.test(trimmed)) {
    return {
      allowed: false,
      reason: 'operador de shell não permitido (encadeamento/substituição)',
    };
  }
  const bin = trimmed.split(/\s+/)[0] ?? '';
  if (!allowlist.includes(bin)) {
    return { allowed: false, reason: `binário fora da allowlist: ${bin}` };
  }
  return { allowed: true };
}
