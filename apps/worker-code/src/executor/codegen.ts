import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { buildExamples, readConventions } from './context.js';
import { runCommand } from './worktree.js';

const SELECT_PROMPT = `Você é um agente de engenharia de software.
Recebe uma issue, um plano aprovado e a lista de arquivos do repositório.
Decida quais arquivos precisam ser MODIFICADOS (já existem) e quais precisam ser CRIADOS.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "edit": ["caminhos/de/arquivos/existentes/a/modificar"],
  "create": ["caminhos/de/arquivos/novos/a/criar"]
}

Regras:
- Inclua em "edit" SÓ caminhos que aparecem na lista de arquivos do repositório.
- Seja cirúrgico: liste apenas o estritamente necessário para cumprir o plano.
- Caminhos relativos à raiz, sem "./" nem caminhos absolutos.
- Não escreva nada fora do JSON.`;

const GENERATE_PROMPT = `Você é um agente de engenharia de software que escreve código.
Recebe a issue, o plano, o conteúdo ATUAL dos arquivos a modificar e a lista de arquivos a criar.
Produza o conteúdo final de cada arquivo.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "prTitle": "Conventional Commits subject in ENGLISH (e.g. 'feat(api): add /status endpoint'), imperative, <= 72 chars",
  "summary": "resumo curto das alterações (1-2 linhas)",
  "files": [
    { "path": "caminho/relativo", "content": "conteúdo COMPLETO e final do arquivo" }
  ]
}

Regras CRÍTICAS:
- Ao MODIFICAR um arquivo existente, PRESERVE todo o código não relacionado ao plano.
  Parta do conteúdo atual fornecido e aplique APENAS as mudanças necessárias.
  NUNCA remova imports, bootstrap, handlers ou rotas que não fazem parte da tarefa.
- "content" é o arquivo inteiro e final (não um diff/patch).
- Mantenha o estilo e as convenções já presentes no repositório (ESM, imports com .js, etc.).
- Siga os ARQUIVOS-EXEMPLO (vizinhos) e as CONVENÇÕES fornecidas: mesmo padrão de
  imports, estrutura e libs. NÃO adicione imports/dependências que os exemplos não usam.
- Inclua no array só os arquivos realmente alterados/criados.
- Não escreva nada fora do JSON.`;

const FIX_PROMPT = `Você é um agente de engenharia de software corrigindo uma falha de validação.
Recebe os arquivos que você acabou de escrever e a saída do comando que FALHOU (build/test/lint).
Corrija a CAUSA do erro preservando todo o código correto.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "summary": "o que você corrigiu (1 linha)",
  "files": [ { "path": "caminho/relativo", "content": "conteúdo COMPLETO e final do arquivo corrigido" } ]
}

Regras CRÍTICAS:
- "content" é o arquivo inteiro e final (não um diff/patch).
- Inclua só os arquivos que você precisou alterar para corrigir o erro.
- NÃO adicione dependências/imports que o repositório não tem.
- Não escreva nada fora do JSON.`;

const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const selectSchema = z.object({
  edit: z.array(z.string()).default([]),
  create: z.array(z.string()).default([]),
});

const responseSchema = z.object({
  prTitle: z.string().default(''),
  summary: z.string().default(''),
  files: z.array(fileSchema).default([]),
});

/** Limites para não estourar o contexto do modelo ao injetar conteúdo. */
const MAX_EDIT_FILES = 15;
const MAX_FILE_CHARS = 20_000;

export interface CodegenResult {
  summary: string;
  filesChanged: string[];
  /** Título Conventional Commits em inglês p/ commit + PR (MAC-26). */
  prTitle: string;
  /** Custo estimado das chamadas LLM do codegen em USD (MAC-40). */
  costUsd: number;
}

