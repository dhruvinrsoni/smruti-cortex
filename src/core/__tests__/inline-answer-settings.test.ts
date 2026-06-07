import { describe, it, expect } from 'vitest';
import { SETTINGS_SCHEMA } from '../settings';
import { DEFAULT_ANSWER_MODEL, ANSWER_MAX_TOKENS } from '../../shared/ollama-models';

type SchemaEntry = { default: unknown; validate?: (v: unknown) => boolean };
const schema = SETTINGS_SCHEMA as Record<string, SchemaEntry>;

describe('inline ?? answer settings', () => {
  it('inlineAnswerEnabled defaults to false (opt-in, privacy-first)', () => {
    expect(schema.inlineAnswerEnabled?.default).toBe(false);
    expect(schema.inlineAnswerEnabled?.validate?.(true)).toBe(true);
    expect(schema.inlineAnswerEnabled?.validate?.('yes')).toBe(false);
  });

  it('answerModel defaults to DEFAULT_ANSWER_MODEL and rejects empty strings', () => {
    expect(schema.answerModel?.default).toBe(DEFAULT_ANSWER_MODEL);
    expect(schema.answerModel?.validate?.('llama3.2:3b')).toBe(true);
    expect(schema.answerModel?.validate?.('')).toBe(false);
    expect(schema.answerModel?.validate?.(123)).toBe(false);
  });

  it('answerMaxTokens defaults to ANSWER_MAX_TOKENS and is bounded 32–512', () => {
    expect(schema.answerMaxTokens?.default).toBe(ANSWER_MAX_TOKENS);
    expect(schema.answerMaxTokens?.validate?.(200)).toBe(true);
    expect(schema.answerMaxTokens?.validate?.(32)).toBe(true);
    expect(schema.answerMaxTokens?.validate?.(512)).toBe(true);
    expect(schema.answerMaxTokens?.validate?.(31)).toBe(false);
    expect(schema.answerMaxTokens?.validate?.(513)).toBe(false);
    expect(schema.answerMaxTokens?.validate?.('200')).toBe(false);
  });

  it('answerLoaderStyle defaults to spinner and only accepts known styles', () => {
    expect(schema.answerLoaderStyle?.default).toBe('spinner');
    for (const ok of ['spinner', 'dots', 'shimmer', 'caret']) {
      expect(schema.answerLoaderStyle?.validate?.(ok)).toBe(true);
    }
    expect(schema.answerLoaderStyle?.validate?.('fancy')).toBe(false);
    expect(schema.answerLoaderStyle?.validate?.(1)).toBe(false);
  });
});
