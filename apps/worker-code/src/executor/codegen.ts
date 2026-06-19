import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { buildSkillInstructions } from './agentSkills.js';
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
- NÃO devolva comandos shell, comandos de validação, instruções de execução,
  markdown, bash, pnpm, npm, git ou texto explicativo.
- Se o plano mencionar comandos como "rtk pnpm eval", trate-os apenas como
  validação futura; eles NÃO são arquivos e NÃO pertencem à resposta.
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
- Você só pode alterar/criar os arquivos listados para ESTE lote.
- Não importe, referencie ou dependa de arquivo novo que não esteja listado em
  "Arquivos a criar neste lote" e que não exista em "Arquivos disponíveis".
  Se precisar de dados auxiliares e não houver arquivo permitido para criá-los,
  mantenha esses dados inline no arquivo que está modificando.
- "content" é o arquivo inteiro e final (não um diff/patch).
- Mantenha o estilo e as convenções já presentes no repositório (ESM, imports com .js, etc.).
- Siga os ARQUIVOS-EXEMPLO (vizinhos) e as CONVENÇÕES fornecidas: mesmo padrão de
  imports, estrutura e libs. NÃO adicione imports/dependências que os exemplos não usam.
- Inclua no array só os arquivos realmente alterados/criados.
- NÃO devolva comandos shell, instruções de execução ou passos de validação.
  A resposta deve conter arquivos completos em JSON, não comandos como "pnpm test".
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
- Não importe, referencie ou dependa de arquivo novo que não esteja listado em
  "Arquivos disponíveis". Se o erro for "Cannot find module", remova/substitua
  o import ausente usando os arquivos existentes que recebeu.
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
const MAX_GENERATE_FILES_PER_CALL = 2;
const SELECT_MAX_TOKENS = 1_500;
const GENERATE_MAX_TOKENS = 24_000;
const FIX_MAX_TOKENS = 16_000;

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
  /** Agente selecionado no Agent Registry. */
  agentKey?: string;
  /** Capacidades declarativas do agente selecionado. */
  agentCapabilities?: string[];
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

function hasJsonObjectStart(raw: string): boolean {
  const candidate = raw.trim();
  return candidate.includes('{');
}

