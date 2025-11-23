// logging.ts — Centralized logging utility with configurable levels

import { SettingsManager } from "./settings";

export enum LogLevel {
    ERROR = 0,
    INFO = 1,
    DEBUG = 2,
    TRACE = 3
}

export class Logger {
    private static currentLevel: LogLevel = LogLevel.INFO;
    private static initialized = false;

    /**
     * Initialize logger with settings
     */
    static async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Start with default level, will be updated by SettingsManager later
            this.currentLevel = LogLevel.INFO;
            this.initialized = true;

            Logger.info("[Logger] Logger initialized with default level:", LogLevel[this.currentLevel]);
        } catch (error) {
            // Fallback to default
            this.currentLevel = LogLevel.INFO;
            console.warn("[Logger] Failed to initialize:", error);
        }
    }

    /**
     * Set logging level and persist to settings
     */
    static async setLevel(level: LogLevel): Promise<void> {
        this.currentLevel = level;
        try {
            await SettingsManager.setSetting('logLevel', level);
            Logger.debug("[Logger] Log level set to:", LogLevel[level]);
        } catch (error) {
            Logger.error("[Logger] Failed to persist log level:", error);
        }
    }

    /**
     * Set logging level without persisting to settings (for internal use)
     */
    static setLevelInternal(level: LogLevel): void {
        this.currentLevel = level;
        Logger.debug("[Logger] Log level set internally to:", LogLevel[level]);
    }

    /**
     * Get current logging level
     */
    static getLevel(): LogLevel {
        return this.currentLevel;
    }

    /**
     * Check if a level should be logged
     */
    private static shouldLog(level: LogLevel): boolean {
        return this.currentLevel >= level;
    }

    /**
     * Format log message with timestamp and level
     */
    private static formatMessage(level: string, args: any[]): string {
        const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
        return `[${timestamp}] [${level}]`;
    }

    /**
     * Log error messages
     */
    static error(...args: any[]): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage('ERROR', args), ...args);
        }
    }

    /**
     * Log info messages
     */
    static info(...args: any[]): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', args), ...args);
        }
    }

    /**
     * Log warning messages
     */
    static warn(...args: any[]): void {
        if (this.shouldLog(LogLevel.INFO)) { // Warnings show at INFO level
            console.warn(this.formatMessage('WARN', args), ...args);
        }
    }

    /**
     * Log debug messages
     */
    static debug(...args: any[]): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.formatMessage('DEBUG', args), ...args);
        }
    }

    /**
     * Log trace messages
     */
    static trace(...args: any[]): void {
        if (this.shouldLog(LogLevel.TRACE)) {
            console.log(this.formatMessage('TRACE', args), ...args);
        }
    }

    // Context-specific convenience methods
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

    static settings(...args: any[]): void {
        this.debug('[Settings]', ...args);
    }

    /**
     * Create a contextual logger for a specific component
     */
    static createContextLogger(context: string) {
        return {
            error: (...args: any[]) => this.error(`[${context}]`, ...args),
            info: (...args: any[]) => this.info(`[${context}]`, ...args),
            warn: (...args: any[]) => this.warn(`[${context}]`, ...args),
            debug: (...args: any[]) => this.debug(`[${context}]`, ...args),
            trace: (...args: any[]) => this.trace(`[${context}]`, ...args),
        };
    }

    /**
     * Get logger statistics (for debugging)
     */
    static getStats() {
        return {
            currentLevel: this.currentLevel,
            levelName: LogLevel[this.currentLevel],
            initialized: this.initialized,
        };
    }
}