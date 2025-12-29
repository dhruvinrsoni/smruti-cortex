/**
 * AI Keyword Expander - Prompt-based query expansion using local Ollama
 * 
 * This is a BETTER approach than embeddings for local AI search:
 * 1. ONE LLM call to expand query → synonyms/related terms
 * 2. Fast keyword matching using expanded set
 * 3. No 600+ embedding generations (the embedding approach is fundamentally flawed)
 * 
 * Example: "war" → ["war", "fight", "battle", "combat", "conflict", "military"]
 * Then normal keyword matching finds URLs containing any of these terms.
 * 
 * === PRIVACY ===
 * All processing is LOCAL via Ollama. No external API calls.
 */

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';

const COMPONENT = 'AIKeywordExpander';
const logger = Logger.forComponent(COMPONENT);

// Cache expanded keywords to avoid repeated LLM calls for same query
const expansionCache = new Map<string, { keywords: string[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Response format we expect from the LLM (strict JSON)
 */
interface KeywordExpansionResponse {
  original: string[];
  expanded: string[];
}

/**
 * Expand query keywords using local LLM prompting
 * 
 * @param query - The user's search query
 * @returns Array of expanded keywords (original + synonyms/related terms)
 */
export async function expandQueryKeywords(query: string): Promise<string[]> {
  const normalizedQuery = query.trim().toLowerCase();
  
  if (!normalizedQuery) {
    return [];
  }

  // Check cache first
  const cached = expansionCache.get(normalizedQuery);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('expandQueryKeywords', '📦 Cache hit for query', { 
      query: normalizedQuery, 
      cachedKeywords: cached.keywords.length 
    });
    return cached.keywords;
  }

  // Get Ollama settings
  await SettingsManager.init();
  const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
  
  if (!ollamaEnabled) {
    logger.trace('expandQueryKeywords', 'AI disabled, returning original tokens');
    return normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  }

  const endpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
  const model = SettingsManager.getSetting('ollamaModel') || 'embeddinggemma:300m';
  const timeout = SettingsManager.getSetting('ollamaTimeout') || 30000;

  // We need a chat/generate capable model, not just embeddings
  // Check if we have a generation model configured, otherwise use llama3.2:1b as default
  // embeddinggemma can only do embeddings, not text generation
  const generationModel = getGenerationModel(model);
  
  logger.info('expandQueryKeywords', `🤖 Expanding keywords for: "${normalizedQuery}"`, {
    generationModel,
    endpoint
  });

  try {
    const expandedKeywords = await callOllamaForKeywords(endpoint, generationModel, normalizedQuery, timeout);
    
    // Cache the result
    expansionCache.set(normalizedQuery, {
      keywords: expandedKeywords,
      timestamp: Date.now()
    });

    logger.info('expandQueryKeywords', `✅ Expanded "${normalizedQuery}" → ${expandedKeywords.length} keywords`, {
      sample: expandedKeywords.slice(0, 10)
    });

    return expandedKeywords;
  } catch (error) {
    logger.warn('expandQueryKeywords', `❌ Expansion failed, using original query`, { error });
    // Fallback to original query tokens
    return normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  }
}

/**
 * Determine appropriate generation model based on configured model
 * Embedding-only models (like embeddinggemma) can't do text generation
 */
function getGenerationModel(configuredModel: string): string {
  // Embedding-only models that can't generate text
  const embeddingOnlyModels = [
    'embeddinggemma',
    'nomic-embed',
    'all-minilm',
    'mxbai-embed',
    'bge-'
  ];

  const isEmbeddingOnly = embeddingOnlyModels.some(m => 
    configuredModel.toLowerCase().includes(m)
  );

  if (isEmbeddingOnly) {
    // Use a small, fast generation model for keyword expansion
    // User can override by setting a generation-capable model
    logger.debug('getGenerationModel', 
      `Model "${configuredModel}" is embedding-only, using llama3.2:1b for keyword expansion`
    );
    return 'llama3.2:1b'; // Small, fast, good for simple tasks
  }

  return configuredModel;
}

/**
 * Call Ollama's /api/generate endpoint for keyword expansion
 */
async function callOllamaForKeywords(
  endpoint: string,
  model: string,
  query: string,
  timeout: number
): Promise<string[]> {
  const originalTokens = query.split(/\s+/).filter(t => t.length > 0);

  // Craft a precise prompt for strict JSON output
  const prompt = `You are a keyword expansion assistant. Given search keywords, provide synonyms and related terms.

STRICT RULES:
1. Output ONLY valid JSON, no markdown, no code blocks, no explanations
2. Use the exact format shown below
3. Keep keywords lowercase, single words only
4. Provide 3-8 synonyms/related terms per original keyword
5. Include common misspellings if relevant

INPUT KEYWORDS: ${originalTokens.join(', ')}

OUTPUT FORMAT (JSON only):
{"original":["word1","word2"],"expanded":["synonym1","synonym2","related1"]}

Your response:`;

  const requestUrl = `${endpoint}/api/generate`;
  const requestBody = {
    model: model,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.3, // Low temperature for consistent output
      num_predict: 200  // Limit response length
    }
  };

  logger.debug('callOllamaForKeywords', '📡 Sending generation request', {
    url: requestUrl,
    model,
    queryTokens: originalTokens
  });

  const controller = new AbortController();
  const hasTimeout = timeout > 0;
  const timeoutId = hasTimeout ? setTimeout(() => controller.abort(), timeout) : undefined;

  const startTime = Date.now();

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (hasTimeout && timeoutId) {
      clearTimeout(timeoutId);
    }

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.response || '';

    logger.debug('callOllamaForKeywords', `📨 Response received in ${duration}ms`, {
      responseLength: generatedText.length,
      preview: generatedText.substring(0, 200)
    });

    // Parse the JSON response, handling various edge cases
    const expandedKeywords = parseKeywordResponse(generatedText, originalTokens);
    
    return expandedKeywords;

  } catch (error: unknown) {
    if (hasTimeout && timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout after ${timeout}ms - try increasing timeout or use infinite (-1)`);
    }
    throw error;
  }
}

/**
 * Parse LLM response and extract keywords
 * Handles various edge cases: markdown wrappers, malformed JSON, etc.
 */
function parseKeywordResponse(responseText: string, originalTokens: string[]): string[] {
  let cleanedText = responseText.trim();

  // Remove markdown code blocks if present
  // Handle: ```json ... ``` or ``` ... ``` or ```language ... ```
  const codeBlockMatch = cleanedText.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleanedText = codeBlockMatch[1].trim();
    logger.trace('parseKeywordResponse', 'Extracted from code block', { cleanedText });
  }

  // Remove any leading/trailing non-JSON characters
  const jsonStart = cleanedText.indexOf('{');
  const jsonEnd = cleanedText.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
  }

  try {
    const parsed: KeywordExpansionResponse = JSON.parse(cleanedText);
    
    // Combine original and expanded, deduplicate, filter
    const allKeywords = new Set<string>();
    
    // Add original tokens first
    originalTokens.forEach(t => allKeywords.add(t.toLowerCase()));
    
    // Add parsed original (in case LLM understood differently)
    if (Array.isArray(parsed.original)) {
      parsed.original.forEach(k => {
        if (typeof k === 'string' && k.length > 0) {
          allKeywords.add(k.toLowerCase().trim());
        }
      });
    }
    
    // Add expanded keywords
    if (Array.isArray(parsed.expanded)) {
      parsed.expanded.forEach(k => {
        if (typeof k === 'string' && k.length > 0) {
          // Clean up and validate each keyword
          const cleaned = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
          if (cleaned.length >= 2) { // Skip single-char keywords
            allKeywords.add(cleaned);
          }
        }
      });
    }

    const result = Array.from(allKeywords);
    logger.debug('parseKeywordResponse', '✅ Parsed keywords', { 
      original: originalTokens,
      expanded: result.length - originalTokens.length,
      total: result.length
    });

    return result;

  } catch (parseError) {
    logger.warn('parseKeywordResponse', '⚠️ JSON parse failed, falling back to regex extraction', {
      error: parseError,
      rawResponse: cleanedText.substring(0, 300)
    });

    // Fallback: extract quoted strings that look like keywords
    const quotedStrings = cleanedText.match(/"([a-zA-Z0-9]+)"/g) || [];
    const extractedKeywords = new Set<string>(originalTokens);
    
    quotedStrings.forEach(qs => {
      const keyword = qs.replace(/"/g, '').toLowerCase();
      if (keyword.length >= 2) {
        extractedKeywords.add(keyword);
      }
    });

    return Array.from(extractedKeywords);
  }
}

/**
 * Clear the expansion cache (useful for testing or memory management)
 */
export function clearExpansionCache(): void {
  expansionCache.clear();
  logger.debug('clearExpansionCache', 'Cache cleared');
}

/**
 * Get cache stats for debugging
 */
export function getExpansionCacheStats(): { size: number; keys: string[] } {
  return {
    size: expansionCache.size,
    keys: Array.from(expansionCache.keys())
  };
}
