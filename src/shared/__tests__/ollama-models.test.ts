import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GENERATION_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  RECOMMENDED_GENERATION_MODELS,
  RECOMMENDED_EMBEDDING_MODELS,
  EMBEDDING_ONLY_NAME_PATTERNS,
  getPullCommand,
} from '../ollama-models';

describe('ollama-models defaults', () => {
  it('exposes a non-empty generation default', () => {
    expect(DEFAULT_GENERATION_MODEL).toBeTypeOf('string');
    expect(DEFAULT_GENERATION_MODEL.length).toBeGreaterThan(0);
  });

  it('exposes a non-empty embedding default', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBeTypeOf('string');
    expect(DEFAULT_EMBEDDING_MODEL.length).toBeGreaterThan(0);
  });

  it('includes the generation default in its recommended list', () => {
    const values = RECOMMENDED_GENERATION_MODELS.map(m => m.value);
    expect(values).toContain(DEFAULT_GENERATION_MODEL);
  });

  it('includes the embedding default in its recommended list', () => {
    const values = RECOMMENDED_EMBEDDING_MODELS.map(m => m.value);
    expect(values).toContain(DEFAULT_EMBEDDING_MODEL);
  });
});

describe('RECOMMENDED_* hints', () => {
  const sizeRegex = /\b\d+(\.\d+)?\s?(MB|GB)\b/i;

  it('every generation model hint contains a size token (MB/GB)', () => {
    for (const m of RECOMMENDED_GENERATION_MODELS) {
      expect(m.hint, `hint for ${m.value}`).toMatch(sizeRegex);
    }
  });

  it('every embedding model hint contains a size token (MB/GB)', () => {
    for (const m of RECOMMENDED_EMBEDDING_MODELS) {
      expect(m.hint, `hint for ${m.value}`).toMatch(sizeRegex);
    }
  });

  it('every embedding model hint mentions dimensionality', () => {
    for (const m of RECOMMENDED_EMBEDDING_MODELS) {
      expect(m.hint, `hint for ${m.value}`).toMatch(/\d+-dim/);
    }
  });
});

describe('EMBEDDING_ONLY_NAME_PATTERNS', () => {
  it('covers every recommended embedding model via case-insensitive substring', () => {
    for (const m of RECOMMENDED_EMBEDDING_MODELS) {
      const name = m.value.toLowerCase();
      const matched = EMBEDDING_ONLY_NAME_PATTERNS.some(p => name.includes(p.toLowerCase()));
      expect(matched, `embedding model "${m.value}" is not covered by EMBEDDING_ONLY_NAME_PATTERNS`).toBe(true);
    }
  });

  it('does not accidentally match any recommended generation model', () => {
    for (const m of RECOMMENDED_GENERATION_MODELS) {
      const name = m.value.toLowerCase();
      const matched = EMBEDDING_ONLY_NAME_PATTERNS.some(p => name.includes(p.toLowerCase()));
      expect(matched, `generation model "${m.value}" unexpectedly matched embedding-only pattern`).toBe(false);
    }
  });
});

describe('getPullCommand', () => {
  it('appends :latest when tag is missing', () => {
    expect(getPullCommand('mxbai-embed-large')).toBe('ollama pull mxbai-embed-large:latest');
  });

  it('preserves an explicit tag', () => {
    expect(getPullCommand('llama3.2:3b')).toBe('ollama pull llama3.2:3b');
  });

  it('preserves a :latest tag without double-appending', () => {
    expect(getPullCommand('nomic-embed-text:latest')).toBe('ollama pull nomic-embed-text:latest');
  });

  it('works with the current default embedding model', () => {
    const cmd = getPullCommand(DEFAULT_EMBEDDING_MODEL);
    expect(cmd.startsWith('ollama pull ')).toBe(true);
    expect(cmd).toContain(DEFAULT_EMBEDDING_MODEL);
  });

  it('works with the current default generation model', () => {
    const cmd = getPullCommand(DEFAULT_GENERATION_MODEL);
    expect(cmd.startsWith('ollama pull ')).toBe(true);
    expect(cmd).toContain(DEFAULT_GENERATION_MODEL);
  });
});
