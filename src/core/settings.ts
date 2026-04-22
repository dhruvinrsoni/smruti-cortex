// settings.ts — Centralized settings management with type safety and validation

import { browserAPI } from './helpers';
import { Logger, ComponentLogger, errorMeta } from './logger';
import { DEFAULT_GENERATION_MODEL, DEFAULT_EMBEDDING_MODEL } from '../shared/ollama-models';

export enum DisplayMode {
    LIST = 'list',
    CARDS = 'cards'
}

export interface AppSettings {
    displayMode: DisplayMode;
    logLevel: number;
    highlightMatches: boolean;
    /**
     * Delay in ms before focus shifts to results after typing (0 disables auto-focus)
     */
    focusDelayMs?: number;
    /**
     * When Tab returns focus to input, select all text (true) or place cursor at end (false)
     */
    selectAllOnFocus?: boolean;
    // AI settings
    ollamaEnabled?: boolean;      // Enable/disable Ollama integration (default: false)
    ollamaEndpoint?: string;      // Ollama API endpoint (default: 'http://localhost:11434')
    ollamaModel?: string;         // Ollama model for keyword expansion (default: see DEFAULT_GENERATION_MODEL in src/shared/ollama-models.ts)
    ollamaTimeout?: number;       // Max embedding generation time in ms (default: 30000 = 30s, -1 = infinite/no timeout)
    aiSearchDelayMs?: number;     // Delay in ms before AI expansion triggers after user stops typing (default: 500)
    embeddingsEnabled?: boolean;  // Enable semantic search with embeddings (default: false)
    embeddingModel?: string;      // Ollama model for embeddings (default: see DEFAULT_EMBEDDING_MODEL in src/shared/ollama-models.ts)
    // Privacy settings
    loadFavicons?: boolean;       // Load favicons from Google API (default: true)
    sensitiveUrlBlacklist?: string[];  // User-defined domains/patterns to skip metadata extraction (default: [])
    // Bookmarks indexing
    indexBookmarks?: boolean;     // Include bookmarks in search index (default: true)
    // Search result diversity
    showDuplicateUrls?: boolean;  // Show duplicate URLs with different query params (default: false = diversity ON)
    showNonMatchingResults?: boolean; // Show results that don't match the query (default: false = strict matching)
    sortBy?: string;  // Sort order for results: 'best-match', 'most-recent', 'most-visited', 'alphabetical' (default: 'best-match')
    defaultResultCount?: number;  // Number of recent results to show when popup opens with no query (default: 50)
    showRecentHistory?: boolean;   // Show recent browsing history when input is empty (default: true)
    showRecentSearches?: boolean;  // Show recent search queries when input is empty (default: true)
    unifiedScroll?: boolean;       // Merge sections + results into single scroll (default: false)
    // Toolbar toggle chip bar — which toggles are visible on the main screen
    toolbarToggles?: string[];
    // Command Palette — prefix-based mode system for quick-search overlay
    commandPaletteEnabled?: boolean;     // Master switch: OFF disables all prefix modes
    commandPaletteModes?: string[];      // Which prefix modes are active: ['/', '>', '@', '#', '??']
    commandPaletteInPopup?: boolean;     // Whether popup also gets prefix modes (off by default)
    commandPaletteOnboarded?: boolean;   // True after user has seen the first-use hint
    /** Default ?? engine when no prefix: google | youtube | github | gcp */
    webSearchEngine?: string;
    /** Tracker site origin (e.g. https://tracker.example.com) for ?? j */
    jiraSiteUrl?: string;
    /** Wiki site origin (e.g. https://wiki.example.com) for ?? c */
    confluenceSiteUrl?: string;
    // Advanced browser commands — opt-in for tab power, tab groups, browsing data
    advancedBrowserCommands?: boolean;
    developerGithubPat?: string;        // GitHub PAT for direct issue creation (optional, falls back to URL)
    // Future settings can be added here
    theme?: 'light' | 'dark' | 'auto';
    maxResults?: number;
}

/**
 * Schema-driven setting definition
 * Add new settings here - validation is automatic!
 */
