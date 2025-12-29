// settings.ts — Centralized settings management with type safety and validation

import { browserAPI } from './helpers';
import { Logger, ComponentLogger } from './logger';

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
    // Ollama AI integration settings
    ollamaEnabled?: boolean;      // Enable/disable Ollama integration (default: false)
    ollamaEndpoint?: string;      // Ollama API endpoint (default: 'http://localhost:11434')
    ollamaModel?: string;         // Ollama model to use (default: 'embeddinggemma:300m')
    ollamaTimeout?: number;       // Max embedding generation time in ms (default: 2000)
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
    validate?: (value: any) => boolean;
    transform?: (value: any) => T;
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
        default: 300,
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
        default: 'embeddinggemma:300m',
        validate: (val) => typeof val === 'string' && val.length > 0,
    },
    ollamaTimeout: {
        default: 2000,
        validate: (val) => typeof val === 'number' && val >= 500 && val <= 5000,
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
        const defaults: any = {};
        for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
            defaults[key] = schema.default;
        }
        return defaults as AppSettings;
    }
    
    private static settings: AppSettings = SettingsManager.getDefaults();

    private static initialized = false;
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
     * PERFORMANCE: This is designed to be non-blocking - uses defaults immediately
     */
    static async init(): Promise<void> {
        // Already initialized - skip
        if (this.initialized) {return;}

        // Mark as initialized immediately with defaults
        // Settings can be used right away with defaults
        this.initialized = true;

        try {
            this.logger.info('init', '🔄 Loading settings from storage...');
            // Load stored settings in background (non-blocking for UI)
            const stored = await this.loadFromStorage();
            this.logger.info('init', '📦 Loaded from storage:', stored || 'null');
            
            if (stored) {
                this.logger.info('init', '🔀 Merging with defaults...');
                this.settings = { ...this.settings, ...stored };
                this.logger.info('init', '✅ Merged settings:', this.settings);
            } else {
                this.logger.info('init', '⚠️ No stored settings, using defaults:', this.settings);
            }

            // Ensure displayMode always defaults to list
            this.settings.displayMode = DisplayMode.LIST;

            // Apply current settings (non-critical)
            await this.applySettings();
            this.logger.info('init', '✅ Settings initialized and applied');
        } catch (error) {
            // Already using defaults, just log the error
            this.logger.error('init', '❌ Settings initialization failed:', error);
            this.logger.info('init', '📋 Using defaults:', this.settings);
        }
    }

    /**
     * Get current settings
     */
    static getSettings(): Readonly<AppSettings> {
        return { ...this.settings };
    }

    /**
     * Update settings and persist to storage
     */
    static async updateSettings(updates: Partial<AppSettings>): Promise<void> {
        try {
            this.logger.debug('updateSettings', '📝 Before update:', this.settings);
            this.logger.info('updateSettings', '📝 Applying updates:', updates);
            this.settings = { ...this.settings, ...updates };
            this.logger.info('updateSettings', '📝 After merge:', this.settings);
            await this.saveToStorage();
            this.logger.info('updateSettings', '💾 Saved to storage');
            await this.applySettings();
            this.logger.info('updateSettings', '✅ Settings updated and applied successfully');
        } catch (error) {
            this.logger.error('updateSettings', '❌ Failed to update settings:', error);
            throw error;
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
                    this.logger.warn('loadFromStorage', 'Invalid stored settings, ignoring:', error);
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

            this.logger.debug('saveToStorage', 'Saving to storage:', this.settings);
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
            Logger.error('[Settings] Failed to apply settings:', error);
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
            Logger.trace('[Settings] Could not notify popup:', error);
        }
    }

    /**
     * Validate settings object using schema
     * ✅ AUTOMATIC: All settings validated based on SETTINGS_SCHEMA
     * ✅ SCALABLE: Adding new settings = add to schema only
     */
    private static validateSettings(settings: any): AppSettings | null {
        try {
            const validated: any = {};

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

            this.logger.debug('validateSettings', '✅ Validation complete:', validated);
            return validated as AppSettings;
        } catch (error) {
            this.logger.warn('validateSettings', '❌ Validation failed:', error);
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
            Logger.error('[Settings] Failed to import settings:', error);
            throw error;
        }
    }
}