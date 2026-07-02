import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runScenario } from './scenarioRunner.js';
import type { EvalResult, EvalScenario } from './types.js';

describe('runScenario', () => {
  it('runs candidate fixtures, scores results, and writes result artifacts', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'eval-scenario-artifacts-'));
    try {
      const result = await runScenario(scenario, artifactDir);

      expect(result).toMatchObject({
        id: 'candidate-command-flow',
        title: 'Candidate command flow',
        passed: true,
        score: 100,
        changedFiles: ['math.js'],
        artifactDir,
      });
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]?.exitCode).toBe(0);
      expect(result.checks.every((check) => check.passed)).toBe(true);

      const stored = JSON.parse(await readFile(join(artifactDir, 'result.json'), 'utf8')) as
        | EvalResult
        | undefined;
      const diff = await readFile(join(artifactDir, 'diff.patch'), 'utf8');

      expect(stored?.id).toBe('candidate-command-flow');
      expect(stored?.changedFiles).toEqual(['math.js']);
      expect(diff).toContain('return value * 3');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});

const scenario: EvalScenario = {
  id: 'candidate-command-flow',
  title: 'Candidate command flow',
  description: 'Applies a deterministic candidate patch and runs a local command.',
  repo: {
    files: {
      'package.json': '{"type":"module"}\n',
      'math.js': 'export function triple(value) {\n  return value * 2;\n}\n',
      'math.test.js':
        "import { triple } from './math.js';\nif (triple(4) !== 12) throw new Error('triple failed');\n",
    },
  },
  candidate: {
    files: {
      'math.js': 'export function triple(value) {\n  return value * 3;\n}\n',
    },
    delete: [],
  },
  commands: ['node math.test.js'],
  expected: {
    changedFiles: ['math.js'],
    forbiddenFiles: ['package.json'],
    requiredContent: [{ path: 'math.js', includes: 'return value * 3' }],
  },
};
