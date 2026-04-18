// Global test setup: provide a minimal `chrome` stub and helpers so tests
// that import modules at module-eval time don't fail. Tests can use
// `globalThis.__chromeMocks.callOnMessage(...)` to invoke the registered
// `runtime.onMessage` listener.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var chrome: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __chromeMocks: any;
}

if (typeof (globalThis as any).chrome === 'undefined') {
  const onMessage = { _listener: undefined as any, addListener(fn: any) { this._listener = fn; }, removeListener() { this._listener = undefined; } };
  const onConnect = { _listener: undefined as any, addListener(fn: any) { this._listener = fn; }, removeListener() { this._listener = undefined; } };

  const chromeStub: any = {
    runtime: {
      onMessage,
      onConnect,
      onStartup: { addListener: (_: any) => {} },
      onInstalled: { addListener: (_: any) => {} },
      lastError: null,
      getManifest: () => ({ version: '0.0.0', manifest_version: 3 }),
      sendMessage: (_msg: any, cb?: Function) => { if (cb) cb(undefined); },
    },
    commands: { onCommand: { addListener: (_: any) => {} } },
    alarms: { create: (_: any) => {}, onAlarm: { addListener: (_: any) => {} } },
    tabs: {
      query: async (_opt?: any) => [],
      onActivated: { addListener: (_: any) => {} },
      onUpdated: { addListener: (_: any) => {} },
      create: async (_: any) => ({}),
      sendMessage: (_tabId: any, _msg: any, cb?: Function) => cb?.(),
      get: async (_id?: any) => ({}),
      remove: async (_id?: any) => {},
      getZoom: (_tabId: any, cb: Function) => cb?.(1),
      setZoom: (_tabId: any, _zoom: number) => {},
      reload: async (_id?: any, _opts?: any) => {},
      update: async (_id: any, _opts: any) => {},
      duplicate: async (_id: any) => {},
      goBack: async (_id: any) => {},
      goForward: async (_id: any) => {},
    },
    action: { openPopup: async () => {} },
    bookmarks: { search: async (_: any) => [], get: async (_: any) => [], getRecent: async (_: any) => [], create: async (_: any) => {} },
    storage: { local: { get: (_keys: any, cb: Function) => cb({}), set: (_items: any, cb: Function) => cb && cb(), remove: (_keys: any) => {} } },
    sessions: { getRecentlyClosed: (_opts: any, cb: Function) => cb([]), restore: async (_id: any) => {} },
    topSites: { get: (cb: Function) => cb([]) },
    permissions: { contains: (_: any, cb: Function) => cb(false), request: (_: any, cb: Function) => cb(true), remove: (_: any, cb: Function) => cb(true) },
  };

  (globalThis as any).chrome = chromeStub;
  (globalThis as any).__chromeMocks = {
    callOnMessage: (msg: any, sender = {}, sendResponse = () => {}) => { if (onMessage._listener) onMessage._listener(msg, sender, sendResponse); },
    callOnConnect: (port: any) => { if (onConnect._listener) onConnect._listener(port); },
    getListeners: () => ({ onMessage: onMessage._listener, onConnect: onConnect._listener }),
  };
}

export {};
