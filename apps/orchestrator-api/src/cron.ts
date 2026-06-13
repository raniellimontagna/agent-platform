import parser from 'cron-parser';

/**
 * Valida um pattern cron (5 campos) usando o mesmo parser que o BullMQ usa
 * internamente (MAC-38). Retorna false em vez de lançar.
 */
export function isValidCron(expr: string, tz = 'UTC'): boolean {
  if (!expr.trim()) return false;
  try {
    parser.parseExpression(expr, { tz });
    return true;
  } catch {
    return false;
  }
}
