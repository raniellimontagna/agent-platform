import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initRepo, writeFiles } from './runtime.js';
import type { EvalScenario } from './types.js';
import { commandsPassed, runWorkerDryRun } from './workerDryRun.js';

describe('runWorkerDryRun', () => {
  it('simula self-correction, commita localmente e nunca marca push', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'worker-dry-run-'));
    const artifactDir = join(workdir, 'artifacts');
    await mkdir(artifactDir);
    try {
      await writeFiles(workdir, scenario.repo.files);
      await initRepo(workdir);

      const result = await runWorkerDryRun({ scenario, workdir, artifactDir });

      expect(result.pushed).toBe(false);
      expect(result.fixAttempts).toBe(1);
      expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(result.filesChanged).toEqual(['math.js']);
      expect(result.diff).toContain('return value * 3');
      expect(commandsPassed(result.commands, scenario.commands)).toBe(true);

      const failure = await readFile(join(artifactDir, 'failure-1.txt'), 'utf8');
      expect(failure).toContain('$ node math.test.js');
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('usa generateAndApplyCode/applyFix reais com LLM fake', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'worker-dry-run-llm-'));
    const artifactDir = join(workdir, 'artifacts');
    await mkdir(artifactDir);
    try {
      await writeFiles(workdir, codegenScenario.repo.files);
      await initRepo(workdir);

      const result = await runWorkerDryRun({
        scenario: codegenScenario,
        workdir,
        artifactDir,
      });

      expect(result.pushed).toBe(false);
      expect(result.fixAttempts).toBe(1);
      expect(result.prTitle).toBe('feat(eval): add triple helper');
      expect(result.filesChanged).toEqual(['math.js']);
      expect(result.diff).toContain('return value * 3');
      expect(commandsPassed(result.commands, codegenScenario.commands)).toBe(true);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});

const scenario: EvalScenario = {
  id: 'worker-dry-run-test',
  title: 'Worker dry-run test',
  description: 'Test fixture',
  repo: {
    files: {
      'package.json': '{"type":"module"}\n',
      'math.js': 'export function double(value) {\n  return value * 2;\n}\n',
      'math.test.js':
        "import { triple } from './math.js';\nif (triple(4) !== 12) throw new Error('triple failed');\n",
    },
  },
  candidate: { files: {}, delete: [] },
  workerDryRun: {
    plan: 'Add triple.',
    branch: 'agent/eval-dry-run-test',
    prTitle: 'feat(eval): add triple',
    summary: 'Adds triple in dry-run.',
    files: [
      {
        path: 'math.js',
        content:
          'export function double(value) {\n  return value * 2;\n}\n\nexport function triple(value) {\n  return value * 2;\n}\n',
      },
    ],
    fixes: [
      {
        summary: 'Fix triple.',
        files: [
          {
            path: 'math.js',
            content:
              'export function double(value) {\n  return value * 2;\n}\n\nexport function triple(value) {\n  return value * 3;\n}\n',
          },
        ],
      },
    ],
    maxFixAttempts: 2,
  },
  commands: ['node math.test.js'],
  expected: {
    changedFiles: ['math.js'],
    forbiddenFiles: ['package.json'],
    requiredContent: [{ path: 'math.js', includes: 'return value * 3' }],
  },
};

const codegenScenario: EvalScenario = {
  id: 'worker-dry-run-llm-test',
  title: 'Worker dry-run LLM fake test',
  description: 'Test fixture',
  repo: scenario.repo,
  candidate: { files: {}, delete: [] },
  workerDryRun: {
    plan: 'Add triple.',
    branch: 'agent/eval-dry-run-llm-test',
    prTitle: 'feat(eval): add triple helper',
    summary: 'Adds triple via fake LLM.',
    files: [],
    llmResponses: [
      '{"edit":["math.js"],"create":[]}',
      '{"prTitle":"feat(eval): add triple helper","summary":"Adds triple via fake LLM.","files":[{"path":"math.js","content":"export function double(value) {\\n  return value * 2;\\n}\\n\\nexport function triple(value) {\\n  return value * 2;\\n}\\n"}]}',
      '{"summary":"Fix triple.","files":[{"path":"math.js","content":"export function double(value) {\\n  return value * 2;\\n}\\n\\nexport function triple(value) {\\n  return value * 3;\\n}\\n"}]}',
    ],
    fixes: [],
    maxFixAttempts: 2,
  },
  commands: ['node math.test.js'],
  expected: {
    changedFiles: ['math.js'],
    forbiddenFiles: ['package.json'],
    requiredContent: [{ path: 'math.js', includes: 'return value * 3' }],
  },
};
