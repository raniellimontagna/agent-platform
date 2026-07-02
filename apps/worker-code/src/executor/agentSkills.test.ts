import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSkillInstructions, loadAgentSkillRegistry } from './agentSkills.js';

describe('agentSkills', () => {
  it('carrega o registry versionado do repo', () => {
    const registry = loadAgentSkillRegistry();

    expect(registry?.agentSkills['landing-page-agent']).toEqual([
      'landing-page-production',
      'landing-page-style-recipes',
      'frontend-design',
      'ui-ux-pro-max',
      'accessibility-wcag',
      'astro-react-landing',
      'seo-page',
      'biome-formatting',
      'gsap-motion',
      'higgsfield-media-generation',
    ]);
  });

  it('injeta skills versionadas para landing-page-agent', () => {
    const instructions = buildSkillInstructions('landing-page-agent', ['landing-page']);

    expect(instructions).toContain('Agente selecionado: landing-page-agent');
    expect(instructions).toContain('## Skill: landing-page-production');
    expect(instructions).toContain('## Skill: landing-page-style-recipes');
    expect(instructions).toContain('## Skill: frontend-design');
    expect(instructions).toContain('## Skill: ui-ux-pro-max');
    expect(instructions).toContain('## Skill: accessibility-wcag');
    expect(instructions).toContain('## Skill: astro-react-landing');
    expect(instructions).toContain('## Skill: seo-page');
    expect(instructions).toContain('## Skill: biome-formatting');
    expect(instructions).toContain('## Skill: gsap-motion');
    expect(instructions).toContain('## Skill: higgsfield-media-generation');
    expect(instructions).toContain('Treat this skill as the orchestrator');
    expect(instructions).toContain('Editorial Travel Magazine');
    expect(instructions).toContain('Boutique Concierge');
    expect(instructions).toContain('Make the interface perceivable, operable');
    expect(instructions).toContain('Use product-level design judgment');
    expect(instructions).toContain('Use Astro as the page and content framework');
    expect(instructions).toContain('Treat SEO as part of the landing page implementation');
    expect(instructions).toContain('Higgsfield MCP/CLI');
    expect(instructions).toContain('seedream_v5_lite');
    expect(instructions).toContain('Prefer Higgsfield models covered');
  });

  it('injeta contrato GSD para o pipeline de software', () => {
    const coder = buildSkillInstructions('coder-agent', ['typescript']);
    const pipeline = buildSkillInstructions('software-delivery-pipeline', ['role:pipeline']);

    for (const instructions of [coder, pipeline]) {
      expect(instructions).toContain('## Skill: gsd');
      expect(instructions).toContain('Git. Ship. Done.');
      expect(instructions).toContain('Discuss -> Plan -> Execute -> Verify -> Ship');
      expect(instructions).toContain('fresh-context handoff');
    }
  });

  it('mantem coder-agent como alias compativel do pipeline de software', () => {
    const registry = loadAgentSkillRegistry();

    expect(registry?.agentSkills['coder-agent']).toEqual(
      registry?.agentSkills['software-delivery-pipeline'],
    );
    expect(registry?.agentSkills['software-delivery-pipeline']).toEqual([
      'gsd',
      'software-planner',
      'software-coder',
      'software-critic',
      'software-pr',
      'software-reporter',
    ]);
  });

  it('mantem bundles especializados para landing e research', () => {
    const registry = loadAgentSkillRegistry();

    expect(registry?.agentSkills['landing-page-agent']).toEqual(
      expect.arrayContaining([
        'landing-page-production',
        'landing-page-style-recipes',
        'frontend-design',
        'higgsfield-media-generation',
      ]),
    );
    expect(registry?.agentSkills['data-collector-agent']).toEqual([
      'research-planner',
      'research-data-collection',
      'instagram-public-research',
    ]);
  });

  it('injeta skill de coleta para data-collector-agent', () => {
    const instructions = buildSkillInstructions('data-collector-agent', ['research']);

    expect(instructions).toContain('Agente selecionado: data-collector-agent');
    expect(instructions).toContain('## Skill: research-planner');
    expect(instructions).toContain('## Skill: research-data-collection');
    expect(instructions).toContain('## Skill: instagram-public-research');
    expect(instructions).toContain('safe, bounded data collection plan');
    expect(instructions).toContain('Collect useful evidence, not raw dumps');
    expect(instructions).toContain('Do not bypass paywalls');
    expect(instructions).toContain('This is a research-only skill');
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

  it('documenta coder-agent como compatibilidade e software-delivery-pipeline como identidade atual', async () => {
    const docs = await readFile('docs/runbooks/agent-skills.md', 'utf8');

    expect(docs).toContain('`coder-agent` permanece como chave compativel');
    expect(docs).toContain(
      '`software-delivery-pipeline` como identidade atual mais clara do pipeline',
    );
  });
});