export interface CodegenArgs {
  llm: LlmClient;
  dir: string;
  title: string;
  description: string;
  plan: string;
  /** Lições de runs anteriores do repo, já formatadas (MAC-23). */
  lessons?: string;
  /** Parecer do critic a endereçar na revisão incremental (MAC-59). */
  reviewFeedback?: string;
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
 * ou texto ao redor. Lança se não encontrar um objeto JSON. Exportado p/ teste.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const sample = candidate.replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(
      sample
        ? `resposta do modelo não contém JSON. Amostra: ${sample}`
        : 'resposta do modelo não contém JSON',
    );
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Chama o modelo e faz parse do JSON da resposta, com retry — o modelo às vezes
 * devolve prosa em vez de JSON limpo (flakiness). Loga a resposta crua truncada
 * na última falha para diagnóstico.
 */
export async function completeJson<S extends z.ZodTypeAny>(
  llm: LlmClient,
  opts: {
    messages: { role: 'system' | 'user'; content: string }[];
    temperature: number;
    onUsage?: (usage: TokenUsage) => void;
  },
  schema: S,
  log: Logger,
  attempts = 2,
): Promise<z.infer<S>> {
  let lastErr: unknown;
  let lastRaw = '';
  for (let i = 1; i <= attempts; i++) {
    const start = Date.now();
    log.info({ attempt: i }, 'llm call start');
    const raw = await llm.complete({
      alias: 'strong_coder',
      temperature: opts.temperature,
      messages: opts.messages,
      onUsage: opts.onUsage,
    });
    lastRaw = raw;
    log.info({ attempt: i, ms: Date.now() - start }, 'llm call done');
    try {
      return schema.parse(extractJson(raw));
    } catch (err) {
      lastErr = err;
      log.warn({ attempt: i, raw: raw.slice(0, 500) }, 'falha ao parsear JSON do modelo');
    }
  }
  // Passo de "repair" (MAC-57): o modelo às vezes devolve prosa em vez de JSON.
  // Em vez de desistir, reenvia a última resposta suja pedindo SÓ o objeto JSON.
  // Model-agnostic (qualquer combo do gateway) e só roda quando os attempts falharam.
  if (lastRaw.trim()) {
    try {
      log.info('repair: re-pedindo JSON limpo');
      const repaired = await llm.complete({
        alias: 'strong_coder',
        temperature: 0,
        onUsage: opts.onUsage,
        messages: [
          {
            role: 'system',
            content:
              'Você extrai JSON. Devolva SOMENTE o objeto JSON válido presente no texto a seguir — sem markdown, sem comentários, sem nada fora do JSON.',
          },
          { role: 'user', content: lastRaw },
        ],
      });
      return schema.parse(extractJson(repaired));
    } catch (err) {
      lastErr = err;
      log.warn('repair falhou — sem JSON parseável');
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('resposta do modelo não contém JSON');
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

/** Passo 1: o modelo escolhe quais arquivos modificar/criar. */
async function selectFiles(
  llm: LlmClient,
  ctx: {
    title: string;
    description: string;
    plan: string;
    fileTree: string;
    conventions: string;
    reviewFeedback?: string;
  },
  log: Logger,
  onUsage?: (usage: TokenUsage) => void,
): Promise<{ edit: string[]; create: string[] }> {
  return completeJson(
    llm,
    {
      temperature: 0,
      onUsage,
      messages: [
        { role: 'system', content: SELECT_PROMPT },
        {
          role: 'user',
          content: [
            `# Issue: ${ctx.title}`,
            ctx.description ? `\n${ctx.description}` : '',
            `\n# Plano aprovado\n${ctx.plan}`,
            ctx.reviewFeedback
              ? `\n# Parecer da revisão a endereçar (foque nestes pontos)\n${ctx.reviewFeedback}`
              : '',
            ctx.conventions ? `\n# Convenções do projeto\n${ctx.conventions}` : '',
            `\n# Arquivos do repositório\n${ctx.fileTree}`,
          ].join('\n'),
        },
      ],
    },
    selectSchema,
    log,
  );
}

/** Lê o conteúdo atual dos arquivos a modificar (truncado por segurança). */
async function readCurrentFiles(
  dir: string,
  repoFiles: Set<string>,
  editPaths: string[],
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
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

/** Escreve os arquivos no worktree e devolve os caminhos aplicados (DRY codegen/fix). */
async function applyFiles(
  dir: string,
  files: { path: string; content: string }[],
): Promise<string[]> {
  const applied: string[] = [];
  for (const file of files) {
    const full = safeJoin(dir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, 'utf8');
    applied.push(file.path.replace(/^\/+/, ''));
  }
  return applied;
}

/**
 * Gera o código via alias `strong_coder` e aplica os arquivos no worktree (MAC-17).
 *
 * Dois passos: (1) o modelo escolhe os arquivos a editar/criar; (2) injetamos o
 * conteúdo ATUAL dos arquivos a editar e pedimos a versão final — assim o modelo
 * altera de forma incremental em vez de reescrever do zero e quebrar o resto.
 */
export async function generateAndApplyCode(args: CodegenArgs): Promise<CodegenResult> {
  const { llm, dir, title, description, plan, lessons, reviewFeedback, log } = args;

  const repoFiles = await listRepoFiles(dir);
  const fileTree = repoFiles.slice(0, 800).join('\n');
  const repoSet = new Set(repoFiles);

  // Context Builder (MAC-24): convenções do projeto guiam ambos os passos.
  const conventions = await readConventions(dir, repoSet);

  // Acumula o uso de tokens das 2 chamadas p/ estimar o custo (MAC-40).
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const addUsage = (u: TokenUsage) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };

  log.info({ fileCount: repoFiles.length }, 'selecting files to change');
  const selection = await selectFiles(
    llm,
    { title, description, plan, fileTree, conventions, reviewFeedback },
    log,
    addUsage,
  );
  log.info({ edit: selection.edit, create: selection.create }, 'files selected');

  const current = await readCurrentFiles(dir, repoSet, selection.edit);
  const currentBlock = current
    .map((f) => `\n## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n');
  const createBlock = selection.create.length
    ? `\n# Arquivos a criar\n${selection.create.join('\n')}`
    : '';

  // Arquivos-exemplo vizinhos dos alvos a criar — o modelo espelha o padrão real.
  const examples = await buildExamples(dir, repoFiles, selection);
  log.info(
    { hasConventions: Boolean(conventions), hasExamples: Boolean(examples) },
    'context built',
  );

  log.info('requesting code generation');
  const parsed = await completeJson(
    llm,
    {
      temperature: 0.1,
      onUsage: addUsage,
      messages: [
        { role: 'system', content: GENERATE_PROMPT },
        {
          role: 'user',
          content: [
            `# Issue: ${title}`,
            description ? `\n${description}` : '',
            `\n# Plano aprovado\n${plan}`,
            conventions ? `\n# Convenções do projeto\n${conventions}` : '',
            examples ? `\n# Arquivos-exemplo (siga este padrão)${examples}` : '',
            lessons ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}` : '',
            reviewFeedback
              ? `\n# Parecer da revisão a endereçar (corrija estes pontos, preservando o resto)\n${reviewFeedback}`
              : '',
            `\n# Conteúdo atual dos arquivos a modificar${currentBlock || '\n(nenhum)'}`,
            createBlock,
          ].join('\n'),
        },
      ],
    },
    responseSchema,
    log,
  );

  if (parsed.files.length === 0) {
    throw new Error('modelo não retornou nenhum arquivo para alterar');
  }

  const filesChanged = await applyFiles(dir, parsed.files);

  const costUsd = estimateCostUsd('strong_coder', usage);
  log.info({ filesChanged, usage, costUsd }, 'applied generated files');
  return { summary: parsed.summary, filesChanged, prTitle: parsed.prTitle, costUsd };
}

export interface FixArgs {
  llm: LlmClient;
  dir: string;
  /** Arquivos que o coder tocou na geração — candidatos a corrigir. */
  filesChanged: string[];
  /** Saída do comando de validação que falhou (de summarizeFailureTail). */
  failureTail: string;
  plan: string;
  title: string;
  log: Logger;
}

export interface FixResult {
  summary: string;
  filesChanged: string[];
  costUsd: number;
}

/**
 * Self-correction (fix dirigido): após uma falha de validação, relê os arquivos
 * que o coder tocou + o erro do comando que falhou e pede a versão corrigida via
 * `strong_coder`. Reaplica no worktree. Não re-seleciona arquivos.
 */
export async function applyFix(args: FixArgs): Promise<FixResult> {
  const { llm, dir, filesChanged, failureTail, plan, title, log } = args;

  // Relê on-disk os arquivos tocados (recém-escritos; arquivos novos podem não
  // estar no git ls-files, então lemos direto, sem filtro de tracking).
  const current: { path: string; content: string }[] = [];
  for (const rel of filesChanged.slice(0, MAX_EDIT_FILES)) {
    try {
      const content = await readFile(safeJoin(dir, rel), 'utf8');
      current.push({ path: rel, content: content.slice(0, MAX_FILE_CHARS) });
    } catch {
      // arquivo sumiu entre escrita e releitura — ignora.
    }
  }
  const currentBlock = current
    .map((f) => `\n## ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n');

  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  log.info({ files: filesChanged.length }, 'requesting fix');
  const parsed = await completeJson(
    llm,
    {
      temperature: 0.1,
      onUsage: (u) => {
        usage.promptTokens += u.promptTokens;
        usage.completionTokens += u.completionTokens;
      },
      messages: [
        { role: 'system', content: FIX_PROMPT },
        {
          role: 'user',
          content: [
            `# Issue: ${title}`,
            `\n# Plano aprovado\n${plan}`,
            `\n# Arquivos que você escreveu${currentBlock || '\n(nenhum)'}`,
            `\n# Saída do comando que FALHOU\n\`\`\`\n${failureTail}\n\`\`\``,
          ].join('\n'),
        },
      ],
    },
    responseSchema,
    log,
  );

  const applied = await applyFiles(dir, parsed.files);
  const costUsd = estimateCostUsd('strong_coder', usage);
  log.info({ filesChanged: applied, costUsd }, 'applied fix');
  return { summary: parsed.summary, filesChanged: applied, costUsd };
}

/** Caminho absoluto de um arquivo do worktree (exportado p/ testes futuros). */
export function worktreeFilePath(dir: string, relPath: string): string {
  return join(dir, relPath);
}
