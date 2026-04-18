import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLogger } from '../../__test-utils__/logger-mock';

describe('service-worker (basic)', () => {
  let savedOnMessage: ((msg: any, sender: any, sendResponse: any) => void) | null = null;
  let savedOnCommand: ((command: string) => void) | null = null;

  beforeEach(() => {
    // Fresh module load each test
    vi.resetModules();
    savedOnMessage = null;
    savedOnCommand = null;
    vi.clearAllMocks();

    // Mock logger
    vi.mock('../../core/logger', () => mockLogger());

    // Minimal chrome stub to allow module to register listeners at load time
    const chromeStub: any = {
      runtime: {
        onMessage: { addListener: (fn: any) => { savedOnMessage = fn; } },
        onConnect: { addListener: (_: any) => {} },
        onInstalled: { addListener: (_: any) => {} },
        onStartup: { addListener: (_: any) => {} },
        getManifest: () => ({ version: '0.0.0', manifest_version: 3 }),
        lastError: undefined,
      },
      commands: {
        onCommand: { addListener: (fn: any) => { savedOnCommand = fn; } },
      },
      omnibox: {
        setDefaultSuggestion: vi.fn(),
        onInputChanged: { addListener: vi.fn() },
        onInputEntered: { addListener: vi.fn() },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        sendMessage: (_tabId: number, _msg: any, cb: any) => cb && cb({ success: true }),
      },
      alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
      permissions: { contains: (_: any, cb: any) => cb(true), request: (_: any, cb: any) => cb(true), remove: (_: any, cb: any) => cb(true) },
      topSites: { get: (_cb: any) => _cb([]) },
      action: { openPopup: vi.fn() },
      scripting: { executeScript: vi.fn().mockResolvedValue({}) },
    };

    vi.stubGlobal('chrome', chromeStub);
  });

  it('registers runtime onMessage and responds to PING', async () => {
    await import('../service-worker');
    expect(typeof savedOnMessage).toBe('function');

    const result = await new Promise((resolve) => {
      if (!savedOnMessage) {throw new Error('onMessage handler not registered');}
      savedOnMessage({ type: 'PING' }, null, (payload: any) => resolve(payload));
    });

    expect(result).toEqual({ status: 'ok' });
  });

  it('registers commands listener early', async () => {
    await import('../service-worker');
    expect(typeof savedOnCommand).toBe('function');
  });
});
