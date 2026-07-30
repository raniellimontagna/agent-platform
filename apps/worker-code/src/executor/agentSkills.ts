import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { logger } from '../logger.js';

const registrySkillSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  briefPath: z.string().min(1).optional(),
  source: z.enum(['local', 'toolkit']).default('local'),
  description: z.string().default(''),
});

const registrySchema = z.object({
  version: z.number().int().positive(),
  agentSkills: z.record(z.string(), z.array(z.string())).default({}),
  skills: z.array(registrySkillSchema).default([]),
});

export type AgentSkillRegistry = z.infer<typeof registrySchema>;

export const MAX_AGENT_SKILL_CHARS = 16_000;
const TRUNCATION_MARKER = '[skill truncada por limite de contexto]';
const FALLBACK_LANDING_PAGE_SKILL = [
  'Agente selecionado: landing-page-agent.',
  'Especialidade: criar landing pages prontas em pouco tempo, com qualidade visual e foco em conversão.',
  'Instruções específicas:',
  '- Entregue uma experiência de primeira tela utilizável, não uma página explicativa sobre como construir a LP.',
  '- Priorize hero forte, proposta de valor clara, CTA visível, prova/benefícios e seção final de conversão.',
  '- Use visual asset real ou gerado quando o stack permitir; se não houver asset, use composição visual rica com CSS/HTML sem depender de SVG decorativo genérico.',
  '- Garanta responsividade mobile/desktop, espaçamento consistente e contraste legível.',
  '- Evite paleta de uma única cor, textos genéricos, cards excessivos e elementos que se sobreponham.',
  '- Prefira componentes existentes e padrões do projeto; não adicione dependências sem necessidade.',
  '- A entrega deve estar pronta para rodar no app existente e passar validação do repo.',
].join('\n');

function repoRootFromModule(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../..');
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? markdown.slice(match[0].length).trim() : markdown.trim();
}

/**
 * Corta no ultimo limite de paragrafo (ou de linha) antes do teto, em vez de
 * partir no meio de uma frase. Mesmo orcamento, conteudo utilizavel ate o fim.
 */
function cutAtBoundary(content: string, limit: number): string {
  const head = content.slice(0, limit);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > limit / 2) return head.slice(0, paragraph).trimEnd();
  const line = head.lastIndexOf('\n');
  if (line > limit / 2) return head.slice(0, line).trimEnd();
  return head.trimEnd();
}

type TruncationResult = {
  text: string;
  droppedChars: number;
};

function truncateSkill(content: string, budget: number): TruncationResult {
  if (content.length <= budget) return { text: content, droppedChars: 0 };
  const contentBudget = Math.max(1, budget - TRUNCATION_MARKER.length - 2);
  const kept = cutAtBoundary(content, contentBudget);
  return {
    text: `${kept}\n\n${TRUNCATION_MARKER}`,
    droppedChars: content.length - kept.length,
  };
}

function requiredAt<T>(values: T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`indice de skill invalido: ${index}`);
  return value;
}

function allocateSkillBudgets(contents: string[], totalBudget: number): number[] {
  const budgets = Array.from({ length: contents.length }, () => 0);
  let remainingBudget = totalBudget;
  let pending = contents.map((_, index) => index);

  while (pending.length > 0) {
    const share = Math.floor(remainingBudget / pending.length);
    const satisfied = pending.filter((index) => requiredAt(contents, index).length <= share);
    if (satisfied.length === 0) {
      const remainder = remainingBudget % pending.length;
      pending.forEach((index, position) => {
        budgets[index] = share + (position < remainder ? 1 : 0);
      });
      break;
    }

    const satisfiedSet = new Set(satisfied);
    for (const index of satisfied) {
      budgets[index] = requiredAt(contents, index).length;
      remainingBudget -= requiredAt(budgets, index);
    }
    pending = pending.filter((index) => !satisfiedSet.has(index));
  }

  return budgets;
}

export function loadAgentSkillRegistry(root = repoRootFromModule()): AgentSkillRegistry | null {
  const registryPath = resolve(root, 'agent-skills/registry.json');
  if (!existsSync(registryPath)) return null;
  return registrySchema.parse(JSON.parse(readFileSync(registryPath, 'utf8')));
}

export function buildSkillInstructions(
  agentKey?: string,
  capabilities: string[] = [],
  root = repoRootFromModule(),
  opts: { skills?: string[] } = {},
): string {
  if (!agentKey) {
    return capabilities.length > 0
      ? `Agente selecionado: default (${capabilities.join(', ')}).`
      : '';
  }

  const registry = loadAgentSkillRegistry(root);
  const skillNames = opts.skills ?? registry?.agentSkills[agentKey] ?? [];
  const skillByName = new Map(registry?.skills.map((skill) => [skill.name, skill]) ?? []);
  const loadedSkills = skillNames.flatMap((skillName) => {
    const skill = skillByName.get(skillName);
    if (!skill) return [];
    const selectedPath =
      skill.briefPath && existsSync(resolve(root, skill.briefPath)) ? skill.briefPath : skill.path;
    const fullPath = resolve(root, selectedPath);
    if (!existsSync(fullPath)) return [];
    return [{ skill, selectedPath, content: stripFrontmatter(readFileSync(fullPath, 'utf8')) }];
  });

  const skillHeaderChars = loadedSkills.reduce(
    (total, { skill }, index) => total + `## Skill: ${skill.name}\n`.length + (index > 0 ? 2 : 0),
    0,
  );
  const contentBudget = Math.max(loadedSkills.length, MAX_AGENT_SKILL_CHARS - skillHeaderChars);
  const budgets = allocateSkillBudgets(
    loadedSkills.map(({ content }) => content),
    contentBudget,
  );
  const skillBlocks = loadedSkills.map(({ skill, selectedPath, content }, index) => {
    const budgetChars = requiredAt(budgets, index);
    const { text, droppedChars } = truncateSkill(content, budgetChars);
    const logContext = {
      agentKey,
      skill: skill.name,
      source: skill.source,
      selectedPath,
      originalChars: content.length,
      includedChars: text.length,
      droppedChars,
      budgetChars,
      totalBudgetChars: MAX_AGENT_SKILL_CHARS,
    };
    logger.info(logContext, 'skill carregada no contexto do agente');
    if (droppedChars > 0) {
      logger.warn(
        { ...logContext, limitChars: budgetChars },
        'skill truncada por limite de contexto',
      );
    }
    return `## Skill: ${skill.name}\n${text}`;
  });

  if (skillBlocks.length === 0) {
    if (agentKey === 'landing-page-agent') return FALLBACK_LANDING_PAGE_SKILL;
    return capabilities.length > 0
      ? `Agente selecionado: ${agentKey} (${capabilities.join(', ')}).`
      : '';
  }

  return [
    `Agente selecionado: ${agentKey}.`,
    capabilities.length > 0 ? `Capacidades declaradas: ${capabilities.join(', ')}.` : '',
    'Use as skills versionadas abaixo como contrato especializado para esta execução.',
    ...skillBlocks,
  ]
    .filter(Boolean)
    .join('\n\n');
}
