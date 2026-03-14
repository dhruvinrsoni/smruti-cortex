import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SettingsManager - must be before importing Logger
vi.mock('../settings', () => {
  const mockGetSetting = vi.fn().mockReturnValue(2); // default INFO level
  const mockSetSetting = vi.fn();
  const mockInit = vi.fn().mockResolvedValue(undefined);
  return {
    SettingsManager: {
      init: mockInit,
      getSetting: mockGetSetting,
      setSetting: mockSetSetting,
      isInitialized: vi.fn().mockReturnValue(true),
    },
    DisplayMode: { LIST: 'list', CARDS: 'cards' },
  };
});

// Logger has static state — use vi.resetModules() to isolate tests
describe('Logger', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-register the mock after resetModules
    vi.mock('../settings', () => {
      const mockGetSetting = vi.fn().mockReturnValue(2);
      const mockSetSetting = vi.fn();
      const mockInit = vi.fn().mockResolvedValue(undefined);
      return {
        SettingsManager: {
          init: mockInit,
          getSetting: mockGetSetting,
          setSetting: mockSetSetting,
          isInitialized: vi.fn().mockReturnValue(true),
        },
        DisplayMode: { LIST: 'list', CARDS: 'cards' },
      };
    });
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', async () => {
      const { LogLevel } = await import('../logger');
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
      expect(LogLevel.TRACE).toBe(4);
    });
  });

  describe('getLevel / setLevelInternal', () => {
    it('should default to INFO level (2)', async () => {
      const { Logger, LogLevel } = await import('../logger');
      expect(Logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should change level with setLevelInternal', async () => {
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      expect(Logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should change level to ERROR', async () => {
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      expect(Logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('logging methods — new pattern (className, methodName, message)', () => {
    it('should call console.info for Logger.info at INFO level', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2); // INFO
      Logger.info('TestClass', 'testMethod', 'hello test message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call console.error for Logger.error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(0); // ERROR only
      Logger.error('TestClass', 'testMethod', 'error occurred');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call console.warn for Logger.warn', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(1); // WARN
      Logger.warn('TestClass', 'testMethod', 'warning message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call console.log for Logger.debug at DEBUG level', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      Logger.debug('TestClass', 'testMethod', 'debug message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call console.log for Logger.trace at TRACE level', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.TRACE);
      Logger.trace('TestClass', 'testMethod', 'trace message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('logging methods — old pattern (message, data?)', () => {
    it('should call console.info for old-style Logger.info(message)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('old style message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('level filtering', () => {
    it('should NOT log DEBUG when level is INFO', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.INFO);
      Logger.debug('TestClass', 'testMethod', 'should be suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should NOT log TRACE when level is WARN', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      Logger.trace('TestClass', 'testMethod', 'should be suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log ERROR when level is WARN', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      Logger.error('TestClass', 'testMethod', 'error always logs');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('buffer management', () => {
    it('should buffer log entries', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('TestClass', 'testMethod', 'test buffer');
      const logs = Logger.getRecentLogs(10);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should clear buffer with clearBuffer()', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('TestClass', 'testMethod', 'before clear');
      Logger.clearBuffer();
      expect(Logger.getRecentLogs()).toHaveLength(0);
    });

    it('should return stats with current level and buffer info', async () => {
      const { Logger } = await import('../logger');
      const stats = Logger.getStats();
      expect(stats).toHaveProperty('currentLevel');
      expect(stats).toHaveProperty('levelName');
      expect(stats).toHaveProperty('initialized');
      expect(stats).toHaveProperty('bufferSize');
      expect(stats).toHaveProperty('maxBufferSize');
    });
  });

  describe('forComponent', () => {
    it('should return a ComponentLogger with error/warn/info/debug/trace methods', async () => {
      const { Logger } = await import('../logger');
      const componentLogger = Logger.forComponent('MyComponent');
      expect(typeof componentLogger.info).toBe('function');
      expect(typeof componentLogger.warn).toBe('function');
      expect(typeof componentLogger.error).toBe('function');
      expect(typeof componentLogger.debug).toBe('function');
      expect(typeof componentLogger.trace).toBe('function');
    });

    it('should call Logger methods when ComponentLogger methods are called', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      const comp = Logger.forComponent('MyComp');
      comp.info('doSomething', 'component message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call Logger.error when ComponentLogger.error is called with error object', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      const comp = Logger.forComponent('MyComp');
      comp.error('myMethod', 'error occurred', { detail: 'data' }, new Error('test err'));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call Logger.warn via ComponentLogger.warn', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      const comp = Logger.forComponent('WarningComp');
      comp.warn('method', 'warning here');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log debug via ComponentLogger.debug at DEBUG level', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      const comp = Logger.forComponent('DebugComp');
      comp.debug('method', 'debug info');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log trace via ComponentLogger.trace at TRACE level', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.TRACE);
      const comp = Logger.forComponent('TraceComp');
      comp.trace('method', 'trace detail');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setLevel (async, persists to settings)', () => {
    it('should update level and call SettingsManager.setSetting', async () => {
      const { Logger, LogLevel } = await import('../logger');
      const { SettingsManager } = await import('../settings');
      vi.spyOn(console, 'info').mockImplementation(() => {});
      await Logger.setLevel(LogLevel.DEBUG);
      expect(Logger.getLevel()).toBe(LogLevel.DEBUG);
      expect(SettingsManager.setSetting).toHaveBeenCalledWith('logLevel', LogLevel.DEBUG);
    });

    it('handles setSetting error gracefully', async () => {
      const { Logger, LogLevel } = await import('../logger');
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.setSetting).mockRejectedValueOnce(new Error('storage full'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(Logger.setLevel(LogLevel.WARN)).resolves.not.toThrow();
    });
  });

  describe('createContextLogger (legacy)', () => {
    it('should return a ComponentLogger', async () => {
      const { createContextLogger } = await import('../logger');
      const logger = createContextLogger('LegacyComp');
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('old-pattern fallback paths (fewer than 3 args or non-string first args)', () => {
    it('Logger.error with 1 string arg uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      expect(() => Logger.error('just a message')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.error with 2 args uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      expect(() => Logger.error('msg', { data: 1 })).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.warn with 1 string arg uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      expect(() => Logger.warn('just a message')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.warn with 2 args uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      expect(() => Logger.warn('msg', { data: 1 })).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.debug with 1 string arg uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      consoleSpy.mockClear(); // discard the setLevelInternal log call
      expect(() => Logger.debug('just a message')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.debug with 2 args uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      consoleSpy.mockClear(); // discard the setLevelInternal log call
      expect(() => Logger.debug('msg', { data: 1 })).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.trace with 1 string arg uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.TRACE);
      consoleSpy.mockClear(); // discard the setLevelInternal log call
      expect(() => Logger.trace('just a message')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });

    it('Logger.trace with 2 args uses Unknown.unknown and does not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.TRACE);
      consoleSpy.mockClear(); // discard the setLevelInternal log call
      expect(() => Logger.trace('msg', { data: 1 })).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('[Unknown.unknown]');
      consoleSpy.mockRestore();
    });
  });
});
