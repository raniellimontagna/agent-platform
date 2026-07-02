import type { LlmClient, TokenUsage } from '@agent-platform/llm';
import type { Logger } from 'pino';
import type { CodegenFile } from './codegenFiles.js';
import { completeJson, selectSchema } from './codegenJson.js';
import { SELECT_PROMPT } from './codegenPrompts.js';

export interface FileSelection {
  edit: string[];
  create: string[];
}

export interface GenerationTarget {
  kind: 'edit' | 'create';
  path: string;
}

export const MAX_GENERATE_FILES_PER_CALL = 2;
const SELECT_MAX_TOKENS = 1_500;

/** Passo 1: o modelo escolhe quais arquivos modificar/criar. */
export async function selectFiles(
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
): Promise<FileSelection> {
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

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isDocumentationPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').toLowerCase();
  return normalized.startsWith('docs/') || normalized.endsWith('.md');
}

function issueExplicitlyRequestsDocs(title: string): boolean {
  return /\b(doc|docs|documentation|readme|runbook|documenta(?:r|ção|cao))\b/i.test(title);
}

export function filterDocumentationTargets(
  selection: FileSelection,
  ctx: { title: string; description: string },
): { selection: FileSelection; droppedDocs: string[] } {
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

export function filterReviewCreates(
  selection: FileSelection,
  reviewFeedback?: string,
): { selection: FileSelection; droppedCreates: string[] } {
  if (!reviewFeedback?.trim() || selection.create.length === 0) {
    return { selection, droppedCreates: [] };
  }

  return {
    selection: { edit: selection.edit, create: [] },
    droppedCreates: selection.create,
  };
}

export function normalizeSelectedFiles(
  rawSelection: FileSelection,
  ctx: { title: string; description: string },
  reviewFeedback?: string,
): { selection: FileSelection; droppedDocs: string[]; droppedCreates: string[] } {
  const docsFiltered = filterDocumentationTargets(rawSelection, ctx);
  const reviewFiltered = filterReviewCreates(docsFiltered.selection, reviewFeedback);
  return {
    selection: reviewFiltered.selection,
    droppedDocs: docsFiltered.droppedDocs,
    droppedCreates: reviewFiltered.droppedCreates,
  };
}

export function buildGenerationTargets(
  current: Pick<CodegenFile, 'path'>[],
  createPaths: string[],
): GenerationTarget[] {
  return [
    ...current.map((file) => ({ kind: 'edit' as const, path: file.path })),
    ...createPaths.map((path) => ({ kind: 'create' as const, path })),
  ];
}
