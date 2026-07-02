import { describe, expect, it } from 'vitest';
import {
  buildFixCandidateFiles,
  isTextFixablePath,
  selectFixCandidateFiles,
} from './codegenFixes.js';

describe('codegen fix helpers', () => {
  it('prioritizes files mentioned by full validation paths', () => {
    expect(
      selectFixCandidateFiles(
        ['apps/worker-code/src/eval/runEval.ts', 'apps/worker-code/src/eval/scoring.ts'],
        'apps/worker-code/src/eval/runEval.ts:42:13 - error TS2322',
      ),
    ).toEqual(['apps/worker-code/src/eval/runEval.ts']);
  });

  it('matches mentioned files by basename and package-relative suffix', () => {
    expect(
      selectFixCandidateFiles(
        ['apps/worker-code/src/eval/runEval.ts', 'apps/worker-code/src/eval/scoring.ts'],
        "src/eval/scoring.ts(224,27): error TS18048: 'command' is possibly 'undefined'.",
      ),
    ).toEqual(['apps/worker-code/src/eval/scoring.ts']);
    expect(
      selectFixCandidateFiles(
        ['apps/worker-code/src/eval/runEval.ts', 'apps/worker-code/src/eval/scoring.ts'],
        'FAIL scoring.ts > scoreEvalReport',
      ),
    ).toEqual(['apps/worker-code/src/eval/scoring.ts']);
  });

  it('keeps touched tests with the mentioned implementation file', () => {
    expect(
      selectFixCandidateFiles(
        [
          'src/components/landing-page.tsx',
          'src/data/landing-content.ts',
          'test/landing-page.test.mjs',
        ],
        'src/components/landing-page.tsx:42:7 - error TS2322',
      ),
    ).toEqual(['src/components/landing-page.tsx', 'test/landing-page.test.mjs']);
  });

  it('limits fallback candidates when the failure tail has no file signal', () => {
    const files = Array.from({ length: 10 }, (_, index) => `src/file${index}.ts`);

    expect(selectFixCandidateFiles(files, 'erro sem caminho')).toEqual(files.slice(0, 6));
  });

  it('excludes binary assets and public generated media from text fixes', () => {
    expect(isTextFixablePath('src/components/landing-page.tsx')).toBe(true);
    expect(isTextFixablePath('public/logo.png')).toBe(false);
    expect(isTextFixablePath('public/generated/higgsfield-hero.jpg')).toBe(false);
  });

  it('builds fix candidates from text-fixable files only', () => {
    const result = buildFixCandidateFiles(
      [
        'src/components/landing-page.tsx',
        'public/generated/higgsfield-hero.jpg',
        'public/logo.png',
        'test/landing-page.test.mjs',
      ],
      'src/components/landing-page.tsx:42:7 - error TS2322',
    );

    expect(result.fixableChangedFiles).toEqual([
      'src/components/landing-page.tsx',
      'test/landing-page.test.mjs',
    ]);
    expect(result.fixCandidates).toEqual([
      'src/components/landing-page.tsx',
      'test/landing-page.test.mjs',
    ]);
  });
});
