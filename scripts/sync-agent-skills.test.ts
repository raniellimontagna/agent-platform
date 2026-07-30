import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAgentSkills, syncAgentSkills } from './sync-agent-skills.mjs';

async function makeSource(): Promise<string> {
  const sourceDir = await mkdtemp(join(tmpdir(), 'agent-skills-source-'));
  const skills = [
    {
      name: 'alpha',
      ref: 'quality/alpha',
      path: 'skills/quality/alpha/SKILL.md',
      brief: 'skills/quality/alpha/BRIEF.md',
    },
    {
      name: 'beta',
      ref: 'research/beta',
      path: 'skills/research/beta/SKILL.md',
      brief: 'skills/research/beta/BRIEF.md',
    },
  ];

  for (const skill of skills) {
    const skillDir = join(sourceDir, 'skills', skill.ref);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), `# ${skill.name}\n\nFull ${skill.name}.\n`);
    await writeFile(join(skillDir, 'BRIEF.md'), `Brief ${skill.name}.\n`);
  }

  await writeFile(
    join(sourceDir, 'package.json'),
    `${JSON.stringify({ name: '@ranimontagna/agent-skills', version: '1.2.3' }, null, 2)}\n`,
  );
  await writeFile(
    join(sourceDir, 'skills.index.json'),
    `${JSON.stringify({ version: 1, skills }, null, 2)}\n`,
  );
  await writeFile(join(sourceDir, 'LICENSE'), 'MIT\n');
  return sourceDir;
}

describe('sync-agent-skills', () => {
  it('vendoriza o pacote e grava um lock deterministico com hashes', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'agent-platform-sync-'));
    const sourceDir = await makeSource();

    const first = await syncAgentSkills({ repoRoot, sourceDir });
    const firstLock = await readFile(join(repoRoot, 'agent-skills/vendor-lock.json'), 'utf8');
    const second = await syncAgentSkills({ repoRoot, sourceDir });
    const secondLock = await readFile(join(repoRoot, 'agent-skills/vendor-lock.json'), 'utf8');

    expect(second).toEqual(first);
    expect(secondLock).toBe(firstLock);
    expect(first.source).toEqual({ package: '@ranimontagna/agent-skills', version: '1.2.3' });
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.skills.map((skill) => skill.ref)).toEqual(['quality/alpha', 'research/beta']);
    await expect(
      readFile(
        join(repoRoot, 'agent-skills/vendor/agent-toolkit/skills/quality/alpha/BRIEF.md'),
        'utf8',
      ),
    ).resolves.toBe('Brief alpha.\n');
  });

  it('check detecta drift no vendor sem precisar da fonte', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'agent-platform-check-'));
    const sourceDir = await makeSource();
    await syncAgentSkills({ repoRoot, sourceDir });

    expect(await checkAgentSkills({ repoRoot })).toEqual({ ok: true, errors: [] });

    await writeFile(
      join(repoRoot, 'agent-skills/vendor/agent-toolkit/skills/quality/alpha/BRIEF.md'),
      'drift\n',
    );

    const result = await checkAgentSkills({ repoRoot });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('content hash');
  });

  it('check valida os hashes individuais e a identidade do pacote no lock', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'agent-platform-lock-check-'));
    const sourceDir = await makeSource();
    await syncAgentSkills({ repoRoot, sourceDir });
    const lockPath = join(repoRoot, 'agent-skills/vendor-lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.source.version = '9.9.9';
    lock.skills[0].hash = `sha256:${'0'.repeat(64)}`;
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = await checkAgentSkills({ repoRoot });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('package identity');
    expect(result.errors.join('\n')).toContain('skill hash for quality/alpha');
  });

  it('check com fonte detecta pacote upstream diferente do lock', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'agent-platform-upstream-check-'));
    const sourceDir = await makeSource();
    await syncAgentSkills({ repoRoot, sourceDir });
    await writeFile(join(sourceDir, 'skills/quality/alpha/BRIEF.md'), 'new upstream\n');

    const result = await checkAgentSkills({ repoRoot, sourceDir });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('source content hash');
  });

  it('falha antes da troca atomica e preserva o vendor anterior quando a fonte e invalida', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'agent-platform-atomic-'));
    const sourceDir = await makeSource();
    await syncAgentSkills({ repoRoot, sourceDir });
    const vendoredFile = join(
      repoRoot,
      'agent-skills/vendor/agent-toolkit/skills/quality/alpha/BRIEF.md',
    );
    const before = await readFile(vendoredFile, 'utf8');
    await writeFile(join(sourceDir, 'skills.index.json'), '{ invalid');

    await expect(syncAgentSkills({ repoRoot, sourceDir })).rejects.toThrow();
    await expect(readFile(vendoredFile, 'utf8')).resolves.toBe(before);
  });
});
