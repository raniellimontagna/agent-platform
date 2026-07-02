import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { runCommand } from './worktree.js';

export interface CodegenFile {
  path: string;
  content: string;
}

/** Limites para não estourar o contexto do modelo ao injetar conteúdo. */
export const MAX_EDIT_FILES = 15;
export const MAX_FILE_CHARS = 20_000;

/** Lista os arquivos rastreados pelo git para dar contexto ao modelo. */
export async function listRepoFiles(dir: string): Promise<string[]> {
  const res = await runCommand('git ls-files', dir);
  if (res.exitCode !== 0) return [];
  return res.stdout.split('\n').filter(Boolean);
}

/** Garante que o caminho não escapa do worktree (defesa contra path traversal). */
export function safeJoin(dir: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, '');
  const full = resolve(dir, normalized);
  if (full !== dir && !full.startsWith(`${dir}/`)) {
    throw new Error(`caminho de arquivo fora do worktree: ${relPath}`);
  }
  return full;
}

/** Lê o conteúdo atual dos arquivos a modificar (truncado por segurança). */
export async function readCurrentFiles(
  dir: string,
  repoFiles: Set<string>,
  editPaths: string[],
): Promise<CodegenFile[]> {
  const out: CodegenFile[] = [];
  for (const rel of editPaths.slice(0, MAX_EDIT_FILES)) {
    const normalized = rel.replace(/^\/+/, '');
    // Só lê o que de fato existe no repo (ignora alucinações do modelo).
    if (!repoFiles.has(normalized)) continue;
    const content = await readFile(safeJoin(dir, normalized), 'utf8');
    out.push({
      path: normalized,
      content: content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) : content,
    });
  }
  return out;
}

/** Relê arquivos já escritos no worktree; arquivos ausentes são ignorados. */
export async function readWorktreeFiles(
  dir: string,
  relPaths: string[],
  maxChars = MAX_FILE_CHARS,
): Promise<CodegenFile[]> {
  const current: CodegenFile[] = [];
  for (const rel of relPaths) {
    try {
      const content = await readFile(safeJoin(dir, rel), 'utf8');
      current.push({ path: rel, content: content.slice(0, maxChars) });
    } catch {
      // arquivo sumiu entre escrita e releitura — ignora.
    }
  }
  return current;
}

/** Escreve os arquivos no worktree e devolve os caminhos aplicados (DRY codegen/fix). */
export async function applyFiles(dir: string, files: CodegenFile[]): Promise<string[]> {
  const applied: string[] = [];
  for (const file of files) {
    const full = safeJoin(dir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, 'utf8');
    applied.push(file.path.replace(/^\/+/, ''));
  }
  return applied;
}

export function filterAllowedFiles(
  files: CodegenFile[],
  allowedPaths: string[],
): { files: CodegenFile[]; dropped: string[] } {
  const allowed = new Set(allowedPaths.map((path) => path.replace(/^\/+/, '')));
  const out: CodegenFile[] = [];
  const dropped: string[] = [];

  for (const file of files) {
    const normalized = file.path.replace(/^\/+/, '');
    if (allowed.has(normalized)) {
      out.push({ ...file, path: normalized });
    } else {
      dropped.push(normalized);
    }
  }

  return { files: out, dropped };
}

export function formatAvailableFiles(
  repoFiles: string[],
  generatedFiles: { path: string }[],
): string {
  return [...new Set([...repoFiles, ...generatedFiles.map((file) => file.path)])]
    .slice(0, 900)
    .join('\n');
}

/** Caminho absoluto de um arquivo do worktree (exportado p/ testes futuros). */
export function worktreeFilePath(dir: string, relPath: string): string {
  return join(dir, relPath);
}