interface SettingSchema<T> {
    default: T;
    validate?: (value: any) => boolean; // eslint-disable-line @typescript-eslint/no-explicit-any
    transform?: (value: any) => T; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * SINGLE SOURCE OF TRUTH for all settings
 * Adding a new setting = ONE entry here. That's it!
 */
const SETTINGS_SCHEMA: { [K in keyof Required<AppSettings>]: SettingSchema<AppSettings[K]> } = {
    // Display settings
    displayMode: {
        default: DisplayMode.LIST,
        validate: (val) => Object.values(DisplayMode).includes(val),
    },
    logLevel: {
        default: 2, // INFO
        validate: (val) => typeof val === 'number' && val >= 0 && val <= 4,
    },
    highlightMatches: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    focusDelayMs: {
        default: 450,
        validate: (val) => typeof val === 'number' && val >= 0 && val <= 2000,
    },
    
    // Ollama AI settings
    ollamaEnabled: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    ollamaEndpoint: {
        default: 'http://localhost:11434',
        validate: (val) => typeof val === 'string' && val.length > 0,
    },
    ollamaModel: {
        default: DEFAULT_GENERATION_MODEL,  // Generation model for keyword expansion (NOT embedding model) — defined in src/shared/ollama-models.ts
        validate: (val) => typeof val === 'string' && val.length > 0,
    },
    ollamaTimeout: {
        default: 30000,  // 30 seconds (generous for first-time model loading on slower systems)
        validate: (val) => typeof val === 'number' && (val === -1 || (val >= 5000 && val <= 120000)),  // -1 = infinite, or 5s-120s
    },
    aiSearchDelayMs: {
        default: 500,  // Wait 500ms of idle typing before triggering AI expansion
        validate: (val) => typeof val === 'number' && val >= 200 && val <= 3000,  // 200ms-3s
    },
    // Semantic search settings
    embeddingsEnabled: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    embeddingModel: {
        default: DEFAULT_EMBEDDING_MODEL,  // Dedicated embedding model — defined in src/shared/ollama-models.ts
        validate: (val) => typeof val === 'string' && val.length > 0,
    },
    
    // Privacy settings
    loadFavicons: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    sensitiveUrlBlacklist: {
        default: [],
        validate: (val) => Array.isArray(val) && val.every((v: any) => typeof v === 'string'), // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    
    // Bookmarks indexing - default true = index bookmarks
    indexBookmarks: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    
    // Search result diversity - default false = diversity ON (filter duplicates)
    showDuplicateUrls: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    
    // Strict matching - default false = only show matching results
    showNonMatchingResults: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    
    // Sort order for results
    sortBy: {
        default: 'best-match',
        validate: (val) => typeof val === 'string' && ['best-match', 'most-recent', 'most-visited', 'alphabetical'].includes(val),
    },
    
    // Default result count when popup opens (no search query)
    defaultResultCount: {
        default: 50,
        validate: (val) => typeof val === 'number' && val > 0 && val <= 200,
    },
    
    // Focus behavior - default false = cursor goes to end when Tab focuses input
    selectAllOnFocus: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    
    showRecentHistory: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    showRecentSearches: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    unifiedScroll: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },

    toolbarToggles: {
        default: ['ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls'],
        validate: (val) => Array.isArray(val) && val.every((v: any) => typeof v === 'string'), // eslint-disable-line @typescript-eslint/no-explicit-any
    },

    // Command Palette settings
    commandPaletteEnabled: {
        default: true,
        validate: (val) => typeof val === 'boolean',
    },
    commandPaletteModes: {
        default: ['/', '>', '@', '#', '??'],
        validate: (val) => Array.isArray(val) && val.every((v: any) => typeof v === 'string' && ['/', '>', '@', '#', '??'].includes(v)), // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    commandPaletteInPopup: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    commandPaletteOnboarded: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    webSearchEngine: {
        default: 'google',
        validate: (val) => typeof val === 'string' && (
            ['google', 'youtube', 'github', 'gcp'].includes(val)
            || val === 'duckduckgo'
            || val === 'bing'
        ),
        transform: (val) => {
            if (val === 'duckduckgo' || val === 'bing') {
                return 'google';
            }
            if (['google', 'youtube', 'github', 'gcp'].includes(val)) {
                return val;
            }
            return 'google';
        },
    },
    jiraSiteUrl: {
        default: '',
        validate: (val) => {
            if (typeof val !== 'string') {
                return false;
            }
            const t = val.trim();
            if (t === '') {
                return true;
            }
            try {
                const u = new URL(t);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch {
                return false;
            }
        },
        transform: (val) => {
            if (typeof val !== 'string') {
                return '';
            }
            const t = val.trim();
            if (t === '') {
                return '';
            }
            try {
                return new URL(t).origin;
            } catch {
                return '';
            }
        },
    },
    confluenceSiteUrl: {
        default: '',
        validate: (val) => {
            if (typeof val !== 'string') {
                return false;
            }
            const t = val.trim();
            if (t === '') {
                return true;
            }
            try {
                const u = new URL(t);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch {
                return false;
            }
        },
        transform: (val) => {
            if (typeof val !== 'string') {
                return '';
            }
            const t = val.trim();
            if (t === '') {
                return '';
            }
            try {
                return new URL(t).origin;
            } catch {
                return '';
            }
        },
    },

    advancedBrowserCommands: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },

    developerGithubPat: {
        default: '',
        validate: (val) => typeof val === 'string',
    },

    // Future settings (placeholders)
    theme: {
        default: 'auto' as const,
        validate: (val) => ['light', 'dark', 'auto'].includes(val),
    },
    maxResults: {
        default: 100,
        validate: (val) => typeof val === 'number' && val > 0 && val <= 1000,
    },
};

export class SettingsManager {
    private static readonly STORAGE_KEY = 'smrutiCortexSettings';
    
    /**
     * Get default settings from schema (computed once)
     */
    private static getDefaults(): AppSettings {
        const defaults: Partial<AppSettings> = {};
        for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
            defaults[key] = schema.default;
        }
        return defaults as AppSettings;
    }
    
    private static settings: AppSettings = SettingsManager.getDefaults();

    private static initialized = false;
    private static _initPromise: Promise<void> | null = null;
    private static _logger: ComponentLogger | null = null;

    /**
     * Get the component logger (lazy initialization)
     */
    private static get logger(): ComponentLogger {
        if (!this._logger) {
            this._logger = Logger.forComponent('SettingsManager');
        }
        return this._logger;
    }

    /**
     * Check if already initialized
     */
    static isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Initialize settings from storage
     * PERFORMANCE: This is designed to be non-blocking - uses defaults immediately.
     * Callers can await init() to wait for stored settings to be fully loaded.
     */
    static init(): Promise<void> {
        if (this._initPromise) {return this._initPromise;}

        this.initialized = true;

        this._initPromise = (async () => {
            try {
                this.logger.info('init', '🔄 Loading settings from storage...');
                const stored = await this.loadFromStorage();
                this.logger.info('init', `📦 Loaded from storage: ${stored ? `${Object.keys(stored).length} keys` : 'null'}`);

                if (stored) {
                    this.settings = { ...this.settings, ...stored };
                    this.logger.info('init', '✅ Merged settings:', this.summarize(this.settings));
                } else {
                    this.logger.info('init', '⚠️ No stored settings, using defaults:', this.summarize(this.settings));
                }

                await this.applySettings();
                this.logger.info('init', '✅ Settings initialized and applied');
            } catch (error) {
                this.logger.error('init', '❌ Settings initialization failed:', errorMeta(error));
                this.logger.info('init', '📋 Using defaults:', this.summarize(this.settings));
            }
        })();

        return this._initPromise;
    }

    /**
     * Get current settings
     */
    static getSettings(): Readonly<AppSettings> {
        return { ...this.settings };
    }

    /**
     * Compact summary used by debug/info logs. Avoids dumping the full
     * 30+ field settings tree on every update — that creates DevTools noise
     * and bloats the in-memory log buffer. Includes the booleans/keys most
     * useful when diagnosing settings issues.
     */
    private static summarize(s: Partial<AppSettings> | null | undefined): Record<string, unknown> {
        if (!s || typeof s !== 'object') {return { keys: 0 };}
        const k = Object.keys(s);
        return {
            keys: k.length,
            logLevel: (s as AppSettings).logLevel,
            ollamaEnabled: (s as AppSettings).ollamaEnabled,
            embeddingsEnabled: (s as AppSettings).embeddingsEnabled,
            displayMode: (s as AppSettings).displayMode,
        };
    }

    /**
     * Update settings and persist to storage
     */
    static async updateSettings(updates: Partial<AppSettings>): Promise<void> {
        try {
            this.logger.debug('updateSettings', '📝 Before update:', this.summarize(this.settings));
            this.logger.info('updateSettings', `📝 Applying updates: ${Object.keys(updates).join(', ') || '(none)'}`, updates);
            this.settings = { ...this.settings, ...updates };
            this.logger.info('updateSettings', '📝 After merge:', this.summarize(this.settings));
            await this.saveToStorage();
            this.logger.info('updateSettings', '💾 Saved to storage');
            await this.applySettings();
            this.logger.info('updateSettings', '✅ Settings updated and applied successfully');
        } catch (error) {
            this.logger.error('updateSettings', '❌ Failed to update settings:', errorMeta(error));
            throw error;
        }
    }

    /**
     * Apply settings received from another context (popup ↔ service worker).
     * Updates in-memory cache and saves to storage, but does NOT broadcast
     * a SETTINGS_CHANGED notification. This breaks the infinite ping-pong loop
     * that occurs when both contexts re-broadcast on every receive.
     */
    static async applyRemoteSettings(settings: Partial<AppSettings>): Promise<void> {
        try {
            this.settings = { ...this.settings, ...settings };
            await this.saveToStorage();
            // Apply log level locally (no notification)
            const currentLogLevel = Logger.getLevel();
            if (currentLogLevel !== this.settings.logLevel) {
                Logger.setLevelInternal(this.settings.logLevel);
            }
            this.logger.debug('applyRemoteSettings', '✅ Remote settings applied (no re-broadcast)');
        } catch (error) {
            this.logger.error('applyRemoteSettings', '❌ Failed to apply remote settings:', errorMeta(error));
        }
    }

    /**
     * Get specific setting value
     */
    static getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
        return this.settings[key];
    }

