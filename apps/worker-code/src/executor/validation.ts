import type { CommandResult } from '../types.js';

const MAX_FAILURE_CHARS = 3000;
const FAILURE_HEAD_CHARS = 1200;
const FAILURE_TAIL_CHARS = 1800;

function summarizeOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length <= MAX_FAILURE_CHARS) return trimmed;
  const head = trimmed.slice(0, FAILURE_HEAD_CHARS).trimEnd();
  const tail = trimmed.slice(-FAILURE_TAIL_CHARS).trimStart();
  return `${head}\n\n...[output truncated; keeping first and last diagnostics]...\n\n${tail}`;
}

/**
 * Resumo do primeiro comando que falhou: linha do comando + começo/fim do
 * stderr/stdout. O começo costuma ter os erros TypeScript mais relevantes; o
 * fim preserva o erro agregado do runner/pnpm.
 */
export function summarizeFailureTail(commands: CommandResult[]): string {
  const failed = commands.find((c) => c.exitCode !== 0);
  if (!failed) return '';
  const output = [failed.stderr, failed.stdout].filter((part) => part.trim()).join('\n');
  return `$ ${failed.command}\n${summarizeOutput(output)}`;
}
