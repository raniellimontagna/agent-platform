export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}

export function humanizeStatus(value: string | undefined): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
