import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  applyFiles,
  filterAllowedFiles,
  formatAvailableFiles,
  listRepoFiles,
  readCurrentFiles,
  readWorktreeFiles,
} from './codegenFiles.js';
import { buildFixCandidateFiles } from './codegenFixes.js';
import { completeJson, responseSchema } from './codegenJson.js';
import {
  FIX_PROMPT,
  GENERATE_PROMPT,
  PATCH_PROMPT,
  buildCoderInstructions,
} from './codegenPrompts.js';
import {
  MAX_GENERATE_FILES_PER_CALL,
  buildGenerationTargets,
  chunkArray,
  normalizeSelectedFiles,
  selectFiles,
} from './codegenSelection.js';
import { buildExamples, readConventions } from './context.js';

export {
  buildFixCandidateFiles,
  isTextFixablePath,
  selectFixCandidateFiles,
} from './codegenFixes.js';
export {
  applyFiles,
  filterAllowedFiles,
  formatAvailableFiles,
  listRepoFiles,
  readCurrentFiles,
  readWorktreeFiles,
  safeJoin,
  worktreeFilePath,
} from './codegenFiles.js';
export {
  completeJson,
  extractJson,
  fileSchema,
  responseSchema,
  selectSchema,
} from './codegenJson.js';
export {
  buildAgentInstructions,
  buildCoderInstructions,
  FIX_PROMPT,
  GENERATE_PROMPT,
  PATCH_PROMPT,
  SELECT_PROMPT,
} from './codegenPrompts.js';
export {
  buildGenerationTargets,
  chunkArray,
  filterDocumentationTargets,
  filterReviewCreates,
  MAX_GENERATE_FILES_PER_CALL,
  normalizeSelectedFiles,
  selectFiles,
} from './codegenSelection.js';

const GENERATE_MAX_TOKENS = 24_000;
const FIX_MAX_TOKENS = 16_000;
const PATCH_MAX_TOKENS = 8_000;

const patchSchema = z.object({
  prTitle: z.string().default(''),
  summary: z.string().default(''),
  patches: z
    .array(
      z.object({
        path: z.string().min(1),
        search: z.string().min(1),
        replace: z.string(),
      }),
    )
    .default([]),
});

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

function applySearchReplacePatches(
  currentByPath: Map<string, { path: string; content: string }>,
  allowedPaths: string[],
  patches: z.infer<typeof patchSchema>['patches'],
): { files: { path: string; content: string }[]; dropped: string[] } {
  const allowed = new Set(allowedPaths.map((path) => path.replace(/^\/+/, '')));
  const contentByPath = new Map(
    [...currentByPath.entries()].map(([path, file]) => [path, file.content]),
  );
  const touched = new Set<string>();
  const dropped: string[] = [];

  for (const patch of patches) {
    const path = patch.path.replace(/^\/+/, '');
    if (!allowed.has(path)) {
      dropped.push(path);
      continue;
    }

    const current = contentByPath.get(path);
    if (current === undefined) {
      throw new Error(`patch para arquivo não carregado: ${path}`);
    }

    const first = current.indexOf(patch.search);
    if (first === -1) {
      throw new Error(`patch search não encontrado em ${path}`);
    }
    if (current.indexOf(patch.search, first + patch.search.length) !== -1) {
      throw new Error(`patch search ambíguo em ${path}`);
    }

    contentByPath.set(
      path,
      `${current.slice(0, first)}${patch.replace}${current.slice(first + patch.search.length)}`,
    );
    touched.add(path);
  }

  return {
    files: [...touched].map((path) => ({ path, content: contentByPath.get(path) ?? '' })),
    dropped,
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
  const agentInstructions = buildCoderInstructions(agentKey, agentCapabilities);

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
  const { selection, droppedDocs, droppedCreates } = normalizeSelectedFiles(
    rawSelection,
    { title, description },
    reviewFeedback,
  );
  if (droppedDocs.length > 0) {
    log.info({ droppedDocs }, 'documentation targets ignored');
  }
  if (droppedCreates.length > 0) {
    log.info({ droppedCreates }, 'review create targets ignored');
  }
  log.info({ edit: selection.edit, create: selection.create }, 'files selected');

  const current = await readCurrentFiles(dir, repoSet, selection.edit);
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const targets = buildGenerationTargets(current, selection.create);

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
    const generationMessages = [
      { role: 'system' as const, content: GENERATE_PROMPT },
      {
        role: 'user' as const,
        content: [
          `# Issue: ${title}`,
          description ? `\n${description}` : '',
          `\n# Plano aprovado\n${plan}`,
          agentInstructions ? `\n# Instruções do agente especializado\n${agentInstructions}` : '',
          conventions ? `\n# Convenções do projeto\n${conventions}` : '',
          examples ? `\n# Arquivos-exemplo (siga este padrão)${examples}` : '',
          `\n# Arquivos disponíveis para imports/referências\n${availableFiles}`,
          lessons ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}` : '',
          reviewFeedback
            ? `\n# Parecer da revisão a endereçar (corrija estes pontos, preservando o resto)\n${reviewFeedback}`
            : '',
          `\n# Conteúdo atual dos arquivos a modificar neste lote${currentBlock || '\n(nenhum)'}`,
          createBlock,
        ].join('\n'),
      },
    ];

    let parsed: z.infer<typeof responseSchema>;
    try {
      parsed = await completeJson(
        llm,
        {
          temperature: 0.1,
          maxTokens: GENERATE_MAX_TOKENS,
          onUsage: addUsage,
          messages: generationMessages,
        },
        responseSchema,
        log,
      );
    } catch (err) {
      if (chunkEdit.length === 0 || chunkCreate.length > 0) {
        throw err;
      }

      log.warn({ err, edit: chunkEdit }, 'full-file generation failed; trying patch fallback');
      const patchResult = await completeJson(
        llm,
        {
          temperature: 0.1,
          maxTokens: PATCH_MAX_TOKENS,
          onUsage: addUsage,
          messages: [
            { role: 'system', content: PATCH_PROMPT },
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
                `\n# Arquivos disponíveis para imports/referências\n${availableFiles}`,
                lessons
                  ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}`
                  : '',
                reviewFeedback
                  ? `\n# Parecer da revisão a endereçar (corrija estes pontos, preservando o resto)\n${reviewFeedback}`
                  : '',
                `\n# Conteúdo atual dos arquivos a modificar neste lote${currentBlock}`,
              ].join('\n'),
            },
          ],
        },
        patchSchema,
        log,
      );

      if (!prTitle && patchResult.prTitle.trim()) prTitle = patchResult.prTitle;
      if (patchResult.summary.trim()) summaries.push(patchResult.summary);
      const patched = applySearchReplacePatches(currentByPath, chunkEdit, patchResult.patches);
      if (patched.dropped.length > 0) {
        log.warn({ droppedFiles: patched.dropped }, 'patch files outside selected chunk ignored');
      }
      generatedFiles.push(...patched.files);
      continue;
    }
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
  const agentInstructions = buildCoderInstructions(agentKey, agentCapabilities);

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

  // Relê on-disk os arquivos tocados (recém-escritos; arquivos novos podem não
  // estar no git ls-files, então lemos direto, sem filtro de tracking).
  const current = await readWorktreeFiles(dir, fixCandidates);
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
