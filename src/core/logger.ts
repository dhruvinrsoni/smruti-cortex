// logging.ts — Spring Boot-style centralized logging with enforced patterns

import { SettingsManager } from "./settings";

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export interface LogContext {
    className: string;
    methodName?: string;
    userId?: string;
    sessionId?: string;
    correlationId?: string;
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    levelName: string;
    context: LogContext;
    message: string;
    data?: any;
    error?: Error;
}

export class Logger {
    private static currentLevel: LogLevel = LogLevel.INFO; // Default to INFO for production
    private static initialized = false;
    private static logBuffer: LogEntry[] = [];
    private static readonly MAX_BUFFER_SIZE = 1000;

    /**
     * Initialize logger - FAST: marks as initialized immediately
     * Async loading of saved level happens in background
     */
    static async init(): Promise<void> {
        // Already initialized - skip
        if (this.initialized) return;

        // Mark as initialized immediately with default INFO level
        this.initialized = true;
        this.currentLevel = LogLevel.INFO;

        // Load saved log level in background (non-blocking)
        try {
            await SettingsManager.init();
            const savedLogLevel = SettingsManager.getSetting('logLevel');
            if (typeof savedLogLevel === 'number' && savedLogLevel >= 0 && savedLogLevel <= 4) {
                this.currentLevel = savedLogLevel;
            }
        } catch (error) {
            // Settings not available yet, keep default INFO level
            // Don't log here to avoid recursion
        }

        this.info("Logger", "init", "Logger initialized with Spring Boot-style logging", {
            currentLevel: LogLevel[this.currentLevel],
            pattern: "timestamp [LEVEL] [className.methodName] - message"
        });
    }

    /**
     * Set logging level with persistence
     */
    static async setLevel(level: LogLevel): Promise<void> {
        const oldLevel = this.currentLevel;
        this.currentLevel = level;

        try {
            await SettingsManager.setSetting('logLevel', level);
            this.info("Logger", "setLevel", "Log level changed", {
                from: LogLevel[oldLevel],
                to: LogLevel[level]
            });
        } catch (error) {
            this.error("Logger", "setLevel", "Failed to persist log level", { error: error.message });
        }
    }

    /**
     * Set logging level internally (no persistence)
     */
    static setLevelInternal(level: LogLevel): void {
        this.currentLevel = level;
        this.debug("Logger", "setLevelInternal", "Log level set internally", {
            level: LogLevel[level]
        });
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
     * Format timestamp in local time zone (ISO-like format without 'Z')
     */
    private static formatLocalTimestamp(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
    }

    /**
     * Format log entry in Spring Boot style
     */
    private static formatLogEntry(entry: LogEntry): string {
        const contextStr = entry.context.methodName
            ? `${entry.context.className}.${entry.context.methodName}`
            : entry.context.className;

        let formatted = `${entry.timestamp} [${entry.levelName}] [${contextStr}] - ${entry.message}`;

        if (entry.data) {
            formatted += ` | data=${JSON.stringify(entry.data)}`;
        }

        if (entry.error) {
            formatted += ` | error=${entry.error.message}`;
            // Include stack trace for DEBUG level and above
            if (this.currentLevel >= LogLevel.DEBUG && entry.error.stack) {
                formatted += `\nStack Trace:\n${entry.error.stack}`;
            }
        }

        return formatted;
    }

    /**
     * Create and log an entry
     */
    private static log(level: LogLevel, context: LogContext, message: string, data?: any, error?: Error): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: this.formatLocalTimestamp(),
            level,
            levelName: LogLevel[level],
            context,
            message,
            data,
            error
        };

