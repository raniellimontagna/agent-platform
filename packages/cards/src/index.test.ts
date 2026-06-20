import { describe, expect, it } from 'vitest';
import {
  createCardGatewayRegistry,
  markdownToPlaneHtml,
  type CardGateway,
} from './index.js';

const plane: CardGateway = {
  provider: 'plane',
  getCard: async () => ({
    provider: 'plane',
    id: 'plane-1',
    identifier: 'AGP-1',
    title: 'Plane card',
    description: '',
    labels: [],
  }),
  comment: async () => undefined,
  setCardState: async () => undefined,
  createCard: async () => ({
    provider: 'plane',
    id: 'plane-1',
    identifier: 'AGP-1',
    title: 'Plane card',
    description: '',
    labels: [],
  }),
};

const linear: CardGateway = { ...plane, provider: 'linear' };

describe('createCardGatewayRegistry', () => {
  it('selects the configured primary and explicit providers', () => {
    const registry = createCardGatewayRegistry({
      primaryProvider: 'plane',
      gateways: [plane, linear],
    });

    expect(registry.primary.provider).toBe('plane');
    expect(registry.forProvider('linear').provider).toBe('linear');
  });

  it('throws a clear error when a provider is missing', () => {
    const registry = createCardGatewayRegistry({
      primaryProvider: 'plane',
      gateways: [plane],
    });

    expect(() => registry.forProvider('linear')).toThrow('Card provider not configured: linear');
  });
});

describe('markdownToPlaneHtml', () => {
  it('converts common markdown safely for Plane comments', () => {
    expect(markdownToPlaneHtml('## Title\n\n**Status:** `ok`\n\n- item')).toBe(
      '<h2>Title</h2><p><strong>Status:</strong> <code>ok</code></p><ul><li>item</li></ul>',
    );
  });

  it('converts inline markdown links into Plane anchors', () => {
    expect(markdownToPlaneHtml('Migrated from Linear: [MAC-123](https://linear/MAC-123).')).toBe(
      '<p>Migrated from Linear: <a href="https://linear/MAC-123">MAC-123</a>.</p>',
    );
  });

  it('leaves markdown inside code spans untouched', () => {
    expect(markdownToPlaneHtml('`**ok**`')).toBe('<p><code>**ok**</code></p>');
  });
});
