import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

const mockFetch = vi.fn();

function tagsOk(model = 'test:latest') {
  return { ok: true, json: async () => ({ models: [{ name: model }] }) };
}

const enc = (s: string) => new TextEncoder().encode(s);
const chatLine = (content: string, done = false) => JSON.stringify({ message: { content }, done });
const DONE_LINE = JSON.stringify({ message: { content: '' }, done: true });

/** Fresh streaming response (a ReadableStream is single-use, so build per call). */
function chatStream(lines: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) { controller.enqueue(enc(l + '\n')); }
      controller.close();
    },
  });
  return { ok: true, body };
}

/** Buffered response (no `body`) → exercises generateAnswer's fallback path. */
function chatBuffered(lines: string[]) {
  return { ok: true, text: async () => lines.join('\n') };
}

function chat500() {
  return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'boom' };
}

/** Route /api/tags to a tags response and /api/chat to a freshly-built response. */
function route(makeChat: () => unknown, tagsModel = 'test:latest') {
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/tags')) { return tagsOk(tagsModel); }
    return makeChat();
  });
}

describe('OllamaService.generateAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('streams tokens in order and returns the full text via /api/chat', async () => {
    route(() => chatStream([chatLine('Hello'), chatLine(' world'), DONE_LINE]));
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const tokens: string[] = [];
    const res = await svc.generateAnswer('hi', { onToken: t => tokens.push(t) });
    expect(res.success).toBe(true);
    expect(tokens).toEqual(['Hello', ' world']);
    expect(res.text).toBe('Hello world');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/chat'), expect.any(Object));
  });

  it('supports the buffered fallback when the response has no stream body', async () => {
    route(() => chatBuffered([chatLine('Buf'), chatLine('fer'), DONE_LINE]));
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const tokens: string[] = [];
    const res = await svc.generateAnswer('hi', { onToken: t => tokens.push(t) });
    expect(res.success).toBe(true);
    expect(res.text).toBe('Buffer');
    expect(tokens).toEqual(['Buf', 'fer']);
  });

  it('rejects an empty prompt without any network call', async () => {
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const res = await svc.generateAnswer('   ', { onToken: () => {} });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/empty/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns aborted and makes no request when the signal is already aborted', async () => {
    route(() => chatStream([DONE_LINE]));
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const ac = new AbortController();
    ac.abort();
    const res = await svc.generateAnswer('hi', { onToken: () => {}, abortSignal: ac.signal });
    expect(res.aborted).toBe(true);
    expect(res.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a connection failure (Ollama down) as a non-aborted error, no pre-flight /api/tags probe', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      // No probe should happen — but if the chat fetch is attempted, the port is dead.
      if (String(url).includes('/api/chat')) { throw new TypeError('Failed to fetch'); }
      return tagsOk();
    });
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const res = await svc.generateAnswer('hi', { onToken: () => {} });
    expect(res.success).toBe(false);
    expect(res.aborted).toBeFalsy();              // a real connection failure, not a timeout
    expect(res.error).toMatch(/failed to fetch/i); // -> UI maps to "is Ollama running?"
    // It went straight to /api/chat (no /api/tags gate).
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/chat'), expect.any(Object));
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/tags'), expect.anything());
  });

  it('does not pre-flight /api/tags — a reachable but cold model still streams', async () => {
    // Only /api/chat is mocked; /api/tags is intentionally NOT routed. If the
    // code probed /api/tags first this would throw; it must not.
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/chat')) { return chatStream([chatLine('warm'), DONE_LINE]); }
      throw new Error('unexpected /api/tags probe');
    });
    const { OllamaService } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    const res = await svc.generateAnswer('hi', { onToken: () => {} });
    expect(res.success).toBe(true);
    expect(res.text).toBe('warm');
  });

  it('surfaces an Ollama error line and trips the breaker after repeated real failures', async () => {
    route(() => chatStream([JSON.stringify({ error: 'model crashed' })]));
    const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    let res!: Awaited<ReturnType<typeof svc.generateAnswer>>;
    for (let i = 0; i < 3; i++) {
      res = await svc.generateAnswer('hi', { onToken: () => {} });
    }
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/model crashed/);
    expect(isCircuitBreakerOpen()).toBe(true);
  });

  it('trips the breaker after repeated HTTP failures', async () => {
    route(() => chat500());
    const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    for (let i = 0; i < 3; i++) {
      await svc.generateAnswer('hi', { onToken: () => {} });
    }
    expect(isCircuitBreakerOpen()).toBe(true);
  });

  it('does NOT trip the breaker on aborts', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/tags')) { return tagsOk(); }
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    });
    const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
    const svc = new OllamaService({ model: 'test:latest' });
    let res!: Awaited<ReturnType<typeof svc.generateAnswer>>;
    for (let i = 0; i < 3; i++) {
      res = await svc.generateAnswer('hi', { onToken: () => {} });
    }
    expect(res.aborted).toBe(true);
    expect(res.success).toBe(false);
    expect(isCircuitBreakerOpen()).toBe(false);
  });
});

describe('createOllamaAnswerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('exposes a local provider id', async () => {
    const { createOllamaAnswerProvider } = await import('../ollama-service');
    expect(createOllamaAnswerProvider().id).toBe('ollama-local');
  });
});
