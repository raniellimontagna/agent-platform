import { describe, expect, it } from 'vitest';
import {
  buildGenerationTargets,
  chunkArray,
  filterDocumentationTargets,
  filterReviewCreates,
  normalizeSelectedFiles,
} from './codegenSelection.js';

describe('codegen selection helpers', () => {
  it('drops documentation targets unless the issue explicitly requests docs', () => {
    const result = filterDocumentationTargets(
      {
        edit: ['src/index.ts', 'docs/runbooks/eval-harness.md', 'README.md'],
        create: ['src/new.ts', 'docs/new-runbook.md'],
      },
      { title: 'Eval Harness v2 para auto-merge', description: '' },
    );

    expect(result.selection).toEqual({
      edit: ['src/index.ts'],
      create: ['src/new.ts'],
    });
    expect(result.droppedDocs).toEqual([
      'docs/runbooks/eval-harness.md',
      'README.md',
      'docs/new-runbook.md',
    ]);
  });

  it('keeps documentation targets when the issue asks for docs', () => {
    const selection = { edit: ['docs/runbooks/eval-harness.md'], create: ['README.md'] };

    expect(
      filterDocumentationTargets(selection, { title: 'Documentar eval harness', description: '' }),
    ).toEqual({ selection, droppedDocs: [] });
  });

  it('removes creates during review fixes without changing edit targets', () => {
    expect(
      filterReviewCreates(
        { edit: ['src/a.ts'], create: ['src/b.ts', 'src/c.ts'] },
        'endereçar ressalvas do critic',
      ),
    ).toEqual({
      selection: { edit: ['src/a.ts'], create: [] },
      droppedCreates: ['src/b.ts', 'src/c.ts'],
    });
  });

  it('normalizes selected files for dry-run code selections without dropping code targets', () => {
    expect(
      normalizeSelectedFiles(
        { edit: ['math.js'], create: [] },
        { title: 'Worker dry-run LLM fake test', description: '' },
      ),
    ).toEqual({
      selection: { edit: ['math.js'], create: [] },
      droppedDocs: [],
      droppedCreates: [],
    });
  });

  it('builds generation targets with edits before creates', () => {
    expect(
      buildGenerationTargets(
        [
          { path: 'src/a.ts', content: 'a' },
          { path: 'src/b.ts', content: 'b' },
        ],
        ['src/c.ts'],
      ),
    ).toEqual([
      { kind: 'edit', path: 'src/a.ts' },
      { kind: 'edit', path: 'src/b.ts' },
      { kind: 'create', path: 'src/c.ts' },
    ]);
  });

  it('chunks selected targets without changing order', () => {
    expect(chunkArray(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
});