        // Buffer for potential future use (metrics, etc.)
        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
            this.logBuffer.shift();
        }

        // Output to console with appropriate method
        const formatted = this.formatLogEntry(entry);

        switch (level) {
            case LogLevel.ERROR:
                console.error(formatted);
                break;
            case LogLevel.WARN:
                console.warn(formatted);
                break;
            case LogLevel.INFO:
                console.info(formatted);
                break;
            case LogLevel.DEBUG:
            case LogLevel.TRACE:
                console.log(formatted); // Changed from console.debug() to console.log() for better visibility
                break;
        }
    }

    // ===== SPRING BOOT-STYLE LOGGING METHODS =====

    /**
     * Log ERROR level message
     * Pattern: timestamp [ERROR] [className.methodName] - message | data={} | error=message
     */
    static error(...args: any[]): void {
        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            // New pattern: error(className, methodName, message, data?, error?)
            this.log(LogLevel.ERROR, { className: args[0], methodName: args[1] }, args[2], args[3], args[4]);
        } else {
            // Old pattern: error(message, data?, error?) - use "Unknown" as className
            this.log(LogLevel.ERROR, { className: "Unknown", methodName: "unknown" }, args[0], args[1], args[2]);
        }
    }

    /**
     * Log WARN level message
     * Pattern: timestamp [WARN] [className.methodName] - message | data={}
     */
    static warn(...args: any[]): void {
        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            // New pattern: warn(className, methodName, message, data?)
            this.log(LogLevel.WARN, { className: args[0], methodName: args[1] }, args[2], args[3]);
        } else {
            // Old pattern: warn(message, data?) - use "Unknown" as className
            this.log(LogLevel.WARN, { className: "Unknown", methodName: "unknown" }, args[0], args[1]);
        }
    }

    /**
     * Log INFO level message
     * Pattern: timestamp [INFO] [className.methodName] - message | data={}
     */
    static info(...args: any[]): void {
        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            // New pattern: info(className, methodName, message, data?)
            this.log(LogLevel.INFO, { className: args[0], methodName: args[1] }, args[2], args[3]);
        } else {
            // Old pattern: info(message, data?) - use "Unknown" as className
            this.log(LogLevel.INFO, { className: "Unknown", methodName: "unknown" }, args[0], args[1]);
        }
    }

    /**
     * Log DEBUG level message
     * Pattern: timestamp [DEBUG] [className.methodName] - message | data={}
     */
    static debug(...args: any[]): void {
        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            // New pattern: debug(className, methodName, message, data?)
            this.log(LogLevel.DEBUG, { className: args[0], methodName: args[1] }, args[2], args[3]);
        } else {
            // Old pattern: debug(message, data?) - use "Unknown" as className
            this.log(LogLevel.DEBUG, { className: "Unknown", methodName: "unknown" }, args[0], args[1]);
        }
    }

    /**
     * Log TRACE level message
     * Pattern: timestamp [TRACE] [className.methodName] - message | data={}
     */
    static trace(...args: any[]): void {
        if (args.length >= 3 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            // New pattern: trace(className, methodName, message, data?)
            this.log(LogLevel.TRACE, { className: args[0], methodName: args[1] }, args[2], args[3]);
        } else {
            // Old pattern: trace(message, data?) - use "Unknown" as className
            this.log(LogLevel.TRACE, { className: "Unknown", methodName: "unknown" }, args[0], args[1]);
        }
    }

    // ===== COMPONENT-SPECIFIC LOGGERS =====

    /**
     * Create a component-specific logger (Spring Boot style)
     * Usage: const logger = Logger.forComponent("PopupScript");
     *        logger.info("initialize", "Popup initialized", { version: "1.0" });
     */
    static forComponent(className: string): ComponentLogger {
        return new ComponentLogger(className);
    }

    /**
     * Get logger statistics
     */
    static getStats() {
        return {
            currentLevel: this.currentLevel,
            levelName: LogLevel[this.currentLevel],
            initialized: this.initialized,
            bufferSize: this.logBuffer.length,
            maxBufferSize: this.MAX_BUFFER_SIZE
        };
    }

    /**
     * Clear log buffer
     */
    static clearBuffer(): void {
        this.logBuffer = [];
    }

    /**
     * Get recent log entries
     */
    static getRecentLogs(count: number = 50): LogEntry[] {
        return this.logBuffer.slice(-count);
    }
}

/**
 * Component-specific logger following Spring Boot patterns
 */
export class ComponentLogger {
    constructor(private className: string) {}

    error(methodName: string, message: string, data?: any, error?: Error): void {
        Logger.error(this.className, methodName, message, data, error);
    }

    warn(methodName: string, message: string, data?: any): void {
        Logger.warn(this.className, methodName, message, data);
    }

    info(methodName: string, message: string, data?: any): void {
        Logger.info(this.className, methodName, message, data);
    }

    debug(methodName: string, message: string, data?: any): void {
        Logger.debug(this.className, methodName, message, data);
    }

    trace(methodName: string, message: string, data?: any): void {
        Logger.trace(this.className, methodName, message, data);
    }
}

// ===== LEGACY COMPATIBILITY METHODS =====
// These maintain backward compatibility but are deprecated

/**
 * @deprecated Use Logger.forComponent("ComponentName").info() instead
 */
export function createContextLogger(context: string) {
    return Logger.forComponent(context);
}