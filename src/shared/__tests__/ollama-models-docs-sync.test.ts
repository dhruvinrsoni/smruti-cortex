/**
 * Documentation drift guard.
 *
 * The canonical default models live in `src/shared/ollama-models.ts`. User-
 * facing docs (README, skills) tend to drift when we bump defaults. This test
 * asserts the current defaults appear verbatim in each doc file so a stale
 * doc fails CI instead of shipping.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_GENERATION_MODEL,
  DEFAULT_EMBEDDING_MODEL,
} from '../ollama-models';

const repoRoot = resolve(__dirname, '../../..');

const DOC_FILES: string[] = [
  'README.md',
  '.github/skills/settings/SKILL.md',
  '.github/skills/ai-ollama/SKILL.md',
];

function readDoc(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('docs reference current default models', () => {
  for (const rel of DOC_FILES) {
    describe(rel, () => {
      it(`mentions DEFAULT_GENERATION_MODEL (${DEFAULT_GENERATION_MODEL})`, () => {
        const contents = readDoc(rel);
        expect(
          contents,
          `Expected ${rel} to mention "${DEFAULT_GENERATION_MODEL}". If you bumped the default, update the doc.`
        ).toContain(DEFAULT_GENERATION_MODEL);
      });

      it(`mentions DEFAULT_EMBEDDING_MODEL (${DEFAULT_EMBEDDING_MODEL})`, () => {
        const contents = readDoc(rel);
        expect(
          contents,
          `Expected ${rel} to mention "${DEFAULT_EMBEDDING_MODEL}". If you bumped the default, update the doc.`
        ).toContain(DEFAULT_EMBEDDING_MODEL);
      });
    });
  }
});
