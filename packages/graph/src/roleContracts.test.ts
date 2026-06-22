import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRoleSystemPrompt } from './roleContracts.js';

describe('buildRoleSystemPrompt', () => {
  it('appends the local role contract when present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'role-contract-'));
    await mkdir(join(root, 'agent-skills/software-critic'), { recursive: true });
    await writeFile(
      join(root, 'agent-skills/software-critic/SKILL.md'),
      '---\nname: software-critic\n---\n\n# Critic Contract\nVeredito required.',
    );

    const prompt = buildRoleSystemPrompt('critic', 'Base prompt.', root);

    expect(prompt).toContain('Base prompt.');
    expect(prompt).toContain('## Role contract: software-critic');
    expect(prompt).toContain('Veredito required.');
  });

  it('returns the base prompt when the contract file is missing', () => {
    expect(buildRoleSystemPrompt('planner', 'Base only.', '/tmp/missing-root')).toBe('Base only.');
  });
});
