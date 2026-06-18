import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSkillInstructions, loadAgentSkillRegistry } from './agentSkills.js';

describe('agentSkills', () => {
  it('carrega o registry versionado do repo', () => {
    const registry = loadAgentSkillRegistry();

    expect(registry?.agentSkills['landing-page-agent']).toEqual([
      'landing-page-production',
      'frontend-design',
      'ui-ux-pro-max',
      'accessibility-wcag',
      'astro-react-landing',
      'seo-page',
      'biome-formatting',
      'gsap-motion',
    ]);
  });

  it('injeta skills versionadas para landing-page-agent', () => {
    const instructions = buildSkillInstructions('landing-page-agent', ['landing-page']);

    expect(instructions).toContain('Agente selecionado: landing-page-agent');
    expect(instructions).toContain('## Skill: landing-page-production');
    expect(instructions).toContain('## Skill: frontend-design');
    expect(instructions).toContain('## Skill: ui-ux-pro-max');
    expect(instructions).toContain('## Skill: accessibility-wcag');
    expect(instructions).toContain('## Skill: astro-react-landing');
    expect(instructions).toContain('## Skill: seo-page');
    expect(instructions).toContain('## Skill: biome-formatting');
    expect(instructions).toContain('## Skill: gsap-motion');
    expect(instructions).toContain('Treat this skill as the orchestrator');
    expect(instructions).toContain('Make the interface perceivable, operable');
    expect(instructions).toContain('Use product-level design judgment');
    expect(instructions).toContain('Use Astro as the page and content framework');
    expect(instructions).toContain('Treat SEO as part of the landing page implementation');
  });

  it('usa fallback especializado quando o registry não existe', async () => {
    const root = join(tmpdir(), `agent-platform-no-skills-${Date.now()}`);
    await mkdir(root, { recursive: true });

    const instructions = buildSkillInstructions('landing-page-agent', ['landing-page'], root);

    expect(instructions).toContain('landing pages prontas');
    expect(instructions).toContain('primeira tela utilizável');
  });

  it('ignora skills ausentes sem quebrar agentes genéricos', async () => {
    const root = join(tmpdir(), `agent-platform-partial-skills-${Date.now()}`);
    await mkdir(join(root, 'agent-skills'), { recursive: true });
    await writeFile(
      join(root, 'agent-skills/registry.json'),
      JSON.stringify({
        version: 1,
        agentSkills: { 'reviewer-agent': ['missing-skill'] },
        skills: [],
      }),
      'utf8',
    );

    expect(buildSkillInstructions('reviewer-agent', ['review'], root)).toBe(
      'Agente selecionado: reviewer-agent (review).',
    );
  });
});
