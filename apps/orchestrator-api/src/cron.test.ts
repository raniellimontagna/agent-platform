import { describe, expect, it } from 'vitest';
import { isValidCron } from './cron.js';

describe('isValidCron', () => {
  it('aceita cron válido', () => {
    expect(isValidCron('0 9 * * 1')).toBe(true); // toda 2ª às 09:00
    expect(isValidCron('*/5 * * * *')).toBe(true);
  });

  it('rejeita cron inválido', () => {
    expect(isValidCron('not a cron')).toBe(false);
    expect(isValidCron('99 99 * * *')).toBe(false);
    expect(isValidCron('')).toBe(false);
  });
});
