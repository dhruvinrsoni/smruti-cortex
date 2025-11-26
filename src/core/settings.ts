// settings.ts — Centralized settings management with type safety and validation

import { browserAPI } from "./helpers";
import { Logger, ComponentLogger } from "./logger";

export enum DisplayMode {
    LIST = 'list',
    CARDS = 'cards'
}

export interface AppSettings {
    displayMode: DisplayMode;
    logLevel: number;
    // Future settings can be added here
    theme?: 'light' | 'dark' | 'auto';
    maxResults?: number;
}

export class SettingsManager {
    private static readonly STORAGE_KEY = 'smrutiCortexSettings';
    private static settings: AppSettings = {
        displayMode: DisplayMode.LIST, // Default to list
        logLevel: 2, // INFO level
    };

    private static initialized = false;
    private static _logger: ComponentLogger | null = null;

    /**
     * Get the component logger (lazy initialization)
     */
    private static get logger(): ComponentLogger {
        if (!this._logger) {
            this._logger = Logger.forComponent("SettingsManager");
        }
        return this._logger;
    }

    /**
     * Initialize settings from storage
     */
    static async init(): Promise<void> {
        this.logger.info("init", "Starting SettingsManager.init()");
        try {
            this.logger.debug("init", "Initializing settings manager");
            const stored = await this.loadFromStorage();
            this.logger.debug("init", "Loaded from storage:", stored);
            if (stored) {
                this.settings = { ...this.settings, ...stored };
                this.logger.debug("init", "Applied stored settings, final settings:", this.settings);
            } else {
                this.logger.debug("init", "No stored settings found, using defaults:", this.settings);
            }

            // Ensure displayMode always defaults to list
            this.settings.displayMode = DisplayMode.LIST;
            this.logger.debug("init", "Ensured displayMode defaults to list");

            // Apply current settings
            await this.applySettings();
            this.initialized = true;
            this.logger.info("init", "SettingsManager.init() completed successfully");
        } catch (error) {
            this.logger.error("init", "Failed to initialize settings:", error);
            // Continue with defaults
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
            Logger.debug('[Settings] Updating settings:', updates);
            this.settings = { ...this.settings, ...updates };
            await this.saveToStorage();
            await this.applySettings();
            Logger.info('[Settings] Settings updated successfully');
        } catch (error) {
            Logger.error('[Settings] Failed to update settings:', error);
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
        await this.updateSettings({ [key]: value });
    }

    /**
     * Reset settings to defaults
     */
    static async resetToDefaults(): Promise<void> {
        Logger.info('[Settings] Resetting to default settings');
        this.settings = {
            displayMode: DisplayMode.LIST,
            logLevel: 2, // INFO level
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
                this.logger.warn("loadFromStorage", "Storage API not available");
                resolve(null);
                return;
            }

            this.logger.debug("loadFromStorage", "Loading from storage with key:", this.STORAGE_KEY);
            browserAPI.storage.local.get([this.STORAGE_KEY], (result) => {
                this.logger.debug("loadFromStorage", "Storage get result:", result);
                this.logger.debug("loadFromStorage", "chrome.runtime.lastError:", browserAPI.runtime.lastError);
                try {
                    const stored = result[this.STORAGE_KEY];
                    this.logger.debug("loadFromStorage", "Raw stored value:", stored);
                    if (stored && typeof stored === 'object') {
                        // Validate the stored settings
                        const validated = this.validateSettings(stored);
                        this.logger.debug("loadFromStorage", "Validated settings:", validated);
                        resolve(validated);
                    } else {
                        this.logger.debug("loadFromStorage", "No valid stored settings found");
                        resolve(null);
                    }
                } catch (error) {
                    this.logger.warn("loadFromStorage", "Invalid stored settings, ignoring:", error);
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
                this.logger.error("saveToStorage", "Storage API not available for saving");
                reject(new Error('Storage API not available'));
                return;
            }

            this.logger.debug("saveToStorage", "Saving to storage:", this.settings);
            browserAPI.storage.local.set({ [this.STORAGE_KEY]: this.settings }, () => {
                this.logger.debug("saveToStorage", "chrome.runtime.lastError after save:", browserAPI.runtime.lastError);
                if (browserAPI.runtime.lastError) {
                    this.logger.error("saveToStorage", "Failed to save settings:", browserAPI.runtime.lastError.message);
                    reject(new Error(browserAPI.runtime.lastError.message));
                } else {
                    this.logger.debug("saveToStorage", "Settings saved successfully");
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
            };

            this.logger.debug("validateSettings", "Validating settings object:", settings);
            this.logger.debug("validateSettings", `DisplayMode values: ${Object.values(DisplayMode)}`);
            this.logger.debug("validateSettings", `settings.displayMode type: ${typeof settings.displayMode}, value: ${settings.displayMode}`);

            // Validate displayMode
            if (settings.displayMode && Object.values(DisplayMode).includes(settings.displayMode)) {
                validated.displayMode = settings.displayMode;
                this.logger.debug("validateSettings", "DisplayMode validated successfully:", validated.displayMode);
            } else {
                this.logger.debug("validateSettings", "DisplayMode validation failed, using default:", validated.displayMode);
            }

            // Validate logLevel
            if (typeof settings.logLevel === 'number' && settings.logLevel >= 0 && settings.logLevel <= 4) {
                validated.logLevel = settings.logLevel;
                this.logger.debug("validateSettings", "LogLevel validated successfully:", validated.logLevel);
            } else {
                this.logger.debug("validateSettings", "LogLevel validation failed, using default:", validated.logLevel);
            }

            // Future: validate other settings

            this.logger.debug("validateSettings", "Final validated settings:", validated);
            return validated;
        } catch (error) {
            this.logger.warn("validateSettings", "Settings validation failed:", error);
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