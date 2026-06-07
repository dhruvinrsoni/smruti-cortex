/**
 * NDJSON stream parsing for Ollama streaming responses (`/api/chat` and
 * `/api/generate` with `stream:true`). Pure + environment-agnostic so it can be
 * unit-tested without Chrome or a live Ollama. Used by
 * `OllamaService.generateAnswer` for inline `??` answers.
 */

export interface OllamaStreamChunk {
    /** The incremental text for this line (may be empty, e.g. the final `done` line). */
    token: string;
    /** True on the terminal line of the stream. */
    done: boolean;
    /** Set when Ollama emitted an `{ "error": "..." }` line. */
    error?: string;
}

/**
 * Parse a single NDJSON line from an Ollama stream into a chunk.
 * Supports both `/api/chat` (`message.content`) and `/api/generate` (`response`).
 * Returns `null` for blank or malformed lines so callers can skip them safely.
 */
export function parseOllamaChatStreamLine(line: string): OllamaStreamChunk | null {
    const trimmed = line.trim();
    if (!trimmed) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    const obj = parsed as {
        message?: { content?: unknown };
        response?: unknown;
        done?: unknown;
        error?: unknown;
    };
    if (typeof obj.error === 'string' && obj.error.length > 0) {
        return { token: '', done: true, error: obj.error };
    }
    const token =
        typeof obj.message?.content === 'string'
            ? obj.message.content
            : typeof obj.response === 'string'
                ? obj.response
                : '';
    return { token, done: obj.done === true };
}

/**
 * Read an NDJSON byte stream line-by-line, invoking `onChunk` for each parsed
 * line. Enforces a cumulative byte cap (mirrors OllamaService's 10 MB guard) to
 * prevent runaway responses from exhausting memory. Throws if the cap is
 * exceeded; respects upstream abort by virtue of the reader rejecting/ending.
 */
export async function streamNdjson(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (chunk: OllamaStreamChunk) => void,
    options: { maxBytes: number },
): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    let total = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        if (value) {
            total += value.byteLength;
            if (total > options.maxBytes) {
                throw new Error('Ollama response exceeded size limit');
            }
            buffer += decoder.decode(value, { stream: true });
        }
        let newlineIdx = buffer.indexOf('\n');
        while (newlineIdx !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            const chunk = parseOllamaChatStreamLine(line);
            if (chunk) {
                onChunk(chunk);
            }
            newlineIdx = buffer.indexOf('\n');
        }
    }
    const tail = buffer + decoder.decode();
    const chunk = parseOllamaChatStreamLine(tail);
    if (chunk) {
        onChunk(chunk);
    }
}
