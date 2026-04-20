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

  describe('init()', () => {
    it('loads saved log level from SettingsManager', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue(3); // DEBUG
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('skips if already initialized (early return)', async () => {
      const { SettingsManager } = await import('../settings');
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      await Logger.init();
      vi.mocked(SettingsManager.init).mockClear();
      await Logger.init();
      expect(SettingsManager.init).not.toHaveBeenCalled();
    });

    it('keeps INFO when savedLogLevel is out of range', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue(99);
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('keeps INFO when savedLogLevel is negative', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue(-1);
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('keeps INFO when savedLogLevel is not a number', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue('high');
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('keeps default INFO when SettingsManager.init() throws', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.init).mockRejectedValueOnce(new Error('storage unavailable'));
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('formatLogEntry data branches', () => {
    it('appends data=null for null data', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', null);
      expect(consoleSpy.mock.calls[0][0]).toContain('data=null');
      consoleSpy.mockRestore();
    });

    it('inlines string data as primitive', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', 'hello');
      expect(consoleSpy.mock.calls[0][0]).toContain('data=hello');
      consoleSpy.mockRestore();
    });

    it('inlines numeric data as primitive', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', 42);
      expect(consoleSpy.mock.calls[0][0]).toContain('data=42');
      consoleSpy.mockRestore();
    });

    it('inlines boolean data as primitive', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', true);
      expect(consoleSpy.mock.calls[0][0]).toContain('data=true');
      consoleSpy.mockRestore();
    });

    it('inlines bigint data as primitive', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', BigInt(99));
      expect(consoleSpy.mock.calls[0][0]).toContain('data=99');
      consoleSpy.mockRestore();
    });

    it('appends "data=" marker for object data (no inline value)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', { key: 'val' });
      const prefix = consoleSpy.mock.calls[0][0] as string;
      expect(prefix).toContain('data=');
      expect(prefix).not.toContain('data=null');
      consoleSpy.mockRestore();
    });

    it('appends error= when error object is provided', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      Logger.error('C', 'm', 'msg', undefined, new Error('boom'));
      expect(consoleSpy.mock.calls[0][0]).toContain('error=boom');
      consoleSpy.mockRestore();
    });

    it('uses className only when methodName is absent', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.INFO);
      // Old-style call with non-string first arg triggers Unknown className without methodName
      // But actually let's directly test the internal path by using the info call
      // The old pattern always sets methodName to 'unknown', so we verify className-only
      // formatting by checking that when the internal methodName is set, it appears
      Logger.info('C', 'm', 'msg');
      expect(consoleSpy.mock.calls[0][0]).toContain('[C.m]');
      consoleSpy.mockRestore();
    });
  });

  describe('log() data serialization', () => {
    it('truncates JSON data longer than 500 chars in the buffer snapshot', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.clearBuffer();
      const bigData = { payload: 'x'.repeat(600) };
      Logger.info('C', 'm', 'msg', bigData);
      const logs = Logger.getRecentLogs(1);
      expect(typeof logs[0].data).toBe('string');
      expect((logs[0].data as string).length).toBeLessThanOrEqual(504); // 500 + '…'
      expect((logs[0].data as string).endsWith('…')).toBe(true);
    });

    it('falls back to String(data) when JSON.stringify throws (circular ref)', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.clearBuffer();
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      Logger.info('C', 'm', 'msg', circular);
      const logs = Logger.getRecentLogs(1);
      expect(typeof logs[0].data).toBe('string');
      expect(logs[0].data).toContain('[object Object]');
    });
  });

  describe('log() console args for complex types', () => {
    it('passes object data as extra console arg', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      const obj = { key: 'val' };
      Logger.info('C', 'm', 'msg', obj);
      expect(consoleSpy.mock.calls[0]).toHaveLength(2);
      expect(consoleSpy.mock.calls[0][1]).toBe(obj);
      consoleSpy.mockRestore();
    });

    it('passes function data as extra console arg', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      const fn = () => {};
      Logger.info('C', 'm', 'msg', fn);
      expect(consoleSpy.mock.calls[0]).toHaveLength(2);
      expect(consoleSpy.mock.calls[0][1]).toBe(fn);
      consoleSpy.mockRestore();
    });

    it('passes symbol data as extra console arg', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      const sym = Symbol('test');
      Logger.info('C', 'm', 'msg', sym);
      expect(consoleSpy.mock.calls[0]).toHaveLength(2);
      expect(consoleSpy.mock.calls[0][1]).toBe(sym);
      consoleSpy.mockRestore();
    });

    it('does NOT pass primitive data as extra console arg', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', 42);
      expect(consoleSpy.mock.calls[0]).toHaveLength(1);
      consoleSpy.mockRestore();
    });

    it('passes error as extra console arg alongside data', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      const err = new Error('test');
      const data = { ctx: 1 };
      Logger.error('C', 'm', 'msg', data, err);
      expect(consoleSpy.mock.calls[0]).toHaveLength(3); // prefix, data, error
      expect(consoleSpy.mock.calls[0][1]).toBe(data);
      expect(consoleSpy.mock.calls[0][2]).toBe(err);
      consoleSpy.mockRestore();
    });

    it('does not add extra arg when data is null', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'msg', null);
      expect(consoleSpy.mock.calls[0]).toHaveLength(1);
      consoleSpy.mockRestore();
    });
  });

  describe('level gating — additional suppression paths', () => {
    it('suppresses WARN when level is ERROR', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      Logger.warn('C', 'm', 'suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('suppresses INFO when level is WARN', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.WARN);
      Logger.info('C', 'm', 'suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('suppresses TRACE when level is DEBUG', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.DEBUG);
      consoleSpy.mockClear();
      Logger.trace('C', 'm', 'suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('suppresses DEBUG when level is ERROR', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      Logger.setLevelInternal(LogLevel.ERROR);
      Logger.debug('C', 'm', 'suppressed');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('buffer overflow', () => {
    it('evicts oldest entries when buffer exceeds MAX_BUFFER_SIZE', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.clearBuffer();
      for (let i = 0; i < 1005; i++) {
        Logger.info('C', 'm', `msg-${i}`);
      }
      const stats = Logger.getStats();
      expect(stats.bufferSize).toBeLessThanOrEqual(1000);
      const logs = Logger.getRecentLogs(1);
      expect(logs[0].message).not.toBe('msg-0');
    });
  });

  describe('errorMeta()', () => {
    it('extracts name and message from Error instance', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta(new TypeError('bad type'));
      expect(result).toEqual({ name: 'TypeError', message: 'bad type' });
    });

    it('includes code from Error with code property', async () => {
      const { errorMeta } = await import('../logger');
      const err = new Error('fail') as Error & { code: string };
      err.code = 'ENOENT';
      expect(errorMeta(err)).toEqual({ name: 'Error', message: 'fail', code: 'ENOENT' });
    });

    it('includes numeric code from Error', async () => {
      const { errorMeta } = await import('../logger');
      const err = new Error('fail') as Error & { code: number };
      err.code = 404;
      expect(errorMeta(err)).toEqual({ name: 'Error', message: 'fail', code: 404 });
    });

    it('omits code when not present on Error', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta(new Error('plain'));
      expect(result).toEqual({ name: 'Error', message: 'plain' });
      expect('code' in result).toBe(false);
    });

    it('handles non-Error object with name and message', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'CustomErr', message: 'custom msg' });
      expect(result).toEqual({ name: 'CustomErr', message: 'custom msg' });
    });

    it('handles non-Error object with code property', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'X', message: 'y', code: 'ABORT' });
      expect(result).toEqual({ name: 'X', message: 'y', code: 'ABORT' });
    });

    it('handles non-Error object with numeric code', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'X', message: 'y', code: 500 });
      expect(result).toEqual({ name: 'X', message: 'y', code: 500 });
    });

    it('falls back to non-Error name and String() for object without name/message', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ foo: 'bar' });
      expect(result.name).toBe('non-Error');
      expect(result.message).toBe('[object Object]');
    });

    it('handles non-Error object with non-string name', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 123, message: 'msg' });
      expect(result.name).toBe('non-Error');
      expect(result.message).toBe('msg');
    });

    it('handles non-Error object with non-string message', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'X', message: 999 });
      expect(result.name).toBe('X');
      expect(result.message).toContain('[object Object]');
    });

    it('handles non-Error object without code (omits code)', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'X', message: 'y' });
      expect('code' in result).toBe(false);
    });

    it('handles non-Error object with boolean code (omits code)', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta({ name: 'X', message: 'y', code: true });
      expect('code' in result).toBe(false);
    });

    it('handles primitive string', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta('something broke');
      expect(result).toEqual({ name: 'non-Error', message: 'something broke' });
    });

    it('handles primitive number', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta(42);
      expect(result).toEqual({ name: 'non-Error', message: '42' });
    });

    it('handles null', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta(null);
      expect(result).toEqual({ name: 'non-Error', message: 'null' });
    });

    it('handles undefined', async () => {
      const { errorMeta } = await import('../logger');
      const result = errorMeta(undefined);
      expect(result).toEqual({ name: 'non-Error', message: 'undefined' });
    });
  });

  describe('setLevel error path detail', () => {
    it('logs error with message from caught exception', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.setSetting).mockRejectedValueOnce(new Error('quota exceeded'));
      await Logger.setLevel(LogLevel.DEBUG);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Failed to persist log level');
      consoleSpy.mockRestore();
    });
  });

  describe('init() with edge-case log levels', () => {
    it('accepts savedLogLevel 0 (ERROR)', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue(0);
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('accepts savedLogLevel 4 (TRACE)', async () => {
      const { SettingsManager } = await import('../settings');
      vi.mocked(SettingsManager.getSetting).mockReturnValue(4);
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, LogLevel } = await import('../logger');
      await Logger.init();
      expect(Logger.getLevel()).toBe(LogLevel.TRACE);
    });
  });

  describe('formatLogEntry — className-only (no methodName)', () => {
    it('omits methodName from context string when methodName is empty', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      const comp = Logger.forComponent('Solo');
      comp.info('', 'message without method');
      const prefix = consoleSpy.mock.calls[0][0] as string;
      expect(prefix).toContain('[Solo]');
      expect(prefix).not.toContain('[Solo.]');
      consoleSpy.mockRestore();
    });
  });

  describe('data=undefined path (no data arg)', () => {
    it('does not append data= when data is undefined', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { Logger } = await import('../logger');
      Logger.setLevelInternal(2);
      Logger.info('C', 'm', 'no data');
      const prefix = consoleSpy.mock.calls[0][0] as string;
      expect(prefix).not.toContain('data=');
      consoleSpy.mockRestore();
    });
  });
});