    /**
     * Set specific setting value
     */
    static async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
        this.logger.info('setSetting', `Setting '${String(key)}' to:`, value);
        await this.updateSettings({ [key]: value });
        this.logger.info('setSetting', `✅ '${String(key)}' saved. Current value:`, this.settings[key]);
    }

    /**
     * Reset settings to defaults
     */
    static async resetToDefaults(): Promise<void> {
        Logger.info('[Settings] Resetting to default settings');
        this.settings = this.getDefaults();
        await this.saveToStorage();
        await this.applySettings();
    }

    /**
     * Load settings from browser storage
     */
    private static async loadFromStorage(): Promise<AppSettings | null> {
        return new Promise((resolve) => {
            if (!browserAPI.storage) {
                this.logger.warn('loadFromStorage', 'Storage API not available');
                resolve(null);
                return;
            }

            this.logger.debug('loadFromStorage', 'Loading from storage with key:', this.STORAGE_KEY);
            browserAPI.storage.local.get([this.STORAGE_KEY], (result) => {
                this.logger.debug('loadFromStorage', 'Storage get result:', result);
                this.logger.debug('loadFromStorage', 'chrome.runtime.lastError:', browserAPI.runtime.lastError);
                try {
                    const stored = result[this.STORAGE_KEY];
                    this.logger.debug('loadFromStorage', 'Raw stored value:', stored);
                    if (stored && typeof stored === 'object') {
                        // Validate the stored settings
                        const validated = this.validateSettings(stored);
                        this.logger.debug('loadFromStorage', 'Validated settings:', validated);
                        resolve(validated);
                    } else {
                        this.logger.debug('loadFromStorage', 'No valid stored settings found');
                        resolve(null);
                    }
                } catch (error) {
                    this.logger.warn('loadFromStorage', 'Invalid stored settings, ignoring:', errorMeta(error));
                    resolve(null);
                }
            });
        });
    }

    /**
     * Save settings to browser storage
     */
    private static async saveToStorage(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!browserAPI.storage) {
                this.logger.error('saveToStorage', 'Storage API not available for saving');
                reject(new Error('Storage API not available'));
                return;
            }

            this.logger.debug('saveToStorage', 'Saving to storage:', this.summarize(this.settings));
            browserAPI.storage.local.set({ [this.STORAGE_KEY]: this.settings }, () => {
                this.logger.debug('saveToStorage', 'chrome.runtime.lastError after save:', browserAPI.runtime.lastError);
                if (browserAPI.runtime.lastError) {
                    this.logger.error('saveToStorage', 'Failed to save settings:', browserAPI.runtime.lastError.message);
                    reject(new Error(browserAPI.runtime.lastError.message));
                } else {
                    this.logger.debug('saveToStorage', 'Settings saved successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Apply current settings to the application
     */
    private static async applySettings(): Promise<void> {
        try {
            // Apply log level only if it's different from current
            const currentLogLevel = Logger.getLevel();
            if (currentLogLevel !== this.settings.logLevel) {
                Logger.setLevelInternal(this.settings.logLevel);
                Logger.debug('[Settings] Applied log level:', this.settings.logLevel);
            }

            // Notify other parts of the application about settings changes
            await this.notifySettingsChanged();
        } catch (error) {
            Logger.error('[Settings] Failed to apply settings:', errorMeta(error));
        }
    }

    /**
     * Notify other components about settings changes
     */
    private static async notifySettingsChanged(): Promise<void> {
        // Send message to popup and other contexts
        const message = {
            type: 'SETTINGS_CHANGED',
            settings: this.getSettings()
        };

        // Try to send to popup
        try {
            await new Promise<void>((resolve) => {
                browserAPI.runtime.sendMessage(message, () => {
                    if (browserAPI.runtime.lastError) {
                        Logger.trace('[Settings] No popup to notify:', browserAPI.runtime.lastError.message);
                    }
                    resolve();
                });
            });
        } catch (error) {
            Logger.trace('[Settings] Could not notify popup:', errorMeta(error));
        }
    }

    /**
     * Validate settings object using schema
     * ✅ AUTOMATIC: All settings validated based on SETTINGS_SCHEMA
     * ✅ SCALABLE: Adding new settings = add to schema only
     */
    private static validateSettings(settings: unknown): AppSettings | null {
        try {
            const validated: Partial<AppSettings> = {};

            this.logger.debug('validateSettings', '🔍 Validating settings object');

            // Iterate through schema and validate each setting
            for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
                const value = settings[key];
                
                // If value exists and passes validation, use it
                if (value !== undefined && (!schema.validate || schema.validate(value))) {
                    validated[key] = schema.transform ? schema.transform(value) : value;
                    this.logger.debug('validateSettings', `✅ ${key}:`, value);
                } else {
                    // Use default if missing or invalid
                    validated[key] = schema.default;
                    if (value !== undefined) {
                        this.logger.debug('validateSettings', `⚠️ ${key}: invalid, using default:`, schema.default);
                    } else {
                        this.logger.debug('validateSettings', `ℹ️ ${key}: not found, using default:`, schema.default);
                    }
                }
            }

            const raw = settings as Record<string, unknown>;
            const legacyAtlassian = raw.atlassianSiteUrl;
            const jiraU = (validated.jiraSiteUrl ?? '').trim();
            const confU = (validated.confluenceSiteUrl ?? '').trim();
            if (!jiraU && !confU && typeof legacyAtlassian === 'string' && legacyAtlassian.trim()) {
                try {
                    const o = new URL(legacyAtlassian.trim()).origin;
                    validated.jiraSiteUrl = o;
                    validated.confluenceSiteUrl = o;
                    this.logger.debug('validateSettings', 'Migrated atlassianSiteUrl → jiraSiteUrl + confluenceSiteUrl:', o);
                } catch { /* ignore bad legacy URL */ }
            }

            this.logger.debug('validateSettings', '✅ Validation complete:', validated);
            return validated as AppSettings;
        } catch (error) {
            this.logger.warn('validateSettings', '❌ Validation failed:', errorMeta(error));
            return null;
        }
    }

    /**
     * Export settings for debugging
     */
    static exportSettings(): string {
        return JSON.stringify(this.settings, null, 2);
    }

    /**
     * Import settings from JSON string
     */
    static async importSettings(jsonString: string): Promise<void> {
        try {
            const imported = JSON.parse(jsonString);
            const validated = this.validateSettings(imported);
            if (validated) {
                await this.updateSettings(validated);
                Logger.info('[Settings] Settings imported successfully');
            } else {
                throw new Error('Invalid settings format');
            }
        } catch (error) {
            Logger.error('[Settings] Failed to import settings:', errorMeta(error));
            throw error;
        }
    }
}