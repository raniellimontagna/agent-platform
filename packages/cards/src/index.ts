export type CardProvider = 'plane' | 'linear';

export interface CardContext {
  provider: CardProvider;
  id: string;
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  url?: string;
  projectId?: string;
}

export interface CreateCardInput {
  title: string;
  description: string;
  labelIds?: string[];
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  stateId?: string;
  externalSource?: string;
  externalId?: string;
}

export interface CardGateway {
  provider: CardProvider;
  getCard(id: string): Promise<CardContext>;
  comment(cardId: string, body: string): Promise<void>;
  setCardState(cardId: string, stateId: string): Promise<void>;
  createCard(input: CreateCardInput): Promise<CardContext>;
}

export interface CardGatewayRegistry {
  primary: CardGateway;
  forProvider(provider: CardProvider): CardGateway;
}

export function createCardGatewayRegistry(input: {
  primaryProvider: CardProvider;
  gateways: CardGateway[];
}): CardGatewayRegistry {
  const byProvider = new Map<CardProvider, CardGateway>();
  for (const gateway of input.gateways) byProvider.set(gateway.provider, gateway);
  const primary = byProvider.get(input.primaryProvider);
  if (!primary) throw new Error(`Primary card provider not configured: ${input.primaryProvider}`);

  return {
    primary,
    forProvider(provider) {
      const gateway = byProvider.get(provider);
      if (!gateway) throw new Error(`Card provider not configured: ${provider}`);
      return gateway;
    },
  };
}

export function markdownToPlaneHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    out.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  flushList();
  return out.join('');
}

function inlineMarkdown(value: string): string {
  const codeChunk = /`([^`]+)`/g;
  const chunks: string[] = [];
  let cursor = 0;
  let match = codeChunk.exec(value);

  while (match !== null) {
    const code = match[1];
    chunks.push(formatInlineMarkdown(value.slice(cursor, match.index)));
    if (code !== undefined) {
      chunks.push(`<code>${escapeHtml(code)}</code>`);
    } else {
      chunks.push(escapeHtml(match[0]));
    }
    cursor = match.index + match[0].length;
    match = codeChunk.exec(value);
  }

  chunks.push(formatInlineMarkdown(value.slice(cursor)));
  return chunks.join('');
}

function formatInlineMarkdown(value: string): string {
  const linkChunk = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  const chunks: string[] = [];
  let cursor = 0;
  let match = linkChunk.exec(value);

  while (match !== null) {
    const label = match[1];
    const url = match[2];
    chunks.push(formatBold(escapeHtml(value.slice(cursor, match.index))));

    const href = url ? normalizePlaneHref(url) : null;
    if (href && label !== undefined) {
      chunks.push(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
    } else {
      chunks.push(escapeHtml(match[0]));
    }

    cursor = match.index + match[0].length;
    match = linkChunk.exec(value);
  }

  chunks.push(formatBold(escapeHtml(value.slice(cursor))));
  return chunks.join('');
}

function formatBold(value: string): string {
  return value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function normalizePlaneHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
