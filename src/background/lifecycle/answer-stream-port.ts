/**
 * `ai-answer` port handler — streams inline `??` answers from the answer
 * provider (local Ollama) to the popup / quick-search overlay.
 *
 * Streaming needs a long-lived channel, which one-shot `sendMessage` can't do,
 * so both UI surfaces connect a dedicated `ai-answer` port. Frame protocol:
 *   UI → SW:  { type:'ANSWER_START', requestId, terms }
 *             { type:'ANSWER_CANCEL', requestId }
 *   SW → UI:  { type:'ANSWER_TOKEN', requestId, token }
 *             { type:'ANSWER_DONE', requestId }
 *             { type:'ANSWER_ERROR', requestId, reason }
 *
 * `requestId` is a per-UI monotonic counter; the UI ignores frames whose id is
 * not the latest. Cancel (rapid typing / mode change) and port disconnect both
 * abort the in-flight request. A new START supersedes any earlier in-flight one.
 */
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { safePortPost } from '../../shared/runtime-messaging';
import { buildAnswerPrompt, type AnswerProvider } from '../../shared/answer-prompt';
import { createOllamaAnswerProvider } from '../ollama-service';

const logger = Logger.forComponent('AnswerStreamPort');

export const AI_ANSWER_PORT = 'ai-answer';

export type AnswerErrorReason =
    | 'unavailable' | 'model-missing' | 'circuit-open' | 'busy' | 'warming' | 'timeout' | 'empty' | 'aborted';

/** Map a provider error string to a stable UI reason code. */
export function mapAnswerError(error: string | undefined): AnswerErrorReason {
    const e = (error || '').toLowerCase();
    if (e.includes('circuit breaker')) { return 'circuit-open'; }
    if (e.includes('in progress')) { return 'busy'; }
    if (e.includes('memory pressure')) { return 'busy'; }
    if (e.includes('empty')) { return 'empty'; }
    if (e.includes('not found')) { return 'model-missing'; }
    return 'unavailable';
}

/**
 * Attach the answer-stream protocol to a single connected port. Exported so it
 * can be unit-tested directly with a mock port + fake provider (no Chrome global).
 */
export function handleAnswerPort(port: chrome.runtime.Port, provider: AnswerProvider): void {
    const inFlight = new Map<number, AbortController>();
    /** Requests aborted by the user (CANCEL) or disconnect — stay silent on resolve. */
    const cancelled = new Set<number>();

    const cancel = (requestId: number): void => {
        const ctrl = inFlight.get(requestId);
        if (ctrl) {
            cancelled.add(requestId);
            ctrl.abort();
            inFlight.delete(requestId);
        }
    };

    port.onMessage.addListener((raw) => {
        const msg = raw as { type?: string; requestId?: number; terms?: string };
        if (!msg || typeof msg.requestId !== 'number') { return; }
        const requestId = msg.requestId;

        if (msg.type === 'ANSWER_CANCEL') {
            cancel(requestId);
            return;
        }

        if (msg.type !== 'ANSWER_START') { return; }

        // A new request supersedes any earlier in-flight ones on this port.
        for (const id of [...inFlight.keys()]) { cancel(id); }
        cancelled.delete(requestId);

        const controller = new AbortController();
        inFlight.set(requestId, controller);
        const prompt = buildAnswerPrompt(typeof msg.terms === 'string' ? msg.terms : '');

        void provider.streamAnswer(prompt, {
            abortSignal: controller.signal,
            onToken: (token) => {
                if (!cancelled.has(requestId)) {
                    safePortPost(port, { type: 'ANSWER_TOKEN', requestId, token });
                }
            },
        }).then((result) => {
            // User-cancelled or disconnected → stay silent (UI moved on / port gone).
            if (cancelled.has(requestId)) { return; }
            if (result.success) {
                safePortPost(port, { type: 'ANSWER_DONE', requestId });
            } else if (result.aborted) {
                // An internal abort that wasn't a user cancel means the generous
                // timeout fired — the model was (very) slow to warm up, NOT that
                // Ollama is down. Surface a reassuring "warming" hint, never "down".
                safePortPost(port, { type: 'ANSWER_ERROR', requestId, reason: 'warming' });
            } else {
                // Connection failure ("Failed to fetch") => genuinely unreachable;
                // "not found" => model-missing. mapAnswerError handles both.
                safePortPost(port, { type: 'ANSWER_ERROR', requestId, reason: mapAnswerError(result.error) });
            }
        }).catch(() => {
            if (!cancelled.has(requestId)) {
                safePortPost(port, { type: 'ANSWER_ERROR', requestId, reason: 'unavailable' });
            }
        }).finally(() => {
            inFlight.delete(requestId);
            cancelled.delete(requestId);
        });
    });

    port.onDisconnect.addListener(() => {
        for (const id of [...inFlight.keys()]) {
            cancelled.add(id);
            inFlight.get(id)?.abort();
        }
        inFlight.clear();
        logger.debug('onDisconnect', 'ai-answer port disconnected');
    });
}

/** Register the `ai-answer` onConnect listener. Provider is injectable for tests. */
export function setupAnswerStreamPort(opts?: { provider?: AnswerProvider }): void {
    const provider = opts?.provider ?? createOllamaAnswerProvider();
    browserAPI.runtime.onConnect.addListener((port) => {
        if (port.name === AI_ANSWER_PORT) {
            logger.debug('onConnect', 'ai-answer port connected');
            handleAnswerPort(port, provider);
        }
    });
}
