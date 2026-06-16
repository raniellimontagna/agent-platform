import type { CommandResult } from '../types.js';

/**
 * Tail do primeiro comando que falhou: linha do comando + final do stderr (ou
 * stdout). É o contexto de erro que alimenta o self-correction.
 */
export function summarizeFailureTail(commands: CommandResult[]): string {
  const failed = commands.find((c) => c.exitCode !== 0);
  if (!failed) return '';
  const tail = (failed.stderr || failed.stdout || '').trim().slice(-1500);
  return `$ ${failed.command}\n${tail}`;
}
