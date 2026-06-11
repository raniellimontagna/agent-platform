import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Limites pra não estourar o contexto do modelo. */
const MAX_CONVENTIONS_CHARS = 4_000;
const MAX_EXAMPLES = 4;
const MAX_EXAMPLE_CHARS = 6_000;

/**
 * Lê as convenções do projeto (CLAUDE.md na raiz, se houver) — regras de branch,
 * commit, ferramentas, etc. Guia o modelo a seguir o padrão do repo (MAC-24).
 */
export async function readConventions(dir: string, repoFiles: Set<string>): Promise<string> {
  if (!repoFiles.has('CLAUDE.md')) return '';
  try {
    const raw = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    return raw.slice(0, MAX_CONVENTIONS_CHARS);
  } catch {
    return '';
  }
}

/**
 * Monta um bloco de arquivos-exemplo: irmãos existentes (mesma pasta) dos
 * arquivos a criar. O modelo espelha o padrão real (imports, estrutura) em vez
 * de inventar — ex.: ao criar uma rota nova, vê as rotas vizinhas (MAC-24).
 */
export async function buildExamples(
  dir: string,
  repoFiles: string[],
  selection: { edit: string[]; create: string[] },
): Promise<string> {
  const norm = (p: string) => p.replace(/^\/+/, '');
  const targets = new Set([...selection.edit, ...selection.create].map(norm));
  const dirs = new Set(selection.create.map((p) => dirname(norm(p))));

  const picked: string[] = [];
  for (const d of dirs) {
    for (const f of repoFiles) {
      if (picked.length >= MAX_EXAMPLES) break;
      if (dirname(f) === d && !f.endsWith('.test.ts') && !targets.has(f) && !picked.includes(f)) {
        picked.push(f);
      }
    }
  }

  const blocks: string[] = [];
  for (const f of picked) {
    try {
      const raw = await readFile(join(dir, f), 'utf8');
      blocks.push(`\n## ${f}\n\`\`\`\n${raw.slice(0, MAX_EXAMPLE_CHARS)}\n\`\`\``);
    } catch {
      // arquivo sumiu entre o ls-files e o read — ignora.
    }
  }
  return blocks.join('\n');
}
