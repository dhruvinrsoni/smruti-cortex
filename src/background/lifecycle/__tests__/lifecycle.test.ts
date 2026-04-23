 
 
/**
 * Combined unit tests for lifecycle modules:
 *   - commands-listener.ts
 *   - port-messaging.ts
 *
 * Coverage targets: ~95% lines, 90% branches for both modules.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared hoisted state — accessible from vi.mock factories (hoisted above imports).
// ═══════════════════════════════════════════════════════════════════════════════
const state = vi.hoisted(() => ({
  tabsSendMessage: vi.fn(),
  tabsQuery: vi.fn(),
  scriptingExecuteScript: vi.fn(),
  alarmsCreate: vi.fn(),
  alarmsClear: vi.fn(),
  alarmsOnAlarmAdd: vi.fn(),
  runtimeOnStartupAdd: vi.fn(),
  runtimeOnInstalledAdd: vi.fn(),
  runtimeOnConnectAdd: vi.fn(),
  tabsOnActivatedAdd: vi.fn(),
  tabsOnUpdatedAdd: vi.fn(),
  commandsAdd: vi.fn(),
  openPopup: vi.fn(),
  runtimeLastError: null as { message: string } | null,
  commandsApi: true,
  // Port-messaging: mock search-engine
  mockRunSearch: vi.fn(),
  mockGetLastAIStatus: vi.fn(() => 'ok'),
}));

// Stable logger spy so tests can assert on aggregated debug output
// (e.g. the per-window rate-limit summary in port-messaging.ts).
const loggerSpies = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => loggerSpies,
  },
  errorMeta: (e: unknown) => ({ name: 'e', message: String(e) }),
}));

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    tabs: {
      sendMessage: (tabId: number, msg: unknown, cb: (r: unknown) => void) =>
        state.tabsSendMessage(tabId, msg, cb),
      query: (...a: unknown[]) => state.tabsQuery(...a),
      onActivated: { addListener: (cb: () => void) => state.tabsOnActivatedAdd(cb) },
      onUpdated: { addListener: (cb: () => void) => state.tabsOnUpdatedAdd(cb) },
    },
    scripting: {
      executeScript: (...a: unknown[]) => state.scriptingExecuteScript(...a),
    },
    runtime: {
      get lastError() {
        return state.runtimeLastError;
      },
      onStartup: { addListener: (cb: () => void) => state.runtimeOnStartupAdd(cb) },
      onInstalled: { addListener: (cb: () => void) => state.runtimeOnInstalledAdd(cb) },
      onConnect: { addListener: (cb: (port: any) => void) => state.runtimeOnConnectAdd(cb) },
    },
    get commands() {
      return state.commandsApi
        ? { onCommand: { addListener: (cb: (c: string) => void) => state.commandsAdd(cb) } }
        : undefined;
    },
    alarms: {
      create: (...a: unknown[]) => state.alarmsCreate(...a),
      clear: (...a: unknown[]) => state.alarmsClear(...a),
      onAlarm: { addListener: (cb: (a: { name: string }) => void) => state.alarmsOnAlarmAdd(cb) },
    },
    action: {
      openPopup: (...a: unknown[]) => state.openPopup(...a),
    },
  },
}));

vi.mock('../../search/search-engine', () => ({
  runSearch: (...a: unknown[]) => state.mockRunSearch(...a),
  getLastAIStatus: () => state.mockGetLastAIStatus(),
}));

function resetState() {
  state.tabsSendMessage = vi.fn();
  state.tabsQuery = vi.fn();
  state.scriptingExecuteScript = vi.fn();
  state.alarmsCreate = vi.fn();
  state.alarmsClear = vi.fn();
  state.alarmsOnAlarmAdd = vi.fn();
  state.runtimeOnStartupAdd = vi.fn();
  state.runtimeOnInstalledAdd = vi.fn();
  state.runtimeOnConnectAdd = vi.fn();
  state.tabsOnActivatedAdd = vi.fn();
  state.tabsOnUpdatedAdd = vi.fn();
  state.commandsAdd = vi.fn();
  state.openPopup = vi.fn();
  state.runtimeLastError = null;
  state.commandsApi = true;
  state.mockRunSearch = vi.fn().mockResolvedValue([{ id: 'r1' }]);
  state.mockGetLastAIStatus = vi.fn(() => 'ok');
  loggerSpies.debug.mockReset();
  loggerSpies.info.mockReset();
  loggerSpies.warn.mockReset();
  loggerSpies.error.mockReset();
  loggerSpies.trace.mockReset();
}

async function importFreshCommands(): Promise<typeof import('../commands-listener')> {
  vi.resetModules();
  return await import('../commands-listener');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: commands-listener.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('commands-listener', () => {
  beforeEach(() => {
    resetState();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // sendMessageWithTimeout
  // -------------------------------------------------------------------------
  describe('sendMessageWithTimeout', () => {
    it('resolves with the response when the callback fires', async () => {
      const { sendMessageWithTimeout } = await importFreshCommands();
      state.tabsSendMessage.mockImplementation(
        (_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          cb({ ok: true });
        },
      );
      await expect(sendMessageWithTimeout(1, { type: 'X' }, 100)).resolves.toEqual({ ok: true });
    });

    it('rejects when runtime.lastError is set', async () => {
      const { sendMessageWithTimeout } = await importFreshCommands();
      state.tabsSendMessage.mockImplementation(
        (_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          state.runtimeLastError = { message: 'Could not establish connection' };
          cb(undefined);
          state.runtimeLastError = null;
        },
      );
      await expect(sendMessageWithTimeout(1, { type: 'X' }, 500)).rejects.toThrow(
        'Could not establish connection',
      );
    });

    it('rejects on timeout when no response arrives', async () => {
      vi.useFakeTimers();
      const { sendMessageWithTimeout } = await importFreshCommands();
      state.tabsSendMessage.mockImplementation(() => {
        /* intentionally never call callback */
      });
      const p = sendMessageWithTimeout(1, { type: 'X' }, 50);
      const expectation = expect(p).rejects.toThrow('Content script response timeout');
      vi.advanceTimersByTime(100);
      await expectation;
    });

    it('uses default timeout of 500ms when not specified', async () => {
      vi.useFakeTimers();
      const { sendMessageWithTimeout } = await importFreshCommands();
      state.tabsSendMessage.mockImplementation(() => {
        /* never respond */
      });
      const p = sendMessageWithTimeout(1, { type: 'X' });
      const expectation = expect(p).rejects.toThrow('Content script response timeout');
      vi.advanceTimersByTime(501);
      await expectation;
    });
  });

  // -------------------------------------------------------------------------
  // reinjectContentScript
  // -------------------------------------------------------------------------
  describe('reinjectContentScript', () => {
    it('returns true when executeScript succeeds', async () => {
      const { reinjectContentScript } = await importFreshCommands();
      state.scriptingExecuteScript.mockResolvedValue([]);
      await expect(reinjectContentScript(42)).resolves.toBe(true);
      expect(state.scriptingExecuteScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ['content_scripts/quick-search.js'],
      });
    });

    it('returns false when executeScript throws', async () => {
      const { reinjectContentScript } = await importFreshCommands();
      state.scriptingExecuteScript.mockRejectedValue(new Error('Cannot access page'));
      await expect(reinjectContentScript(42)).resolves.toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // registerCommandsListenerEarly
  // -------------------------------------------------------------------------
  describe('registerCommandsListenerEarly', () => {
    it('should not register if commands.onCommand is missing', async () => {
      state.commandsApi = false;
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      expect(state.commandsAdd).not.toHaveBeenCalled();
    });

    it('should not register twice (idempotent)', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      registerCommandsListenerEarly();
      expect(state.commandsAdd).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-open-popup commands', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('toggle-sidebar');
      expect(state.tabsQuery).not.toHaveBeenCalled();
      expect(state.openPopup).not.toHaveBeenCalled();
    });

    it('Tier 1: message to existing content script succeeds → returns early', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 10, url: 'https://example.com' }]);
      state.tabsSendMessage.mockImplementation(
        (_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          cb({ success: true });
        },
      );
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.tabsSendMessage).toHaveBeenCalledTimes(1);
      expect(state.scriptingExecuteScript).not.toHaveBeenCalled();
      expect(state.openPopup).not.toHaveBeenCalled();
    });

    it('Tier 1 fails, Tier 2: re-inject + retry succeeds → returns', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 10, url: 'https://example.com' }]);
      state.tabsSendMessage
        .mockImplementationOnce((_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          state.runtimeLastError = { message: 'no receiver' };
          cb(undefined);
          state.runtimeLastError = null;
        })
        .mockImplementationOnce((_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          cb({ success: true });
        });
      state.scriptingExecuteScript.mockResolvedValue([]);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.tabsSendMessage).toHaveBeenCalledTimes(2);
      expect(state.scriptingExecuteScript).toHaveBeenCalledTimes(1);
      expect(state.openPopup).not.toHaveBeenCalled();
    });

    it('Tier 2: re-injection fails → opens popup', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 10, url: 'https://example.com' }]);
      state.tabsSendMessage.mockImplementation(
        (_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          state.runtimeLastError = { message: 'no receiver' };
          cb(undefined);
          state.runtimeLastError = null;
        },
      );
      state.scriptingExecuteScript.mockRejectedValue(new Error('injection failed'));
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.scriptingExecuteScript).toHaveBeenCalledTimes(1);
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('Tier 2: re-injection succeeds but retry message fails → opens popup', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 10, url: 'https://example.com' }]);
      state.tabsSendMessage.mockImplementation(
        (_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          state.runtimeLastError = { message: 'no receiver' };
          cb(undefined);
          state.runtimeLastError = null;
        },
      );
      state.scriptingExecuteScript.mockResolvedValue([]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('all tiers fail → opens popup as last resort', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockRejectedValue(new Error('tabs query failed'));
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('last-resort catch: openPopup also fails — swallowed silently', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockRejectedValue(new Error('tabs query failed'));
      state.openPopup.mockRejectedValue(new Error('popup also failed'));
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await expect(handler('open-popup')).resolves.toBeUndefined();
    });

    it('special page (chrome://) → opens popup directly', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5, url: 'chrome://settings' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.tabsSendMessage).not.toHaveBeenCalled();
      expect(state.scriptingExecuteScript).not.toHaveBeenCalled();
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('special page (edge://) → opens popup directly', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5, url: 'edge://settings' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('special page (about:) → opens popup directly', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5, url: 'about:blank' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('special page (chrome-extension://) → opens popup directly', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5, url: 'chrome-extension://abc/popup.html' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('special page (moz-extension://) → opens popup directly', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5, url: 'moz-extension://abc/popup.html' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('tab with no id → opens popup', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ url: 'https://example.com' }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('tab with no url → opens popup', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 5 }]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });

    it('Tier 1 returns response without success → falls through to Tier 2', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([{ id: 10, url: 'https://example.com' }]);
      state.tabsSendMessage
        .mockImplementationOnce((_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          cb({ other: 'data' });
        })
        .mockImplementationOnce((_id: number, _msg: unknown, cb: (r: unknown) => void) => {
          cb({ success: true });
        });
      state.scriptingExecuteScript.mockResolvedValue([]);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.tabsSendMessage).toHaveBeenCalledTimes(2);
      expect(state.scriptingExecuteScript).toHaveBeenCalledTimes(1);
      expect(state.openPopup).not.toHaveBeenCalled();
    });

    it('empty tab array → opens popup (special page branch)', async () => {
      const { registerCommandsListenerEarly } = await importFreshCommands();
      registerCommandsListenerEarly();
      state.tabsQuery.mockResolvedValue([]);
      state.openPopup.mockResolvedValue(undefined);
      const handler = state.commandsAdd.mock.calls[0][0] as (c: string) => Promise<void>;
      await handler('open-popup');
      expect(state.openPopup).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // keepServiceWorkerAlive
  // -------------------------------------------------------------------------
  describe('keepServiceWorkerAlive', () => {
    it('should create one main alarm at active cadence (0.5 min)', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      // Collapsed from the previous 3-alarm setup to a single main alarm:
      // the old keep-alive-2 / keep-alive-3 added no uptime gain beyond
      // the 30 s cadence of keep-alive-1 and multiplied battery cost on
      // idle laptops. See module docstring for details.
      expect(state.alarmsCreate).toHaveBeenCalledTimes(1);
      expect(state.alarmsCreate).toHaveBeenCalledWith(
        'keep-alive-main',
        expect.objectContaining({ delayInMinutes: 0.5, periodInMinutes: 0.5 }),
      );
    });

    it('should clear legacy keep-alive-1/2/3 alarms left by older versions', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      expect(state.alarmsClear).toHaveBeenCalledWith('keep-alive-1');
      expect(state.alarmsClear).toHaveBeenCalledWith('keep-alive-2');
      expect(state.alarmsClear).toHaveBeenCalledWith('keep-alive-3');
    });

    it('should register alarm listener', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      expect(state.alarmsOnAlarmAdd).toHaveBeenCalledTimes(1);
    });

    it('alarm listener handles both matching and non-matching alarm names', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      expect(() => cb({ name: 'keep-alive-main' })).not.toThrow();
      expect(() => cb({ name: 'unrelated-alarm' })).not.toThrow();
    });

    it('alarm tick with recent interaction stays in active mode', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      state.alarmsCreate.mockClear();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      // Very recent interaction (< 30 min) → no mode change.
      mod.__testing.setLastUserInteractionAt(Date.now() - 5_000);
      cb({ name: 'keep-alive-main' });
      expect(mod.__testing.getCurrentAlarmMode()).toBe('active');
      expect(state.alarmsCreate).not.toHaveBeenCalled();
    });

    it('alarm tick after 30+ min idle downshifts to idle cadence (5 min)', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      state.alarmsCreate.mockClear();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      // Simulate the user having been idle for 31 min.
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      cb({ name: 'keep-alive-main' });
      expect(mod.__testing.getCurrentAlarmMode()).toBe('idle');
      expect(state.alarmsCreate).toHaveBeenCalledWith(
        'keep-alive-main',
        expect.objectContaining({ delayInMinutes: 5, periodInMinutes: 5 }),
      );
    });

    it('alarm tick while already in idle mode is a no-op (no alarm thrash)', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      // First tick: transition to idle.
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      cb({ name: 'keep-alive-main' });
      state.alarmsCreate.mockClear();
      // Second tick while still idle must not re-create the alarm —
      // `setAlarmMode` is idempotent by design.
      cb({ name: 'keep-alive-main' });
      expect(state.alarmsCreate).not.toHaveBeenCalled();
      expect(mod.__testing.getCurrentAlarmMode()).toBe('idle');
    });

    it('alarm tick with non-main keep-alive name does not trigger mode switch', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      state.alarmsCreate.mockClear();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      cb({ name: 'keep-alive-restart' });
      // Startup/install seed alarms run on their own fixed cadence and
      // are explicitly filtered out of the active/idle state machine.
      expect(state.alarmsCreate).not.toHaveBeenCalled();
      expect(mod.__testing.getCurrentAlarmMode()).toBe('active');
    });

    it('recordUserInteraction bumps timestamp and snaps idle→active', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      const cb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      // Move into idle first.
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      cb({ name: 'keep-alive-main' });
      expect(mod.__testing.getCurrentAlarmMode()).toBe('idle');
      state.alarmsCreate.mockClear();

      const before = mod.__testing.getLastUserInteractionAt();
      // Force a measurable wall-clock gap.
      await new Promise((r) => setTimeout(r, 2));
      mod.recordUserInteraction();

      expect(mod.__testing.getLastUserInteractionAt()).toBeGreaterThan(before);
      expect(mod.__testing.getCurrentAlarmMode()).toBe('active');
      expect(state.alarmsCreate).toHaveBeenCalledWith(
        'keep-alive-main',
        expect.objectContaining({ delayInMinutes: 0.5, periodInMinutes: 0.5 }),
      );
    });

    it('recordUserInteraction while already active only bumps timestamp (no alarm churn)', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      state.alarmsCreate.mockClear();
      const before = mod.__testing.getLastUserInteractionAt();
      await new Promise((r) => setTimeout(r, 2));
      mod.recordUserInteraction();
      expect(mod.__testing.getLastUserInteractionAt()).toBeGreaterThan(before);
      expect(state.alarmsCreate).not.toHaveBeenCalled();
    });

    it('should register onStartup listener that creates restart alarm', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      expect(state.runtimeOnStartupAdd).toHaveBeenCalledTimes(1);
      state.alarmsCreate.mockClear();
      const onStartup = state.runtimeOnStartupAdd.mock.calls[0][0] as () => void;
      onStartup();
      expect(state.alarmsCreate).toHaveBeenCalledWith(
        'keep-alive-restart',
        expect.objectContaining({ delayInMinutes: 0.1, periodInMinutes: 0.5 }),
      );
    });

    it('should register onInstalled listener that creates install alarm', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      expect(state.runtimeOnInstalledAdd).toHaveBeenCalledTimes(1);
      state.alarmsCreate.mockClear();
      const onInstalled = state.runtimeOnInstalledAdd.mock.calls[0][0] as () => void;
      onInstalled();
      expect(state.alarmsCreate).toHaveBeenCalledWith(
        'keep-alive-install',
        expect.objectContaining({ delayInMinutes: 0.1, periodInMinutes: 0.5 }),
      );
    });

    it('should register tab activated and updated listeners', async () => {
      const { keepServiceWorkerAlive } = await importFreshCommands();
      keepServiceWorkerAlive();
      expect(state.tabsOnActivatedAdd).toHaveBeenCalledTimes(1);
      expect(state.tabsOnUpdatedAdd).toHaveBeenCalledTimes(1);
    });

    it('tab listeners record user interaction (feeds idle/active switch)', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      const onActivated = state.tabsOnActivatedAdd.mock.calls[0][0] as () => void;
      const onUpdated = state.tabsOnUpdatedAdd.mock.calls[0][0] as () => void;
      // Put us into idle mode first.
      const alarmCb = state.alarmsOnAlarmAdd.mock.calls[0][0] as (a: { name: string }) => void;
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      alarmCb({ name: 'keep-alive-main' });
      expect(mod.__testing.getCurrentAlarmMode()).toBe('idle');
      // Either listener should snap us back to active.
      expect(() => onActivated()).not.toThrow();
      expect(mod.__testing.getCurrentAlarmMode()).toBe('active');
      // Reset to idle and try the other listener.
      mod.__testing.setLastUserInteractionAt(Date.now() - (31 * 60 * 1000));
      alarmCb({ name: 'keep-alive-main' });
      expect(mod.__testing.getCurrentAlarmMode()).toBe('idle');
      expect(() => onUpdated()).not.toThrow();
      expect(mod.__testing.getCurrentAlarmMode()).toBe('active');
    });

    it('onStartup listener seeds restart alarm and bumps interaction timestamp', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      // Pretend idle so we can detect the bump.
      mod.__testing.setLastUserInteractionAt(0);
      const onStartup = state.runtimeOnStartupAdd.mock.calls[0][0] as () => void;
      onStartup();
      expect(mod.__testing.getLastUserInteractionAt()).toBeGreaterThan(0);
    });

    it('onInstalled listener seeds install alarm and bumps interaction timestamp', async () => {
      const mod = await importFreshCommands();
      mod.keepServiceWorkerAlive();
      mod.__testing.setLastUserInteractionAt(0);
      const onInstalled = state.runtimeOnInstalledAdd.mock.calls[0][0] as () => void;
      onInstalled();
      expect(mod.__testing.getLastUserInteractionAt()).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: port-messaging.ts
// ═══════════════════════════════════════════════════════════════════════════════

import { setupPortBasedMessaging } from '../port-messaging';

type Msg = Record<string, unknown>;

interface TestPort {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  onMessage: { addListener: (cb: (m: Msg) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
  send: (m: Msg) => Promise<void>;
  disconnect: () => void;
  _messageHandlers: ((m: Msg) => void)[];
  _disconnectHandlers: (() => void)[];
}

function createTestPort(name: string): TestPort {
  const messageHandlers: ((m: Msg) => void)[] = [];
  const disconnectHandlers: (() => void)[] = [];
  return {
    name,
    postMessage: vi.fn(),
    onMessage: {
      addListener: (cb) => messageHandlers.push(cb),
    },
    onDisconnect: {
      addListener: (cb) => disconnectHandlers.push(cb),
    },
    async send(m: Msg) {
      for (const h of messageHandlers) {
        await h(m);
      }
    },
    disconnect() {
      for (const h of disconnectHandlers) {h();}
    },
    _messageHandlers: messageHandlers,
    _disconnectHandlers: disconnectHandlers,
  };
}

async function flushMicrotasks() {
  // Dynamic imports (inside the handler) may need more ticks to settle,
  // especially after vi.resetModules() from earlier test suites.
  for (let i = 0; i < 10; i++) {await Promise.resolve();}
}

function setupPortMessaging(
  overrides: Partial<{
    isInitialized: () => boolean;
    getInitPromise: () => Promise<void> | null;
    ensureReady: () => Promise<boolean>;
  }> = {},
) {
  state.runtimeOnConnectAdd = vi.fn();
  const isInitialized = overrides.isInitialized ?? vi.fn(() => true);
  const getInitPromise = overrides.getInitPromise ?? vi.fn(() => null);
  const ensureReady = overrides.ensureReady ?? vi.fn(async () => true);
  setupPortBasedMessaging({ isInitialized, getInitPromise, ensureReady });
  if (!state.runtimeOnConnectAdd.mock.calls.length) {
    throw new Error('onConnect listener was not registered');
  }
  const onConnectHandler = state.runtimeOnConnectAdd.mock.calls[0][0] as (port: TestPort) => void;
  return { onConnectHandler, isInitialized, getInitPromise, ensureReady };
}

describe('port-messaging', () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should ignore non-quick-search port connections', () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('devtools-panel');
    onConnectHandler(port);
    expect(port._messageHandlers).toHaveLength(0);
    expect(port._disconnectHandlers).toHaveLength(0);
  });

  it('should handle SEARCH_QUERY when initialized', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'hello', skipAI: false });
    await flushMicrotasks();
    expect(state.mockRunSearch).toHaveBeenCalledWith('hello', { skipAI: false });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.any(Array),
        aiStatus: 'ok',
        query: 'hello',
        skipAI: false,
      }),
    );
  });

  it('should handle SEARCH_QUERY with skipAI flag', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'test', skipAI: true });
    await flushMicrotasks();
    expect(state.mockRunSearch).toHaveBeenCalledWith('test', { skipAI: true });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ skipAI: true }),
    );
  });

  it('should rate-limit after 30 queries in 1 second', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);

    for (let i = 0; i < 35; i++) {
      await port.send({ type: 'SEARCH_QUERY', query: `q${i}` });
    }
    await flushMicrotasks();

    const calls = port.postMessage.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const rateLimited = calls.filter((c) => c.error === 'Rate limited');
    const successful = calls.filter((c) => !c.error);
    expect(successful.length).toBe(30);
    expect(rateLimited.length).toBe(5);
    expect(state.mockRunSearch).toHaveBeenCalledTimes(30);
  });

  it('aggregates rate-limit drops into a single log on window close', async () => {
    let now = 2_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);

    for (let i = 0; i < 35; i++) {
      await port.send({ type: 'SEARCH_QUERY', query: `q${i}` });
    }
    await flushMicrotasks();

    const rateLimitLogs = loggerSpies.debug.mock.calls.filter(
      (c) => typeof c[1] === 'string' && (c[1] as string).startsWith('Rate limit'),
    );
    expect(rateLimitLogs).toHaveLength(0);

    now += 1_500;
    await port.send({ type: 'SEARCH_QUERY', query: 'after' });
    await flushMicrotasks();

    const summaryLogs = loggerSpies.debug.mock.calls.filter(
      (c) => typeof c[1] === 'string' && (c[1] as string).startsWith('Rate limit window closed'),
    );
    expect(summaryLogs).toHaveLength(1);
    expect(summaryLogs[0][1]).toBe('Rate limit window closed: dropped 5 of 35 requests');

    nowSpy.mockRestore();
  });

  it('should reset rate limit after window expires', async () => {
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);

    for (let i = 0; i < 30; i++) {
      await port.send({ type: 'SEARCH_QUERY', query: `q${i}` });
    }
    // 31st → rate-limited
    await port.send({ type: 'SEARCH_QUERY', query: 'rl' });
    await flushMicrotasks();

    const midCalls = port.postMessage.mock.calls.slice();
    expect(midCalls.filter((c) => (c[0] as Record<string, unknown>).error).length).toBe(1);

    now += 1_500;
    await port.send({ type: 'SEARCH_QUERY', query: 'after-reset' });
    await flushMicrotasks();

    const lastCall = port.postMessage.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(lastCall.error).toBeUndefined();
    expect(lastCall.query).toBe('after-reset');

    nowSpy.mockRestore();
  });

  it('when not initialized + initPromise resolves → proceeds with search', async () => {
    let resolveInit: () => void = () => undefined;
    const initPromise = new Promise<void>((r) => {
      resolveInit = r;
    });
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => initPromise),
    });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    const sent = port.send({ type: 'SEARCH_QUERY', query: 'pending' });
    await flushMicrotasks();
    expect(port.postMessage).not.toHaveBeenCalled();
    resolveInit();
    await sent;
    await flushMicrotasks();
    expect(state.mockRunSearch).toHaveBeenCalledWith('pending', { skipAI: false });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'pending', aiStatus: 'ok' }),
    );
  });

  it('when not initialized + initPromise rejects → ensureReady heals and proceeds', async () => {
    const ensureReady = vi.fn(async () => true);
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => Promise.reject(new Error('init failed'))),
      ensureReady,
    });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    expect(ensureReady).toHaveBeenCalled();
    expect(state.mockRunSearch).toHaveBeenCalledWith('x', { skipAI: false });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'x', aiStatus: 'ok' }),
    );
  });

  it('when not initialized + initPromise rejects + ensureReady fails → sends error', async () => {
    const ensureReady = vi.fn(async () => false);
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => Promise.reject(new Error('init failed'))),
      ensureReady,
    });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    expect(ensureReady).toHaveBeenCalled();
    expect(state.mockRunSearch).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ error: 'Service worker not ready' });
  });

  it('when not initialized + no initPromise → calls ensureReady and proceeds on success', async () => {
    const ensureReady = vi.fn(async () => true);
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => null),
      ensureReady,
    });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    expect(ensureReady).toHaveBeenCalledTimes(1);
    expect(state.mockRunSearch).toHaveBeenCalledWith('x', { skipAI: false });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'x', aiStatus: 'ok' }),
    );
  });

  it('when not initialized + no initPromise + ensureReady returns false → sends error', async () => {
    const ensureReady = vi.fn(async () => false);
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => null),
      ensureReady,
    });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    expect(ensureReady).toHaveBeenCalledTimes(1);
    expect(state.mockRunSearch).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ error: 'Service worker not ready' });
  });

  it('search error → sends error via port', async () => {
    state.mockRunSearch.mockRejectedValue(new Error('search failed'));
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 'x', skipAI: true });
    await flushMicrotasks();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'search failed', query: 'x', skipAI: true }),
    );
  });

  it('port disconnect → sets portDisconnected flag, suppresses result postMessage', async () => {
    let resolveSearch: (v: unknown[]) => void = () => undefined;
    const searchPromise = new Promise<never>((r) => {
      resolveSearch = r as any;
    });
    state.mockRunSearch.mockReturnValue(searchPromise);

    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    const handler = port._messageHandlers[0];
    const handlerPromise = handler({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    port.disconnect();
    resolveSearch([{ id: 'late' }]);
    await (handlerPromise as any);
    await flushMicrotasks();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('non-SEARCH_QUERY / non-PING messages are ignored', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'HEARTBEAT', query: 'x' });
    await port.send({ type: 'UNKNOWN' });
    await flushMicrotasks();
    expect(state.mockRunSearch).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('PING short-circuits with PONG regardless of init state', async () => {
    const isInitialized = vi.fn(() => false);
    const getInitPromise = vi.fn(() => null);
    const ensureReady = vi.fn(async () => true);
    const { onConnectHandler } = setupPortMessaging({ isInitialized, getInitPromise, ensureReady });
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'PING', t: 12345 });
    await flushMicrotasks();
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'PONG', t: 12345 });
    // Must not trigger init/search just because of a liveness probe.
    expect(ensureReady).not.toHaveBeenCalled();
    expect(state.mockRunSearch).not.toHaveBeenCalled();
  });

  it('PING swallows postMessage errors if port is mid-close', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    onConnectHandler(port);
    await expect(port.send({ type: 'PING', t: 1 })).resolves.toBeUndefined();
  });

  it('truncates queries longer than 500 characters', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    const longQuery = 'a'.repeat(600);
    await port.send({ type: 'SEARCH_QUERY', query: longQuery });
    await flushMicrotasks();
    const passedQuery = state.mockRunSearch.mock.calls[0][0] as string;
    expect(passedQuery).toHaveLength(500);
  });

  it('coerces non-string queries to empty string', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    await port.send({ type: 'SEARCH_QUERY', query: 42 });
    await flushMicrotasks();
    expect(state.mockRunSearch).toHaveBeenCalledWith('', { skipAI: false });
  });

  it('swallows errors thrown by port.postMessage (port closed mid-flight)', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    onConnectHandler(port);
    await expect(
      port.send({ type: 'SEARCH_QUERY', query: 'x' }),
    ).resolves.toBeUndefined();
    await flushMicrotasks();
    expect(port.postMessage).toHaveBeenCalled();
  });

  it('swallows postMessage errors in the rate-limited branch', async () => {
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.error === 'Rate limited') {throw new Error('closed');}
    });
    onConnectHandler(port);
    for (let i = 0; i < 31; i++) {
      await port.send({ type: 'SEARCH_QUERY', query: `q${i}` });
    }
    await flushMicrotasks();
    const last = port.postMessage.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last.error).toBe('Rate limited');
  });

  it('swallows postMessage errors when search rejects and port is closed', async () => {
    state.mockRunSearch.mockRejectedValue(new Error('search boom'));
    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    onConnectHandler(port);
    await expect(
      port.send({ type: 'SEARCH_QUERY', query: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('port disconnect suppresses error postMessage too', async () => {
    let rejectSearch: (e: Error) => void = () => undefined;
    const searchPromise = new Promise<never>((_resolve, reject) => {
      rejectSearch = reject;
    });
    state.mockRunSearch.mockReturnValue(searchPromise);

    const { onConnectHandler } = setupPortMessaging();
    const port = createTestPort('quick-search');
    onConnectHandler(port);
    const handler = port._messageHandlers[0];
    const handlerPromise = handler({ type: 'SEARCH_QUERY', query: 'x' });
    await flushMicrotasks();
    port.disconnect();
    rejectSearch(new Error('search boom'));
    await (handlerPromise as any);
    await flushMicrotasks();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('swallows postMessage errors in the not-initialized (null promise) branch', async () => {
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => null),
      ensureReady: vi.fn(async () => false),
    });
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    onConnectHandler(port);
    await expect(
      port.send({ type: 'SEARCH_QUERY', query: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('swallows postMessage errors in the init-promise-rejected branch', async () => {
    const { onConnectHandler } = setupPortMessaging({
      isInitialized: vi.fn(() => false),
      getInitPromise: vi.fn(() => Promise.reject(new Error('init died'))),
      ensureReady: vi.fn(async () => false),
    });
    const port = createTestPort('quick-search');
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    onConnectHandler(port);
    await expect(
      port.send({ type: 'SEARCH_QUERY', query: 'x' }),
    ).resolves.toBeUndefined();
  });
});
