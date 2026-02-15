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
 * 
 * === CACHE ===
 * LRU cache with 5-minute TTL - even though Ollama is local, LLM calls take time.
 * Cache reduces repeated expansions for same queries, improving responsiveness.
 */

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';

const COMPONENT = 'AIKeywordExpander';
const logger = Logger.forComponent(COMPONENT);

/**
 * Response format we expect from the LLM (strict JSON)
 */
interface KeywordExpansionResponse {
  original: string[];
  expanded: string[];
}

/**
 * AI expansion cache with TTL
 */
interface CacheEntry {
  keywords: string[];
  timestamp: number;
}

const aiCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

function getCachedExpansion(query: string): string[] | null {
  const entry = aiCache.get(query);
  if (!entry) {return null;}
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    aiCache.delete(query);
    return null;
  }
  
  return entry.keywords;
}

function cacheExpansion(query: string, keywords: string[]): void {
  // Evict oldest if cache is full
  if (aiCache.size >= MAX_CACHE_SIZE && !aiCache.has(query)) {
    const oldestKey = aiCache.keys().next().value;
    aiCache.delete(oldestKey);
  }
  
  aiCache.set(query, {
    keywords,
    timestamp: Date.now()
  });
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

  // CRITICAL: Check if AI is enabled FIRST
  // Settings may have changed since last search
  await SettingsManager.init();
  const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
  
  if (!ollamaEnabled) {
    // AI disabled - return original tokens only
    logger.trace('expandQueryKeywords', 'AI disabled, returning original tokens');
    return normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  }

  // Check cache first
  const cached = getCachedExpansion(normalizedQuery);
  if (cached) {
    logger.debug('expandQueryKeywords', `⚡ AI cache hit for: "${normalizedQuery}"`);
    return cached;
  }

  // AI is enabled - call LLM for expansion
  const endpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
  const model = SettingsManager.getSetting('ollamaModel') || 'llama3.2:1b';
  const timeout = SettingsManager.getSetting('ollamaTimeout') || 30000;

  // Check if we have a generation model configured
  // Embedding-only models can't do text generation
  const generationModel = getGenerationModel(model);
  
  logger.info('expandQueryKeywords', `🤖 Expanding keywords for: "${normalizedQuery}"`, {
    generationModel,
    endpoint
  });

  try {
    const expandedKeywords = await callOllamaForKeywords(endpoint, generationModel, normalizedQuery, timeout);
    
    // Cache the result
    cacheExpansion(normalizedQuery, expandedKeywords);
    
    logger.info('expandQueryKeywords', `✅ Expanded "${normalizedQuery}" → ${expandedKeywords.length} keywords`, {
      sample: expandedKeywords.slice(0, 10)
    });

    return expandedKeywords;
  } catch (error) {
    logger.warn('expandQueryKeywords', '❌ Expansion failed, using original query', { error });
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

  // Craft a MINIMAL prompt for fast, valid JSON output
  // Key: Ask for LESS data to avoid truncation
  const prompt = `Expand these search keywords with 5 synonyms. Output ONLY a JSON array, nothing else.

Keywords: ${originalTokens.join(', ')}

Example input: "war"
Example output: ["war","battle","fight","combat","conflict","military"]

Your JSON array:`;

  const requestUrl = `${endpoint}/api/generate`;
  const requestBody = {
    model: model,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.2,   // Very low for consistent output
      num_predict: 150,   // Enough for ~15-20 keywords in array format
      stop: ['\n\n', '```']  // Stop at double newline or code block start
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
 * Handles: simple arrays, object format, markdown wrappers, malformed JSON
 */
function parseKeywordResponse(responseText: string, originalTokens: string[]): string[] {
  let cleanedText = responseText.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = cleanedText.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleanedText = codeBlockMatch[1].trim();
    logger.trace('parseKeywordResponse', 'Extracted from code block', { cleanedText });
  }

  // Try to find JSON array first (new simpler format)
  const arrayStart = cleanedText.indexOf('[');
  const arrayEnd = cleanedText.lastIndexOf(']');
  
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const arrayText = cleanedText.substring(arrayStart, arrayEnd + 1);
    try {
      const parsed = JSON.parse(arrayText);
      if (Array.isArray(parsed)) {
        const allKeywords = new Set<string>();
        originalTokens.forEach(t => allKeywords.add(t.toLowerCase()));
        
        parsed.forEach((k: unknown) => {
          if (typeof k === 'string' && k.length >= 2) {
            const cleaned = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (cleaned.length >= 2) {
              allKeywords.add(cleaned);
            }
          }
        });
        
        const result = Array.from(allKeywords);
        logger.debug('parseKeywordResponse', '✅ Parsed array format', { 
          original: originalTokens,
          expanded: result.length - originalTokens.length,
          total: result.length
        });
        return result;
      }
    } catch {
      // Fall through to object format
    }
  }

  // Try object format (legacy)
  const jsonStart = cleanedText.indexOf('{');
  const jsonEnd = cleanedText.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
    
    try {
      const parsed: KeywordExpansionResponse = JSON.parse(cleanedText);
      const allKeywords = new Set<string>();
      originalTokens.forEach(t => allKeywords.add(t.toLowerCase()));
      
      if (Array.isArray(parsed.original)) {
        parsed.original.forEach(k => {
          if (typeof k === 'string' && k.length > 0) {
            allKeywords.add(k.toLowerCase().trim());
          }
        });
      }
      
      if (Array.isArray(parsed.expanded)) {
        parsed.expanded.forEach(k => {
          if (typeof k === 'string' && k.length > 0) {
            const cleaned = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (cleaned.length >= 2) {
              allKeywords.add(cleaned);
            }
          }
        });
      }

      const result = Array.from(allKeywords);
      logger.debug('parseKeywordResponse', '✅ Parsed object format', { 
        original: originalTokens,
        expanded: result.length - originalTokens.length,
        total: result.length
      });
      return result;
    } catch {
      // Fall through to regex extraction
    }
  }

  // Fallback: extract quoted strings that look like keywords
  logger.debug('parseKeywordResponse', '⚠️ Using regex fallback extraction', {
    rawResponse: responseText.substring(0, 200)
  });
  
  const quotedStrings = responseText.match(/"([a-zA-Z0-9]+)"/g) || [];
  const extractedKeywords = new Set<string>(originalTokens);
  
  quotedStrings.forEach(qs => {
    const keyword = qs.replace(/"/g, '').toLowerCase();
    if (keyword.length >= 2) {
      extractedKeywords.add(keyword);
    }
  });

  logger.debug('parseKeywordResponse', '✅ Regex extracted keywords', { 
    original: originalTokens,
    extracted: extractedKeywords.size - originalTokens.length,
    total: extractedKeywords.size
  });

  return Array.from(extractedKeywords);
}