export function buildAgentInstructions(agentKey?: string, capabilities: string[] = []): string {
  return buildSkillInstructions(agentKey, capabilities);
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
    maxTokens?: number;
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
      maxTokens: opts.maxTokens,
      jsonMode: true,
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
  if (lastRaw.trim() && hasJsonObjectStart(lastRaw)) {
    try {
      log.info('repair: re-pedindo JSON limpo');
      const repaired = await llm.complete({
        alias: 'strong_coder',
        temperature: 0,
        maxTokens: opts.maxTokens,
        jsonMode: true,
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
  } else if (lastRaw.trim()) {
    log.warn({ raw: lastRaw.slice(0, 500) }, 'repair ignorado — resposta sem objeto JSON');
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
    agentInstructions?: string;
  },
  log: Logger,
  onUsage?: (usage: TokenUsage) => void,
): Promise<{ edit: string[]; create: string[] }> {
  return completeJson(
    llm,
    {
      temperature: 0,
      maxTokens: SELECT_MAX_TOKENS,
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
            ctx.agentInstructions
              ? `\n# Instruções do agente especializado\n${ctx.agentInstructions}`
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

export function filterAllowedFiles(
  files: { path: string; content: string }[],
  allowedPaths: string[],
): { files: { path: string; content: string }[]; dropped: string[] } {
  const allowed = new Set(allowedPaths.map((path) => path.replace(/^\/+/, '')));
  const out: { path: string; content: string }[] = [];
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function formatAvailableFiles(repoFiles: string[], generatedFiles: { path: string }[]): string {
  return [...new Set([...repoFiles, ...generatedFiles.map((file) => file.path)])]
    .slice(0, 900)
    .join('\n');
}

function isDocumentationPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').toLowerCase();
  return normalized.startsWith('docs/') || normalized.endsWith('.md');
}

function issueExplicitlyRequestsDocs(title: string): boolean {
  return /\b(doc|docs|documentation|readme|runbook|documenta(?:r|ção|cao))\b/i.test(title);
}

export function filterDocumentationTargets(
  selection: { edit: string[]; create: string[] },
  ctx: { title: string; description: string },
): { selection: { edit: string[]; create: string[] }; droppedDocs: string[] } {
  if (issueExplicitlyRequestsDocs(ctx.title)) {
    return { selection, droppedDocs: [] };
  }

  const droppedDocs = [...selection.edit, ...selection.create].filter(isDocumentationPath);
  if (droppedDocs.length === 0) {
    return { selection, droppedDocs };
  }

  return {
    selection: {
      edit: selection.edit.filter((path) => !isDocumentationPath(path)),
      create: selection.create.filter((path) => !isDocumentationPath(path)),
    },
    droppedDocs,
  };
}

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

export function filterReviewCreates(
  selection: { edit: string[]; create: string[] },
  reviewFeedback?: string,
): { selection: { edit: string[]; create: string[] }; droppedCreates: string[] } {
  if (!reviewFeedback?.trim() || selection.create.length === 0) {
    return { selection, droppedCreates: [] };
  }

  return {
    selection: { edit: selection.edit, create: [] },
    droppedCreates: selection.create,
  };
}

/**
 * Gera o código via alias `strong_coder` e aplica os arquivos no worktree (MAC-17).
 *
 * Dois passos: (1) o modelo escolhe os arquivos a editar/criar; (2) injetamos o
 * conteúdo ATUAL dos arquivos a editar e pedimos a versão final — assim o modelo
 * altera de forma incremental em vez de reescrever do zero e quebrar o resto.
 */
export async function generateAndApplyCode(args: CodegenArgs): Promise<CodegenResult> {
  const {
    llm,
    dir,
    title,
    description,
    plan,
    lessons,
    reviewFeedback,
    agentKey,
    agentCapabilities,
    log,
  } = args;

  const repoFiles = await listRepoFiles(dir);
  const fileTree = repoFiles.slice(0, 800).join('\n');
  const repoSet = new Set(repoFiles);

  // Context Builder (MAC-24): convenções do projeto guiam ambos os passos.
  const conventions = await readConventions(dir, repoSet);
  const agentInstructions = buildAgentInstructions(agentKey, agentCapabilities);

  // Acumula o uso de tokens das 2 chamadas p/ estimar o custo (MAC-40).
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const addUsage = (u: TokenUsage) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };

  log.info({ fileCount: repoFiles.length }, 'selecting files to change');
  const rawSelection = await selectFiles(
    llm,
    { title, description, plan, fileTree, conventions, reviewFeedback, agentInstructions },
    log,
    addUsage,
  );
  const docsFiltered = filterDocumentationTargets(rawSelection, {
    title,
    description,
  });
  const { selection, droppedCreates } = filterReviewCreates(docsFiltered.selection, reviewFeedback);
  const droppedDocs = docsFiltered.droppedDocs;
  if (droppedDocs.length > 0) {
    log.info({ droppedDocs }, 'documentation targets ignored');
  }
  if (droppedCreates.length > 0) {
    log.info({ droppedCreates }, 'review create targets ignored');
  }
  log.info({ edit: selection.edit, create: selection.create }, 'files selected');

  const current = await readCurrentFiles(dir, repoSet, selection.edit);
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const targets = [
    ...current.map((file) => ({ kind: 'edit' as const, path: file.path })),
    ...selection.create.map((path) => ({ kind: 'create' as const, path })),
  ];

  const generatedFiles: { path: string; content: string }[] = [];
  const summaries: string[] = [];
  let prTitle = '';

  for (const [index, chunk] of chunkArray(targets, MAX_GENERATE_FILES_PER_CALL).entries()) {
    const chunkEdit = chunk.filter((target) => target.kind === 'edit').map((target) => target.path);
    const chunkCreate = chunk
      .filter((target) => target.kind === 'create')
      .map((target) => target.path);
    const currentBlock = chunkEdit
      .map((path) => {
        const file = currentByPath.get(path);
        return file ? `\n## ${file.path}\n\`\`\`\n${file.content}\n\`\`\`` : '';
      })
      .join('\n');
    const createBlock = chunkCreate.length
      ? `\n# Arquivos a criar neste lote\n${chunkCreate.join('\n')}`
      : '';
    const examples = await buildExamples(dir, repoFiles, { edit: chunkEdit, create: chunkCreate });
    const availableFiles = formatAvailableFiles(repoFiles, generatedFiles);

    log.info(
      {
        chunk: index + 1,
        totalChunks: Math.ceil(targets.length / MAX_GENERATE_FILES_PER_CALL),
        edit: chunkEdit,
        create: chunkCreate,
        hasExamples: Boolean(examples),
      },
      'requesting code generation chunk',
    );
    const parsed = await completeJson(
      llm,
      {
        temperature: 0.1,
        maxTokens: GENERATE_MAX_TOKENS,
        onUsage: addUsage,
        messages: [
          { role: 'system', content: GENERATE_PROMPT },
          {
            role: 'user',
            content: [
              `# Issue: ${title}`,
              description ? `\n${description}` : '',
              `\n# Plano aprovado\n${plan}`,
              agentInstructions
                ? `\n# Instruções do agente especializado\n${agentInstructions}`
                : '',
              conventions ? `\n# Convenções do projeto\n${conventions}` : '',
              examples ? `\n# Arquivos-exemplo (siga este padrão)${examples}` : '',
              `\n# Arquivos disponíveis para imports/referências\n${availableFiles}`,
              lessons
                ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}`
                : '',
              reviewFeedback
                ? `\n# Parecer da revisão a endereçar (corrija estes pontos, preservando o resto)\n${reviewFeedback}`
                : '',
              `\n# Conteúdo atual dos arquivos a modificar neste lote${currentBlock || '\n(nenhum)'}`,
              createBlock,
            ].join('\n'),
          },
        ],
      },
      responseSchema,
      log,
    );
    if (!prTitle && parsed.prTitle.trim()) prTitle = parsed.prTitle;
    if (parsed.summary.trim()) summaries.push(parsed.summary);
    const allowed = filterAllowedFiles(parsed.files, [...chunkEdit, ...chunkCreate]);
    if (allowed.dropped.length > 0) {
      log.warn({ droppedFiles: allowed.dropped }, 'generated files outside selected chunk ignored');
    }
    generatedFiles.push(...allowed.files);
  }

  if (generatedFiles.length === 0) {
    throw new Error('modelo não retornou nenhum arquivo para alterar');
  }

  const filesChanged = await applyFiles(dir, generatedFiles);

  const costUsd = estimateCostUsd('strong_coder', usage);
  log.info({ filesChanged, usage, costUsd }, 'applied generated files');
  return { summary: summaries.join(' '), filesChanged, prTitle, costUsd };
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
  agentKey?: string;
  agentCapabilities?: string[];
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
  const { llm, dir, filesChanged, failureTail, plan, title, agentKey, agentCapabilities, log } =
    args;
  const agentInstructions = buildAgentInstructions(agentKey, agentCapabilities);

  // Relê on-disk os arquivos tocados (recém-escritos; arquivos novos podem não
  // estar no git ls-files, então lemos direto, sem filtro de tracking).
  const current: { path: string; content: string }[] = [];
  const { fixableChangedFiles, prioritizedCandidates, fixCandidates } = buildFixCandidateFiles(
    filesChanged,
    failureTail,
  );
  log.info(
    {
      files: fixCandidates.length,
      originalFiles: filesChanged.length,
      fixableFiles: fixableChangedFiles.length,
      prioritizedCandidates,
      fixCandidates,
    },
    'selected files for fix',
  );

  for (const rel of fixCandidates) {
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
  const repoFiles = await listRepoFiles(dir);
  const availableFiles = [...new Set([...repoFiles, ...fixableChangedFiles])]
    .slice(0, 900)
    .join('\n');

  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  log.info(
    {
      files: fixCandidates.length,
      originalFiles: filesChanged.length,
      fixableFiles: fixableChangedFiles.length,
    },
    'requesting fix',
  );
  const parsed = await completeJson(
    llm,
    {
      temperature: 0.1,
      maxTokens: FIX_MAX_TOKENS,
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
            agentInstructions ? `\n# Instruções do agente especializado\n${agentInstructions}` : '',
            `\n# Arquivos disponíveis\n${availableFiles}`,
            `\n# Arquivos que você escreveu${currentBlock || '\n(nenhum)'}`,
            `\n# Saída do comando que FALHOU\n\`\`\`\n${failureTail}\n\`\`\``,
          ].join('\n'),
        },
      ],
    },
    responseSchema,
    log,
  );

  const allowed = filterAllowedFiles(parsed.files, fixCandidates);
  if (allowed.dropped.length > 0) {
    log.warn({ droppedFiles: allowed.dropped }, 'fix files outside selected candidates ignored');
  }
  const applied = await applyFiles(dir, allowed.files);
  const costUsd = estimateCostUsd('strong_coder', usage);
  log.info({ filesChanged: applied, costUsd }, 'applied fix');
  return { summary: parsed.summary, filesChanged: applied, costUsd };
}

/** Caminho absoluto de um arquivo do worktree (exportado p/ testes futuros). */
export function worktreeFilePath(dir: string, relPath: string): string {
  return join(dir, relPath);
}
