import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { LlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { runCommand } from './worktree.js';

const SYSTEM_PROMPT = `Você é um agente de engenharia de software que escreve código.
Recebe uma issue, um plano aprovado e a lista de arquivos do repositório.
Produza as alterações de código necessárias para cumprir o plano.

Responda APENAS com um objeto JSON válido, sem markdown, no formato:
{
  "summary": "resumo curto das alterações (1-2 linhas)",
  "files": [
    { "path": "caminho/relativo/do/arquivo", "content": "conteúdo COMPLETO do arquivo" }
  ]
}

Regras:
- "path" é sempre relativo à raiz do repositório, sem "./" e sem caminhos absolutos.
- "content" é o conteúdo final e completo do arquivo (não um diff/patch).
- Inclua apenas arquivos que precisam ser criados ou modificados.
- Mantenha o estilo e as convenções já presentes no repositório.
- Não escreva nada fora do JSON.`;

const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const responseSchema = z.object({
  summary: z.string().default(''),
  files: z.array(fileSchema).default([]),
});

export interface CodegenResult {
  summary: string;
  filesChanged: string[];
}

export interface CodegenArgs {
  llm: LlmClient;
  dir: string;
  title: string;
  description: string;
  plan: string;
  log: Logger;
}

/** Lista os arquivos rastreados pelo git para dar contexto ao modelo. */
async function listRepoFiles(dir: string): Promise<string[]> {
  const res = await runCommand('git ls-files', dir);
  if (res.exitCode !== 0) return [];
  return res.stdout.split('\n').filter(Boolean);
}

/**
 * Extrai o JSON da resposta do modelo, tolerando cercas de código (```json ... ```)
 * ou texto ao redor. Lança se não encontrar um objeto JSON.
 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('resposta do modelo não contém JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Garante que o caminho não escapa do worktree (defesa contra path traversal). */
function safeJoin(dir: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, '');
  const full = resolve(dir, normalized);
  if (full !== dir && !full.startsWith(`${dir}/`)) {
    throw new Error(`caminho de arquivo fora do worktree: ${relPath}`);
  }
  return full;
}

/**
 * Gera o código via alias `strong_coder` e aplica os arquivos no worktree (MAC-17).
 * Retorna o resumo e a lista de arquivos alterados. Lança se a geração for vazia.
 */
export async function generateAndApplyCode(args: CodegenArgs): Promise<CodegenResult> {
  const { llm, dir, title, description, plan, log } = args;

  const files = await listRepoFiles(dir);
  const fileTree = files.slice(0, 800).join('\n');

  log.info({ fileCount: files.length }, 'requesting code generation');
  const raw = await llm.complete({
    alias: 'strong_coder',
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `# Issue: ${title}`,
          description ? `\n${description}` : '',
          `\n# Plano aprovado\n${plan}`,
          `\n# Arquivos do repositório\n${fileTree}`,
        ].join('\n'),
      },
    ],
  });

  const parsed = responseSchema.parse(extractJson(raw));
  if (parsed.files.length === 0) {
    throw new Error('modelo não retornou nenhum arquivo para alterar');
  }

  const filesChanged: string[] = [];
  for (const file of parsed.files) {
    const full = safeJoin(dir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, 'utf8');
    filesChanged.push(file.path.replace(/^\/+/, ''));
  }

  log.info({ filesChanged }, 'applied generated files');
  return { summary: parsed.summary, filesChanged };
}

/** Caminho absoluto de um arquivo do worktree (exportado p/ testes futuros). */
export function worktreeFilePath(dir: string, relPath: string): string {
  return join(dir, relPath);
}
