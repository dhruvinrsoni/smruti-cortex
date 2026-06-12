/**
 * Prompt construction + provider seam for inline `??` AI answers.
 *
 * v1 ships exactly one provider — local Ollama (see `OllamaAnswerProvider` in
 * `src/background/ollama-service.ts`). A future online provider (e.g. DuckDuckGo
 * Instant Answer / Wikipedia summary) would implement {@link AnswerProvider} and
 * register itself. NOTE: any remote provider requires new manifest
 * `host_permissions` AND a privacy-policy review — which is exactly why online
 * answers are deferred. The local path adds no network destinations.
 */

/** System prompt steering the model toward a short, plain-text, no-hallucinated-links answer. */
export const ANSWER_SYSTEM_PROMPT =
    'You are a concise answer assistant inside a browser extension. ' +
    "Answer the user's query directly in 2-4 short sentences. " +
    'Use plain text only — no markdown, code fences, bullet lists, or headings. ' +
    'If the query needs live or current data you cannot know, say so briefly. ' +
    'Never invent URLs, links, or citations.';

/**
 * Build the user prompt for an inline answer from the parsed `??` search terms.
 * A seam for future framing (context injection, locale, etc.); today it just
 * normalizes whitespace.
 */
export function buildAnswerPrompt(terms: string): string {
    return terms.trim();
}

/** Options for a streaming answer request, shared between UI types and providers. */
export interface AnswerStreamOptions {
    onToken: (token: string) => void;
    abortSignal?: AbortSignal;
    /** Override model id; when omitted the provider resolves it (e.g. the `answerModel` setting). */
    model?: string;
    /** Output token cap (`options.num_predict`); provider default applies when omitted. */
    maxTokens?: number;
    timeoutMs?: number;
    /** Foreground priority: wait up to this many ms for the Ollama slot (vs failing instantly). */
    waitForSlotMs?: number;
}

/** Result of a streaming answer request. */
export interface AnswerStreamResult {
    /** Full accumulated answer text. */
    text: string;
    success: boolean;
    durationMs: number;
    error?: string;
    aborted?: boolean;
}

/**
 * A pluggable source of inline answers. Implemented once (Ollama) in v1; the
 * interface is the deferral seam for online providers.
 */
export interface AnswerProvider {
    readonly id: string;
    isAvailable(): Promise<boolean>;
    streamAnswer(prompt: string, opts: AnswerStreamOptions): Promise<AnswerStreamResult>;
}
