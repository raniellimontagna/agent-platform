import { describe, expect, it } from 'vitest';
import type { CardGateway } from '@agent-platform/cards';
import type { LinearGateway } from './index.js';

describe('LinearGateway', () => {
  it('is assignable to CardGateway while preserving legacy methods', () => {
    const gateway = {} as LinearGateway;
    const cardGateway: CardGateway = gateway;
    expect(cardGateway).toBe(gateway);
  });
});
