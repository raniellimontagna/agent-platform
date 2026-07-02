import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyFiles,
  filterAllowedFiles,
  formatAvailableFiles,
  readCurrentFiles,
  safeJoin,
  worktreeFilePath,
} from './codegenFiles.js';

describe('codegen file helpers', () => {
  it('keeps worktree paths inside the root and rejects traversal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codegen-files-'));
    try {
      expect(safeJoin(dir, 'src/index.ts')).toBe(join(dir, 'src/index.ts'));
      expect(() => safeJoin(dir, '../outside.ts')).toThrow(
        'caminho de arquivo fora do worktree: ../outside.ts',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes nested files and returns normalized relative paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codegen-apply-'));
    try {
      const applied = await applyFiles(dir, [
        { path: '/src/index.ts', content: 'export const value = 1;\n' },
      ]);

      expect(applied).toEqual(['src/index.ts']);
      await expect(readFile(join(dir, 'src/index.ts'), 'utf8')).resolves.toBe(
        'export const value = 1;\n',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('only reads tracked edit paths and truncates current file content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codegen-current-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/a.ts'), 'a'.repeat(20_050), 'utf8');
      await writeFile(join(dir, 'src/untracked.ts'), 'skip me', 'utf8');

      const current = await readCurrentFiles(
        dir,
        new Set(['src/a.ts']),
        ['src/a.ts', 'src/untracked.ts'],
      );

      expect(current).toEqual([{ path: 'src/a.ts', content: 'a'.repeat(20_000) }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps generated files visible for later generation chunks', () => {
    expect(
      formatAvailableFiles(
        ['src/a.ts', 'src/b.ts'],
        [
          { path: 'src/generated.ts' },
          { path: 'src/a.ts' },
        ],
      ),
    ).toBe(['src/a.ts', 'src/b.ts', 'src/generated.ts'].join('\n'));
  });

  it('keeps only files explicitly allowed for a generation chunk', () => {
    const result = filterAllowedFiles(
      [
        { path: 'src/a.ts', content: 'a' },
        { path: '/src/b.ts', content: 'b' },
        { path: 'tests/generated.test.ts', content: 'test' },
      ],
      ['src/a.ts', 'src/b.ts'],
    );

    expect(result.files).toEqual([
      { path: 'src/a.ts', content: 'a' },
      { path: 'src/b.ts', content: 'b' },
    ]);
    expect(result.dropped).toEqual(['tests/generated.test.ts']);
  });

  it('preserves the public worktree path helper contract', () => {
    expect(worktreeFilePath('/repo', 'src/index.ts')).toBe('/repo/src/index.ts');
  });
});
