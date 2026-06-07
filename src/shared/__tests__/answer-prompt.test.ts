import { describe, it, expect } from 'vitest';
import { ANSWER_SYSTEM_PROMPT, buildAnswerPrompt } from '../answer-prompt';

describe('ANSWER_SYSTEM_PROMPT', () => {
  it('is a non-trivial instruction string', () => {
    expect(ANSWER_SYSTEM_PROMPT).toBeTypeOf('string');
    expect(ANSWER_SYSTEM_PROMPT.length).toBeGreaterThan(40);
  });

  it('steers away from hallucinated links (anti-hallucination guard)', () => {
    expect(ANSWER_SYSTEM_PROMPT.toLowerCase()).toContain('never invent urls');
  });

  it('asks for plain text and brevity', () => {
    const lower = ANSWER_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('plain text');
    expect(lower).toMatch(/sentences/);
  });
});

describe('buildAnswerPrompt', () => {
  it('trims surrounding whitespace', () => {
    expect(buildAnswerPrompt('  what is tls  ')).toBe('what is tls');
  });

  it('passes through normal terms unchanged', () => {
    expect(buildAnswerPrompt('docker compose networking')).toBe('docker compose networking');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(buildAnswerPrompt('   ')).toBe('');
  });
});
