import { pino } from 'pino';
import { env } from './env.js';

/** Chaves redigidas nos logs pra secrets nunca vazarem (MAC-30). */
const REDACT_PATHS = [
  'authorization',
  '*.authorization',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'password',
  '*.password',
  'secret',
  '*.secret',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
