import type { CommandResult } from '../types.js';

/**
 * Tail do primeiro comando que falhou: linha do comando + final do stderr (ou
 * stdout). É o contexto de erro que alimenta o self-correction.
 */
export function summarizeFailureTail(commands: CommandResult[]): string {
  const failed = commands.find((c) => c.exitCode !== 0);
  if (!failed) return '';
  const output = [failed.stderr, failed.stdout].filter((part) => part.trim()).join('\n');
  const tail = output.trim().slice(-2500);
  return `$ ${failed.command}\n${tail}`;
}
