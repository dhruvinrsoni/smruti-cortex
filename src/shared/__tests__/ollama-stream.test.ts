import { describe, it, expect } from 'vitest';
import {
  parseOllamaChatStreamLine,
  streamNdjson,
  type OllamaStreamChunk,
} from '../ollama-stream';

describe('parseOllamaChatStreamLine', () => {
  it('returns null for blank lines', () => {
    expect(parseOllamaChatStreamLine('')).toBeNull();
    expect(parseOllamaChatStreamLine('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseOllamaChatStreamLine('{not json')).toBeNull();
    expect(parseOllamaChatStreamLine('42')).toBeNull();
    expect(parseOllamaChatStreamLine('null')).toBeNull();
  });

  it('extracts message.content from an /api/chat line', () => {
    const line = JSON.stringify({ message: { role: 'assistant', content: 'Hello' }, done: false });
    expect(parseOllamaChatStreamLine(line)).toEqual({ token: 'Hello', done: false });
  });

  it('extracts response from an /api/generate line', () => {
    const line = JSON.stringify({ response: 'world', done: false });
    expect(parseOllamaChatStreamLine(line)).toEqual({ token: 'world', done: false });
  });

  it('marks the terminal line done with an empty token', () => {
    const line = JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' });
    expect(parseOllamaChatStreamLine(line)).toEqual({ token: '', done: true });
  });

  it('surfaces an error line', () => {
    const line = JSON.stringify({ error: 'model not found' });
    expect(parseOllamaChatStreamLine(line)).toEqual({ token: '', done: true, error: 'model not found' });
  });

  it('treats a missing content field as an empty token', () => {
    const line = JSON.stringify({ message: { role: 'assistant' }, done: false });
    expect(parseOllamaChatStreamLine(line)).toEqual({ token: '', done: false });
  });
});

/** Build a reader from an array of byte arrays (one per `read()` call). */
function readerFromChunks(chunks: Uint8Array[]): ReadableStreamDefaultReader<Uint8Array> {
  let i = 0;
  return {
    async read() {
      if (i < chunks.length) {
        return { value: chunks[i++], done: false };
      }
      return { value: undefined, done: true };
    },
    releaseLock() {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('streamNdjson', () => {
  it('emits chunks in order across line boundaries', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'A' }, done: false }),
      JSON.stringify({ message: { content: 'B' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true }),
    ].join('\n') + '\n';
    const reader = readerFromChunks([enc(lines)]);
    const tokens: string[] = [];
    let sawDone = false;
    await streamNdjson(reader, (c) => { tokens.push(c.token); sawDone ||= c.done; }, { maxBytes: 1_000 });
    expect(tokens).toEqual(['A', 'B', '']);
    expect(sawDone).toBe(true);
  });

  it('reassembles a JSON object split across two network reads', async () => {
    const line = JSON.stringify({ message: { content: 'split' }, done: true });
    const mid = Math.floor(line.length / 2);
    const reader = readerFromChunks([enc(line.slice(0, mid)), enc(line.slice(mid))]);
    const chunks: OllamaStreamChunk[] = [];
    await streamNdjson(reader, (c) => chunks.push(c), { maxBytes: 1_000 });
    expect(chunks).toEqual([{ token: 'split', done: true }]);
  });

  it('flushes a trailing line that has no newline', async () => {
    const reader = readerFromChunks([enc(JSON.stringify({ response: 'tail', done: true }))]);
    const chunks: OllamaStreamChunk[] = [];
    await streamNdjson(reader, (c) => chunks.push(c), { maxBytes: 1_000 });
    expect(chunks).toEqual([{ token: 'tail', done: true }]);
  });

  it('throws when the cumulative byte cap is exceeded', async () => {
    const big = enc('x'.repeat(50));
    const reader = readerFromChunks([big, big, big]);
    await expect(
      streamNdjson(reader, () => {}, { maxBytes: 100 }),
    ).rejects.toThrow(/size limit/);
  });
});
