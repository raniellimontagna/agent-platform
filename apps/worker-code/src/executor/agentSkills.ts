import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { logger } from '../logger.js';

const registrySkillSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().default(''),
});

const registrySchema = z.object({
  version: z.number().int().positive(),
  agentSkills: z.record(z.string(), z.array(z.string())).default({}),
  skills: z.array(registrySkillSchema).default([]),
});

export type AgentSkillRegistry = z.infer<typeof registrySchema>;

const MAX_SKILL_CHARS = 4_000;
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
function cutAtBoundary(content: string): string {
  const head = content.slice(0, MAX_SKILL_CHARS);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > MAX_SKILL_CHARS / 2) return head.slice(0, paragraph).trimEnd();
  const line = head.lastIndexOf('\n');
  if (line > MAX_SKILL_CHARS / 2) return head.slice(0, line).trimEnd();
  return head.trimEnd();
}

type TruncationResult = {
  text: string;
  droppedChars: number;
};

function truncateSkill(content: string): TruncationResult {
  if (content.length <= MAX_SKILL_CHARS) return { text: content, droppedChars: 0 };
  const text = cutAtBoundary(content);
  return {
    text: `${text}\n\n[skill truncada por limite de contexto]`,
    droppedChars: content.length - text.length,
  };
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
  const skillBlocks = skillNames.flatMap((skillName) => {
    const skill = skillByName.get(skillName);
    if (!skill) return [];
    const fullPath = resolve(root, skill.path);
    if (!existsSync(fullPath)) return [];
    const full = stripFrontmatter(readFileSync(fullPath, 'utf8'));
    const { text, droppedChars } = truncateSkill(full);
    if (droppedChars > 0) {
      logger.warn(
        {
          agentKey,
          skill: skill.name,
          originalChars: full.length,
          limitChars: MAX_SKILL_CHARS,
          droppedChars,
        },
        'skill truncada por limite de contexto',
      );
    }
    return [`## Skill: ${skill.name}\n${text}`];
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
