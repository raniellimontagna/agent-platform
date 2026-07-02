import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenarios, normalizeScenarioFixture } from './scenarioLoader.js';

describe('loadScenarios', () => {
  it('loads scenario.json fixtures and returns scenarios sorted by id', async () => {
    const fixturesDir = await mkdtemp(join(tmpdir(), 'eval-fixtures-'));
    try {
      await writeScenario(fixturesDir, 'z-last', {
        schemaVersion: 2,
        scenarioId: 'z-last',
        title: 'Z scenario',
        description: 'Last scenario alphabetically.',
        repo: { files: { 'README.md': 'z\n' } },
        expected: { changedFiles: [] },
      });
      await writeScenario(fixturesDir, 'a-first', {
        version: 2,
        id: 'a-first',
        title: 'A scenario',
        description: 'First scenario alphabetically.',
        repo: { files: { 'README.md': 'a\n' } },
        expected: { changedFiles: [] },
      });
      await writeFile(join(fixturesDir, 'README.md'), 'ignored top-level file\n');

      const scenarios = await loadScenarios(fixturesDir);

      expect(scenarios.map((scenario) => scenario.id)).toEqual(['a-first', 'z-last']);
      expect(scenarios[1]?.version).toBe(2);
      expect(scenarios[1]?.repo.files).toEqual({ 'README.md': 'z\n' });
    } finally {
      await rm(fixturesDir, { recursive: true, force: true });
    }
  });
});

describe('normalizeScenarioFixture', () => {
  it('normalizes legacy fixture aliases into the canonical eval schema shape', () => {
    expect(
      normalizeScenarioFixture({
        schemaVersion: '2',
        scenarioId: 'review-recode-required',
        title: 'Review recode',
        inputs: {
          repo: {
            files: { 'README.md': 'hello\n' },
          },
          candidate: { files: { 'README.md': 'updated\n' }, delete: [] },
          workerDryRun: {
            plan: 'Update docs',
            branch: 'agent/eval-recode',
            prTitle: 'docs(eval): update docs',
            files: [],
          },
          commands: ['node smoke.test.js'],
        },
        review: {
          status: 'APROVADO COM RESSALVAS',
          action: 'recode',
        },
        expected: {
          finalVerdict: 'APROVADO COM RESSALVAS',
          autoMergeExpected: false,
          blockReason: 'manual review required',
          criticRounds: '2',
          maxCriticRounds: 3,
          commitRequiresRef: true,
          commitRequiresCoAuthoredBy: true,
          commitAuthorName: 'Ranielli Montagna',
          commitAuthorEmail: 'raniellimontagna@hotmail.com',
        },
      }),
    ).toMatchObject({
      id: 'review-recode-required',
      version: '2',
      repo: {
        files: { 'README.md': 'hello\n' },
      },
      candidate: { files: { 'README.md': 'updated\n' }, delete: [] },
      commands: ['node smoke.test.js'],
      workerDryRun: {
        plan: 'Update docs',
        branch: 'agent/eval-recode',
        prTitle: 'docs(eval): update docs',
        files: [],
      },
      expected: {
        review: {
          verdict: 'APROVADO COM RESSALVAS',
          outcome: 'recode',
        },
        autoMerge: {
          enabled: false,
          blockReason: 'manual review required',
        },
        critic: {
          rounds: 2,
          maxRounds: 3,
        },
        commit: {
          requiresRef: true,
          requiresCoAuthoredBy: true,
          authorName: 'Ranielli Montagna',
          authorEmail: 'raniellimontagna@hotmail.com',
        },
      },
    });
  });
});

async function writeScenario(
  fixturesDir: string,
  id: string,
  scenario: Record<string, unknown>,
): Promise<void> {
  const scenarioDir = join(fixturesDir, id);
  await mkdir(scenarioDir);
  await writeFile(join(scenarioDir, 'scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`);
}
