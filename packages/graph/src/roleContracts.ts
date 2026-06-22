import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SoftwareRole = 'planner' | 'coder' | 'critic' | 'pr' | 'reporter';

const ROLE_SKILL_BY_ROLE: Record<SoftwareRole, string> = {
  planner: 'software-planner',
  coder: 'software-coder',
  critic: 'software-critic',
  pr: 'software-pr',
  reporter: 'software-reporter',
};

function repoRootFromModule(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../..');
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? markdown.slice(match[0].length).trim() : markdown.trim();
}

export function roleSkillName(role: SoftwareRole): string {
  return ROLE_SKILL_BY_ROLE[role];
}

export function loadRoleContract(role: SoftwareRole, root = repoRootFromModule()): string {
  const skillName = roleSkillName(role);
  const path = resolve(root, `agent-skills/${skillName}/SKILL.md`);
  if (!existsSync(path)) return '';
  return stripFrontmatter(readFileSync(path, 'utf8'));
}

export function buildRoleSystemPrompt(
  role: SoftwareRole,
  basePrompt: string,
  root = repoRootFromModule(),
): string {
  const contract = loadRoleContract(role, root);
  if (!contract) return basePrompt;
  return `${basePrompt.trim()}\n\n## Role contract: ${roleSkillName(role)}\n${contract}`;
}
