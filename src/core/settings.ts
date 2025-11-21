// settings.ts — Centralized settings management with type safety and validation

import { browserAPI } from "./helpers";
import { Logger } from "./logger";

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
        logLevel: 1, // INFO level
    };

    private static initialized = false;

    /**
     * Initialize settings from storage
     */
    static async init(): Promise<void> {
        if (this.initialized) return;

        try {
            Logger.debug('[Settings] Initializing settings manager');
            const stored = await this.loadFromStorage();
            if (stored) {
                this.settings = { ...this.settings, ...stored };
                Logger.debug('[Settings] Loaded settings from storage:', this.settings);
            } else {
                Logger.debug('[Settings] No stored settings found, using defaults');
            }

            // Apply current settings
            await this.applySettings();
            this.initialized = true;
            Logger.info('[Settings] Settings manager initialized');
        } catch (error) {
            Logger.error('[Settings] Failed to initialize settings:', error);
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
            logLevel: 1,
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
                resolve(null);
                return;
            }

            browserAPI.storage.local.get([this.STORAGE_KEY], (result) => {
                try {
                    const stored = result[this.STORAGE_KEY];
                    if (stored && typeof stored === 'object') {
                        // Validate the stored settings
                        const validated = this.validateSettings(stored);
                        resolve(validated);
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    Logger.warn('[Settings] Invalid stored settings, ignoring:', error);
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
                reject(new Error('Storage API not available'));
                return;
            }

            browserAPI.storage.local.set({ [this.STORAGE_KEY]: this.settings }, () => {
                if (browserAPI.runtime.lastError) {
                    reject(new Error(browserAPI.runtime.lastError.message));
                } else {
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
                logLevel: 1,
            };

            // Validate displayMode
            if (settings.displayMode && Object.values(DisplayMode).includes(settings.displayMode)) {
                validated.displayMode = settings.displayMode;
            }

            // Validate logLevel
            if (typeof settings.logLevel === 'number' && settings.logLevel >= 0 && settings.logLevel <= 3) {
                validated.logLevel = settings.logLevel;
            }

            // Future: validate other settings

            return validated;
        } catch (error) {
            Logger.warn('[Settings] Settings validation failed:', error);
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