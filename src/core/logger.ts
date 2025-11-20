// logging.ts — Centralized logging utility with configurable levels

export enum LogLevel {
    ERROR = 0,
    INFO = 1,
    DEBUG = 2,
    TRACE = 3
}

export class Logger {
    private static currentLevel: LogLevel = LogLevel.INFO;
    private static storageKey = 'logLevel';

    static async init(): Promise<void> {
        return new Promise((resolve) => {
            // Load logging level from storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get([this.storageKey], (result) => {
                    const savedLevel = result[this.storageKey];
                    if (typeof savedLevel === 'number' && savedLevel >= 0 && savedLevel <= 3) {
                        this.currentLevel = savedLevel;
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    static setLevel(level: LogLevel): void {
        this.currentLevel = level;
        // Save to storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ [this.storageKey]: level });
        }
    }

    static getLevel(): LogLevel {
        return this.currentLevel;
    }

    static error(...args: any[]): void {
        if (this.currentLevel >= LogLevel.ERROR) {
            console.error('[ERROR]', ...args);
        }
    }

    static info(...args: any[]): void {
        if (this.currentLevel >= LogLevel.INFO) {
            console.log('[INFO]', ...args);
        }
    }

    static warn(...args: any[]): void {
        if (this.currentLevel >= LogLevel.INFO) {
            console.warn('[WARN]', ...args);
        }
    }

    static debug(...args: any[]): void {
        if (this.currentLevel >= LogLevel.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    }

    static trace(...args: any[]): void {
        if (this.currentLevel >= LogLevel.TRACE) {
            console.log('[TRACE]', ...args);
        }
    }

    // Convenience methods for different contexts
    static db(...args: any[]): void {
        this.debug('[Database]', ...args);
    }

    static search(...args: any[]): void {
        this.debug('[Search]', ...args);
    }

    static ui(...args: any[]): void {
        this.debug('[UI]', ...args);
    }

    static cmd(...args: any[]): void {
        this.debug('[Command]', ...args);
    }
}