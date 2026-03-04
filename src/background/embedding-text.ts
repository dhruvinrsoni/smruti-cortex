/**
 * Embedding Text Builder — shared utility for constructing clean, bounded text
 * for Ollama embedding generation.
 *
 * Cleans URLs (strips query params, fragments, tracking garbage),
 * truncates each component, and enforces a total character limit.
 * Used by all embedding generation paths (indexing, search-engine, embedding-scorer).
 */

// Conservative limit — safe for models with 512-8192 token contexts
// ~2000 chars ≈ ~500 tokens (safe for smallest embedding models like mxbai-embed-large)
const MAX_EMBEDDING_TEXT_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_URL_LENGTH = 300;

// URL schemes that have no semantic value for embeddings
const SKIP_URL_SCHEMES = ['chrome://', 'chrome-extension://', 'about:', 'data:', 'blob:', 'javascript:'];

/**
 * Build clean, bounded text for embedding generation.
 *
 * - Strips query params and fragments from URLs (OAuth tokens, UTM, tracking = noise)
 * - Truncates each component (title, description, URL) independently
 * - Enforces a total character limit as a safety net
 * - Returns title-only for non-HTTP URLs (chrome://, data:, etc.)
 */
export function buildEmbeddingText(item: {
    title: string;
    metaDescription?: string;
    url: string;
}): string {
    const title = (item.title || '').substring(0, MAX_TITLE_LENGTH).trim();
    const description = (item.metaDescription || '').substring(0, MAX_DESCRIPTION_LENGTH).trim();
    const cleanedUrl = cleanUrlForEmbedding(item.url);

    const parts = [title, description, cleanedUrl].filter(Boolean);
    const text = parts.join(' ');

    // Final safety net — hard cap
    return text.substring(0, MAX_EMBEDDING_TEXT_LENGTH);
}

/**
 * Strip query parameters, fragments, and tracking garbage from URLs.
 * Keep only the meaningful parts: scheme + host + path.
 * Returns empty string for non-HTTP URLs (chrome://, data:, etc.)
 */
function cleanUrlForEmbedding(url: string): string {
    if (!url) return '';

    // Skip non-HTTP URLs — they have no semantic value for embeddings
    const lowerUrl = url.toLowerCase();
    if (SKIP_URL_SCHEMES.some(scheme => lowerUrl.startsWith(scheme))) {
        return '';
    }

    try {
        const parsed = new URL(url);
        // Keep: scheme + host + pathname (the meaningful parts)
        // Drop: search params, fragments (OAuth tokens, UTM, tracking, etc.)
        const clean = `${parsed.origin}${parsed.pathname}`;
        return clean.substring(0, MAX_URL_LENGTH);
    } catch {
        // If URL parsing fails, just truncate the raw URL
        return url.substring(0, MAX_URL_LENGTH);
    }
}
