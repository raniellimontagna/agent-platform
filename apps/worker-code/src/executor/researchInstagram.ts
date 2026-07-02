export function extractInstagramHandles(text: string, limit = 5): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(/(^|[^\w.])@([a-zA-Z0-9._]{2,30})\b/g)) {
    const handle = match[2]?.replace(/\.+$/g, '').toLowerCase();
    if (!handle) continue;
    handles.add(handle);
    if (handles.size >= limit) break;
  }
  return [...handles];
}

export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export function normalizeInstagramHandles(handles: string[]): string[] {
  return [...new Set(handles.map((handle) => handle.toLowerCase()).filter(Boolean))];
}
