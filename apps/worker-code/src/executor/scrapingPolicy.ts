const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

const BYPASS_PATTERNS = [
  /\bbypass\b.*\b(login|captcha|paywall|auth|authentication)\b/i,
  /\b(login|captcha|paywall|auth|authentication)\b.*\bbypass\b/i,
  /\bstealth\b/i,
  /\banti[- ]?bot\b/i,
  /\bcloudflare\b.*\bbypass\b/i,
];

const BROAD_CRAWL_PATTERNS = [
  /\bcrawl\b.*\b(entire|whole|all)\b/i,
  /\b(entire|whole)\b.*\b(site|domain|web)\b/i,
  /\ball links\b/i,
  /\brecursiv(e|ely)\b/i,
  /\bunrestricted\b.*\b(scrap|crawl)/i,
];

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

export const DEFAULT_SCRAPING_LIMITS: ScrapingLimits = {
  maxPages: 5,
  timeoutMs: 60_000,
  maxOutputChars: 20_000,
  rateLimitPerMinute: 6,
};

export interface ScrapingLimits {
  maxPages: number;
  timeoutMs: number;
  maxOutputChars: number;
  rateLimitPerMinute: number;
}

export interface ScrapingPolicyInput {
  title: string;
  description: string;
  plan: string;
  limits: ScrapingLimits;
  defaults?: ScrapingLimits;
}

export interface ScrapingPolicyResult {
  allowed: boolean;
  urls: string[];
  reasons: string[];
  limits: ScrapingLimits;
}

export function extractExplicitUrls(text: string, limit = 5): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const normalized = match[0].replace(/[`*_~]+$/g, '').replace(/[.,;:!?]+$/g, '');
    urls.add(normalized);
    if (urls.size >= limit) break;
  }
  return [...urls];
}

export function isPlaywrightRequested(text: string): boolean {
  return /\b(playwright|browser|render(ed|ing)?|dynamic|screenshot|html rendered)\b/i.test(text);
}

export function buildScrapingPolicy(input: ScrapingPolicyInput): ScrapingPolicyResult {
  const text = [input.title, input.description, input.plan].join('\n');
  const limitCeiling = input.defaults ?? input.limits;
  const urls = extractExplicitUrls(text, limitCeiling.maxPages);
  const reasons: string[] = [];

  if (urls.length === 0) {
    reasons.push('no explicit authorized URL found in card or plan');
  }

  for (const url of urls) {
    const reason = blockedUrlReason(url);
    if (reason) reasons.push(`${url}: ${reason}`);
  }

  if (hasUnsafeBypassInstruction(text)) {
    reasons.push('bypass/login/captcha/paywall instruction is not allowed');
  }

  for (const pattern of BROAD_CRAWL_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('broad crawl, recursive crawl, or all links collection is not allowed');
      break;
    }
  }

  return {
    allowed: reasons.length === 0,
    urls,
    reasons,
    limits: clampLimits(input.limits, limitCeiling),
  };
}

function hasUnsafeBypassInstruction(text: string): boolean {
  return text
    .split(/[\n.!?;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((sentence) => {
      if (isBypassProhibition(sentence)) return false;
      return BYPASS_PATTERNS.some((pattern) => pattern.test(sentence));
    });
}

function isBypassProhibition(sentence: string): boolean {
  return /\b(do not|don't|never|avoid|without|no|não|nao|nunca|evite|sem)\b.*\b(bypass|contorn|login|captcha|paywall|rate limits?|stealth|anti[- ]?bot)\b/i.test(
    sentence,
  );
}

function clampLimits(limits: ScrapingLimits, ceiling: ScrapingLimits): ScrapingLimits {
  return {
    maxPages: clampPositiveInt(limits.maxPages, ceiling.maxPages),
    timeoutMs: clampPositiveInt(limits.timeoutMs, ceiling.timeoutMs),
    maxOutputChars: clampPositiveInt(limits.maxOutputChars, ceiling.maxOutputChars),
    rateLimitPerMinute: clampPositiveInt(limits.rateLimitPerMinute, ceiling.rateLimitPerMinute),
  };
}

function clampPositiveInt(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return ceiling;
  return Math.min(Math.floor(value), ceiling);
}

function blockedUrlReason(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'invalid URL';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return 'only http/https URLs are allowed';
  if (parsed.username || parsed.password) return 'URL credentials are not allowed';

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (METADATA_HOSTS.has(host)) return 'cloud metadata endpoint is not allowed';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost is not allowed';
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    return 'internal hostnames are not allowed';
  }
  if (isPrivateIpv4(host)) return 'private or internal network address is not allowed';
  return undefined;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : Number.NaN;
  });
  if (octets.some(Number.isNaN)) return false;
  const a = octets[0] as number;
  const b = octets[1] as number;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 224 || a >= 240) return true;
  return false;
}
