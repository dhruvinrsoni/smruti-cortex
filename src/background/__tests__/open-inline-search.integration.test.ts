import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock helpers module before importing the service-worker
const sendMessageMock = vi.fn((tabId, message, cb) => {
  // simulate async response via callback
  cb({ success: true });
});

const queryMock = vi.fn(async () => [{ id: 123, url: 'https://example.com' }]);
let addedCallback: ((cmd: string) => void) | null = null;

// Provide a minimal global `chrome` to satisfy `src/core/helpers.ts` detection
(globalThis as any).chrome = {
  commands: { onCommand: { addListener: (cb: (cmd: string) => void) => { addedCallback = cb; } } },
  tabs: { query: queryMock, sendMessage: sendMessageMock },
  action: { openPopup: vi.fn() },
  runtime: {
    lastError: null,
    getManifest: () => ({ manifest_version: 3 }),
    onConnect: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() }
  }
};

// Importing the service-worker module will register the commands listener
// due to module-level registration in the file under test
import '../service-worker';

describe('OPEN_INLINE_SEARCH integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addedCallback = null;
  });

  it('sends OPEN_INLINE_SEARCH to active tab when shortcut triggers', async () => {
    // Wait a tick for module-level registration
    await new Promise((r) => setTimeout(r, 0));

    // Ensure listener was registered
    expect(addedCallback).toBeTruthy();

    // Trigger the command listener as Chrome would
    addedCallback!('open-popup');

    // Allow async flow to run
    await new Promise((r) => setTimeout(r, 10));

    expect(queryMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(123, { type: 'OPEN_INLINE_SEARCH' }, expect.any(Function));
  });
});
