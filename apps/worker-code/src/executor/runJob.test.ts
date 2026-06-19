import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import type { Job } from '../types.js';
import {
  buildCommitMessage,
  buildLandingMediaPrompt,
  commitErrorResult,
  landingHeroAssetPathForArtifact,
  landingMediaContext,
  restoreLandingMediaAsset,
  shouldAutoGenerateLandingMedia,
  summarizeFailureTail,
} from './runJob.js';

function cmd(command: string, exitCode: number, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 1 };
}

describe('summarizeFailureTail', () => {
  it('retorna vazio quando todos os comandos passaram', () => {
    expect(summarizeFailureTail([cmd('pnpm build', 0)])).toBe('');
  });

  it('extrai o comando e o tail do stderr do primeiro que falhou', () => {
    const out = summarizeFailureTail([
      cmd('pnpm install', 0),
      cmd('pnpm build', 1, 'erro: Cannot find module X'),
      cmd('pnpm test', 1, 'não deveria aparecer'),
    ]);
    expect(out).toBe('$ pnpm build\nerro: Cannot find module X');
  });

  it('cai no stdout quando o stderr está vazio', () => {
    const out = summarizeFailureTail([cmd('pnpm test', 1, '', 'FAIL src/x.test.ts')]);
    expect(out).toBe('$ pnpm test\nFAIL src/x.test.ts');
  });

  it('inclui stderr e stdout quando ambos existem', () => {
    const out = summarizeFailureTail([
      cmd('pnpm build', 1, '[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL]', 'src/eval/scoring.ts(1,1)'),
    ]);

    expect(out).toBe('$ pnpm build\n[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL]\nsrc/eval/scoring.ts(1,1)');
  });

  it('preserva começo e fim de saídas longas', () => {
    const out = summarizeFailureTail([
      cmd(
        'pnpm build',
        1,
        `src/eval/scoring.ts(5,26): error TS2305\n${'x'.repeat(4000)}\nELIFECYCLE`,
      ),
    ]);

    expect(out).toContain('src/eval/scoring.ts(5,26): error TS2305');
    expect(out).toContain('[output truncated; keeping first and last diagnostics]');
    expect(out).toContain('ELIFECYCLE');
  });
});

describe('buildCommitMessage', () => {
  const job = {
    issueIdentifier: 'MAC-84',
    title: 'Teste descartável',
  } as Job;

  it('adiciona Ref e Co-authored-by quando coautor está configurado', () => {
    const msg = buildCommitMessage(job, 'docs(runbooks): add note', 'Resumo curto.', {
      name: 'Codex',
      email: 'noreply@openai.com',
    });

    expect(msg).toBe(
      'docs(runbooks): add note\n\nResumo curto.\n\nRef: MAC-84\nCo-authored-by: Codex <noreply@openai.com>',
    );
  });

  it('não adiciona Co-authored-by incompleto', () => {
    const msg = buildCommitMessage(job, 'docs: add note', '', { name: 'Codex' });

    expect(msg).toBe('docs: add note\n\nRef: MAC-84');
  });
});

describe('commitErrorResult', () => {
  it('transforma falha de git commit em CommandResult para auto-fix', () => {
    const result = commitErrorResult(new Error('git commit failed: pre-commit hook failed'));

    expect(result).toMatchObject({
      command: 'git commit',
      exitCode: 1,
      stdout: '',
      stderr: 'git commit failed: pre-commit hook failed',
    });
    expect(summarizeFailureTail([result])).toBe(
      '$ git commit\ngit commit failed: pre-commit hook failed',
    );
  });
});

describe('landing media integration helpers', () => {
  const landingJob = {
    runId: '00000000-0000-4000-8000-000000000000',
    issueIdentifier: 'MAC-120',
    repoUrl: 'git@example.com:repo.git',
    baseBranch: 'main',
    branch: 'agent/mac-120',
    commands: [],
    title: 'Criar landing page para clínica premium',
    description: 'Use visual forte no hero.',
    plan: 'Criar página Astro + React.',
    lessons: '',
    reviewFeedback: '',
    agentKey: 'landing-page-agent',
    agentCapabilities: ['landing-page', 'generative-media', 'higgsfield'],
  } satisfies Job;

  it('ativa mídia automática para landing-page-agent com capability Higgsfield', () => {
    expect(shouldAutoGenerateLandingMedia(landingJob)).toBe(true);
    expect(shouldAutoGenerateLandingMedia({ ...landingJob, agentCapabilities: [] })).toBe(true);
    expect(shouldAutoGenerateLandingMedia({ ...landingJob, reviewFeedback: 'ajustar' })).toBe(
      false,
    );
    expect(shouldAutoGenerateLandingMedia({ ...landingJob, agentKey: 'coder-agent' })).toBe(false);
  });

  it('gera prompt e contexto para o codegen usar asset local', () => {
    expect(buildLandingMediaPrompt(landingJob)).toContain('no text in image');
    expect(landingMediaContext()).toContain('public/generated/higgsfield-hero.jpg');
    expect(landingMediaContext()).toContain('/generated/higgsfield-hero.jpg');
    expect(landingMediaContext()).toContain('Do not create, edit, overwrite');
  });

  it('mantém a extensão real do artefato Higgsfield no caminho público', () => {
    expect(landingHeroAssetPathForArtifact('/tmp/artifacts/higgsfield-hero.png')).toBe(
      'public/generated/higgsfield-hero.png',
    );
    expect(landingHeroAssetPathForArtifact('/tmp/artifacts/higgsfield-hero.jpeg')).toBe(
      'public/generated/higgsfield-hero.jpg',
    );
  });

  it('restaura o asset binário caso o codegen sobrescreva o caminho', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'landing-media-'));
    try {
      const artifactPath = join(dir, 'artifact.jpg');
      await writeFile(artifactPath, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
      await writeFile(join(dir, 'public-generated-placeholder.txt'), 'placeholder');

      const restoredPath = await restoreLandingMediaAsset(dir, artifactPath);

      expect(restoredPath).toBe('public/generated/higgsfield-hero.jpg');
      await writeFile(join(dir, restoredPath), '');
      await restoreLandingMediaAsset(dir, artifactPath);
      await expect(readFile(join(dir, restoredPath))).resolves.toEqual(
        Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
