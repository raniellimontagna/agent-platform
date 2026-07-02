import { MAX_EDIT_FILES } from './codegenFiles.js';

export function selectFixCandidateFiles(filesChanged: string[], failureTail: string): string[] {
  const candidates = [...new Set(filesChanged)].slice(0, MAX_EDIT_FILES);
  const normalizedTail = failureTail.replaceAll('\\', '/');
  const changedTests = candidates.filter(isTestPath);
  const mentioned = candidates.filter((path) => {
    const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/');
    const suffixes = normalized
      .split('/')
      .map((_, index, parts) => parts.slice(index).join('/'))
      .filter((suffix) => suffix.includes('/'));
    const fileName = normalized.split('/').pop() ?? normalized;
    return (
      normalizedTail.includes(normalized) ||
      normalizedTail.includes(`./${normalized}`) ||
      suffixes.some((suffix) => normalizedTail.includes(suffix)) ||
      normalizedTail.includes(fileName)
    );
  });

  return mentioned.length > 0
    ? [...new Set([...mentioned, ...changedTests])].slice(0, MAX_EDIT_FILES)
    : candidates.slice(0, 6);
}

export function isTextFixablePath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/').toLowerCase();
  if (normalized.startsWith('public/generated/')) return false;
  return !/\.(?:avif|bin|gif|ico|jpe?g|mov|mp4|otf|pdf|png|ttf|webm|webp|woff2?|zip)$/.test(
    normalized,
  );
}

export function buildFixCandidateFiles(
  filesChanged: string[],
  failureTail: string,
): {
  fixableChangedFiles: string[];
  prioritizedCandidates: string[];
  fixCandidates: string[];
} {
  const fixableChangedFiles = filesChanged.filter(isTextFixablePath);
  const prioritizedCandidates = selectFixCandidateFiles(fixableChangedFiles, failureTail);
  return {
    fixableChangedFiles,
    prioritizedCandidates,
    fixCandidates: [...new Set([...prioritizedCandidates, ...fixableChangedFiles])].slice(
      0,
      MAX_EDIT_FILES,
    ),
  };
}

function isTestPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/');
  return (
    /(^|\/)(__tests__|test|tests)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}
