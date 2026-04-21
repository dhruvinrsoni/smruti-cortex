/**
 * Ollama model registry — single source of truth for model defaults, curated
 * dropdown options, and name-handling utilities used across the extension.
 *
 * Adding a new model?
 *   1. Add it to the appropriate `RECOMMENDED_*` array with size / params / ctx / dim
 *      details in the hint. Keep hints short enough to fit the select row.
 *   2. If the model is embedding-only (i.e. does NOT support `/api/generate` or
 *      `/api/chat`), add a substring to `EMBEDDING_ONLY_NAME_PATTERNS` so the
 *      keyword-expander falls back to the default generation model.
 *   3. Run `npm test` — unit tests in `__tests__/ollama-models.test.ts` will
 *      guard against most misconfigurations (missing size token, stale default,
 *      unlisted embedding-only model, etc.).
 *
 * DO NOT duplicate these literals in `settings.ts`, `popup.ts`, `popup.html`,
 * handlers, or docs — import from here instead. The doc-sync guard test
 * (`ollama-models-docs-sync.test.ts`) prevents README / skill drift.
 */

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

/**
 * Default generation model for AI keyword expansion.
 * `llama3.2:3b` — 3B params Q4, ~2.0 GB. Better expansion quality than 1b with
 * minimal latency cost on modern CPUs. Used as both the schema default
 * (`SETTINGS_SCHEMA.ollamaModel`) and the runtime fallback for embedding-only
 * configured models in `ai-keyword-expander.ts`.
 */
export const DEFAULT_GENERATION_MODEL = 'llama3.2:3b';

/**
 * Default embedding model for semantic search.
 * `mxbai-embed-large` — 334M params, 1024-dim, 512 ctx, ~670 MB. Best retrieval
 * quality among the curated embedding models; the size is a reasonable trade
 * for a one-time download that stays cached on-device. Used as the schema
 * default (`SETTINGS_SCHEMA.embeddingModel`).
 */
export const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large';

// -----------------------------------------------------------------------------
// Curated dropdown options
// -----------------------------------------------------------------------------

export interface ModelSuggestion {
  /** Exact model id users pass to `ollama pull` and the Ollama API. */
  value: string;
  /** Short dropdown hint — include size, params, and any distinguishing trait. */
  hint: string;
}

/**
 * Generation models surfaced in the popup's AI-model dropdown.
 * Ordered roughly smallest → largest; the default (`llama3.2:3b`) sits first
 * as the recommended starting point.
 */
export const RECOMMENDED_GENERATION_MODELS: ModelSuggestion[] = [
  { value: 'llama3.2:3b',  hint: '3B params Q4, ~2.0 GB · Best balance ★ (default)' },
  { value: 'llama3.2:1b',  hint: '1B params Q4, ~1.3 GB · Fastest / smallest' },
  { value: 'gemma2:2b',    hint: '2B params Q4, ~1.6 GB · Google Gemma 2' },
  { value: 'phi3:mini',    hint: '3.8B params Q4, ~2.3 GB · Microsoft Phi-3' },
  { value: 'qwen2.5:1.5b', hint: '1.5B params Q4, ~1.0 GB · Alibaba Qwen 2.5' },
  { value: 'mistral:7b',   hint: '7B params Q4, ~4.1 GB · Highest quality, slower' },
];

/**
 * Embedding models surfaced in the popup's embedding-model dropdown.
 * Hints include dimensionality and context length — both relevant to retrieval
 * quality and storage cost (dim × 8 bytes per vector row in IndexedDB).
 */
export const RECOMMENDED_EMBEDDING_MODELS: ModelSuggestion[] = [
  { value: 'mxbai-embed-large',      hint: '334M params, 1024-dim, 512 ctx, ~670 MB · Highest quality ★ (default)' },
  { value: 'nomic-embed-text',       hint: '137M params, 768-dim, 8192 ctx, ~274 MB · Long context' },
  { value: 'all-minilm',             hint: '22M params, 384-dim, 256 ctx, ~46 MB · Smallest / fastest' },
  { value: 'snowflake-arctic-embed', hint: '335M params, 1024-dim, 512 ctx, ~669 MB · Snowflake retrieval' },
];

// -----------------------------------------------------------------------------
// Embedding-only name detection
// -----------------------------------------------------------------------------

/**
 * Substrings that mark a model as embedding-only (no `/api/generate` support).
 * Matched against a canonicalized model id via case-insensitive `includes`.
 * Keep lowercase, no tags. Covers both curated embedding models and common
 * third-party embedding families so that if a user sets one of these as their
 * `ollamaModel` (generation setting) by mistake, keyword expansion still works.
 */
export const EMBEDDING_ONLY_NAME_PATTERNS: readonly string[] = [
  'embeddinggemma',
  'nomic-embed',
  'all-minilm',
  'mxbai-embed',
  'bge-',
  'snowflake-arctic-embed',
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Build an `ollama pull <model>` command for a given model id.
 * Appends `:latest` when the id has no explicit tag so copy/paste always pulls
 * a fully-qualified reference (Ollama itself accepts either form).
 */
export function getPullCommand(modelId: string): string {
  const id = modelId.includes(':') ? modelId : `${modelId}:latest`;
  return `ollama pull ${id}`;
}
