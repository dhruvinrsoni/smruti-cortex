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

export class SettingsManager {
    private static readonly STORAGE_KEY = 'smrutiCortexSettings';
    private static settings: AppSettings = {
        displayMode: DisplayMode.LIST, // Default to list
        logLevel: 2, // INFO level
        highlightMatches: true, // Enable match highlighting by default
        focusDelayMs: 300, // Default to 300ms
        // Ollama defaults (disabled by default for safety)
        ollamaEnabled: false,
        ollamaEndpoint: 'http://localhost:11434',
        ollamaModel: 'embeddinggemma:300m',
        ollamaTimeout: 2000, // 2 seconds max
    };

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
            this.logger.info('init', '📦 Loaded from storage:', JSON.stringify(stored));
            
            if (stored) {
                this.logger.info('init', '🔀 Merging with defaults...');
                this.settings = { ...this.settings, ...stored };
                this.logger.info('init', '✅ Merged settings:', JSON.stringify(this.settings));
            } else {
                this.logger.info('init', '⚠️ No stored settings, using defaults:', JSON.stringify(this.settings));
            }

            // Ensure displayMode always defaults to list
            this.settings.displayMode = DisplayMode.LIST;

            // Apply current settings (non-critical)
            await this.applySettings();
            this.logger.info('init', '✅ Settings initialized and applied');
        } catch (error) {
            // Already using defaults, just log the error
            this.logger.error('init', '❌ Settings initialization failed:', error);
            this.logger.info('init', '📋 Using defaults:', JSON.stringify(this.settings));
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
            this.logger.debug('updateSettings', '📝 Before update:', JSON.stringify(this.settings));
            this.logger.info('updateSettings', '📝 Applying updates:', JSON.stringify(updates));
            this.settings = { ...this.settings, ...updates };
            this.logger.info('updateSettings', '📝 After merge:', JSON.stringify(this.settings));
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
        this.settings = {
            displayMode: DisplayMode.LIST,
            logLevel: 2, // INFO level
            highlightMatches: true,
            focusDelayMs: 300,
        };
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
     * Validate settings object
     */
    private static validateSettings(settings: any): AppSettings | null {
        try {
            const validated: AppSettings = {
                displayMode: DisplayMode.LIST,
                logLevel: 2, // INFO level
                highlightMatches: true,
                focusDelayMs: 300,
            };

            this.logger.debug('validateSettings', 'Validating settings object:', settings);
            this.logger.debug('validateSettings', `DisplayMode values: ${Object.values(DisplayMode)}`);
            this.logger.debug('validateSettings', `settings.displayMode type: ${typeof settings.displayMode}, value: ${settings.displayMode}`);

            // Validate displayMode
            if (settings.displayMode && Object.values(DisplayMode).includes(settings.displayMode)) {
                validated.displayMode = settings.displayMode;
                this.logger.debug('validateSettings', 'DisplayMode validated successfully:', validated.displayMode);
            } else {
                this.logger.debug('validateSettings', 'DisplayMode validation failed, using default:', validated.displayMode);
            }

            // Validate logLevel
            if (typeof settings.logLevel === 'number' && settings.logLevel >= 0 && settings.logLevel <= 4) {
                validated.logLevel = settings.logLevel;
                this.logger.debug('validateSettings', 'LogLevel validated successfully:', validated.logLevel);
            } else {
                this.logger.debug('validateSettings', 'LogLevel validation failed, using default:', validated.logLevel);
            }

            // Validate highlightMatches
            if (typeof settings.highlightMatches === 'boolean') {
                validated.highlightMatches = settings.highlightMatches;
                this.logger.debug('validateSettings', 'HighlightMatches validated successfully:', validated.highlightMatches);
            } else {
                this.logger.debug('validateSettings', 'HighlightMatches validation failed, using default:', validated.highlightMatches);
            }

            // Validate focusDelayMs
            if (typeof settings.focusDelayMs === 'number' && settings.focusDelayMs >= 0 && settings.focusDelayMs <= 2000) {
                validated.focusDelayMs = settings.focusDelayMs;
                this.logger.debug('validateSettings', 'focusDelayMs validated successfully:', validated.focusDelayMs);
            } else {
                this.logger.debug('validateSettings', 'focusDelayMs validation failed, using default:', validated.focusDelayMs);
            }

            // Validate Ollama settings
            if (typeof settings.ollamaEnabled === 'boolean') {
                validated.ollamaEnabled = settings.ollamaEnabled;
                this.logger.debug('validateSettings', 'ollamaEnabled validated:', validated.ollamaEnabled);
            } else {
                validated.ollamaEnabled = false; // Default to disabled
                this.logger.debug('validateSettings', 'ollamaEnabled not found, using default: false');
            }

            if (typeof settings.ollamaEndpoint === 'string' && settings.ollamaEndpoint.length > 0) {
                validated.ollamaEndpoint = settings.ollamaEndpoint;
                this.logger.debug('validateSettings', 'ollamaEndpoint validated:', validated.ollamaEndpoint);
            } else {
                validated.ollamaEndpoint = 'http://localhost:11434';
                this.logger.debug('validateSettings', 'ollamaEndpoint not found, using default');
            }

            if (typeof settings.ollamaModel === 'string' && settings.ollamaModel.length > 0) {
                validated.ollamaModel = settings.ollamaModel;
                this.logger.debug('validateSettings', 'ollamaModel validated:', validated.ollamaModel);
            } else {
                validated.ollamaModel = 'embeddinggemma:300m';
                this.logger.debug('validateSettings', 'ollamaModel not found, using default');
            }

            if (typeof settings.ollamaTimeout === 'number' && settings.ollamaTimeout >= 500 && settings.ollamaTimeout <= 5000) {
                validated.ollamaTimeout = settings.ollamaTimeout;
                this.logger.debug('validateSettings', 'ollamaTimeout validated:', validated.ollamaTimeout);
            } else {
                validated.ollamaTimeout = 2000;
                this.logger.debug('validateSettings', 'ollamaTimeout not found, using default: 2000');
            }

            this.logger.debug('validateSettings', 'Final validated settings:', validated);
            return validated;
        } catch (error) {
            this.logger.warn('validateSettings', 'Settings validation failed:', error);
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