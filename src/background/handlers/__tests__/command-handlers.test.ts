 
 
/**
 * command-handlers — branch-coverage unit tests.
 *
 * Targets the ~61 uncovered branches in command-handlers.ts.
 * Happy-path basics are already covered in service-worker.test.ts;
 * this file focuses on else/fallback/error/edge branches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import { registerCommandHandlers } from '../command-handlers';

// ---------------------------------------------------------------------------
// Hoisted mock fns — must be declared before vi.mock calls
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const tabsQuery = vi.fn();
  const tabsRemove = vi.fn();
  const tabsCreate = vi.fn();
  const tabsDiscard = vi.fn();
  const tabsMove = vi.fn();
  const tabsUpdate = vi.fn();
  const tabsGet = vi.fn();
  const tabsGroup = vi.fn();
  const tabsUngroup = vi.fn();
  const tabsReload = vi.fn();
  const tabsDuplicate = vi.fn();
  const tabsGoBack = vi.fn();
  const tabsGoForward = vi.fn();
  const tabsGetZoom = vi.fn();
  const tabsSetZoom = vi.fn();
  const windowsCreate = vi.fn();
  const windowsUpdate = vi.fn();
  const windowsGetCurrent = vi.fn();
  const windowsGetAll = vi.fn();
  const scriptingExecuteScript = vi.fn();
  const permissionsContains = vi.fn();
  const permissionsRequest = vi.fn();
  const permissionsRemove = vi.fn();
  const tabGroupsQuery = vi.fn();
  const tabGroupsUpdate = vi.fn();
  const browsingDataRemoveCache = vi.fn();
  const browsingDataRemoveCookies = vi.fn();
  const browsingDataRemoveLocalStorage = vi.fn();
  const browsingDataRemoveDownloads = vi.fn();
  const browsingDataRemoveFormData = vi.fn();
  const browsingDataRemovePasswords = vi.fn();
  const browsingDataRemove = vi.fn();
  const topSitesGet = vi.fn();
  const bookmarksSearch = vi.fn();
  const bookmarksGetRecent = vi.fn();
  const bookmarksCreate = vi.fn();
  const bookmarksGet = vi.fn();
  const sessionsGetRecentlyClosed = vi.fn();
  const sessionsRestore = vi.fn();

  return {
    tabsQuery, tabsRemove, tabsCreate, tabsDiscard, tabsMove, tabsUpdate,
    tabsGet, tabsGroup, tabsUngroup, tabsReload, tabsDuplicate,
    tabsGoBack, tabsGoForward, tabsGetZoom, tabsSetZoom,
    windowsCreate, windowsUpdate, windowsGetCurrent, windowsGetAll,
    scriptingExecuteScript,
    permissionsContains, permissionsRequest, permissionsRemove,
    tabGroupsQuery, tabGroupsUpdate,
    browsingDataRemoveCache, browsingDataRemoveCookies, browsingDataRemoveLocalStorage,
    browsingDataRemoveDownloads, browsingDataRemoveFormData, browsingDataRemovePasswords,
    browsingDataRemove,
    topSitesGet,
    bookmarksSearch, bookmarksGetRecent, bookmarksCreate, bookmarksGet,
    sessionsGetRecentlyClosed, sessionsRestore,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../../core/helpers', () => {
  const m = mocks;
  return {
    browserAPI: {
      tabs: {
        query: (...a: unknown[]) => m.tabsQuery(...a),
        remove: (...a: unknown[]) => m.tabsRemove(...a),
        create: (...a: unknown[]) => m.tabsCreate(...a),
        discard: (...a: unknown[]) => m.tabsDiscard(...a),
        move: (...a: unknown[]) => m.tabsMove(...a),
        update: (...a: unknown[]) => m.tabsUpdate(...a),
        get: (...a: unknown[]) => m.tabsGet(...a),
        group: (...a: unknown[]) => m.tabsGroup(...a),
        ungroup: (...a: unknown[]) => m.tabsUngroup(...a),
        reload: (...a: unknown[]) => m.tabsReload(...a),
        duplicate: (...a: unknown[]) => m.tabsDuplicate(...a),
        goBack: (...a: unknown[]) => m.tabsGoBack(...a),
        goForward: (...a: unknown[]) => m.tabsGoForward(...a),
        getZoom: (tabId: number, cb: (z: number) => void) => m.tabsGetZoom(tabId, cb),
        setZoom: (tabId: number, zoom: number) => m.tabsSetZoom(tabId, zoom),
      },
      windows: {
        create: (...a: unknown[]) => m.windowsCreate(...a),
        update: (...a: unknown[]) => m.windowsUpdate(...a),
        getCurrent: (...a: unknown[]) => m.windowsGetCurrent(...a),
        getAll: (...a: unknown[]) => m.windowsGetAll(...a),
        WINDOW_ID_CURRENT: -2,
      },
      scripting: {
        executeScript: (...a: unknown[]) => m.scriptingExecuteScript(...a),
      },
      permissions: {
        contains: (p: unknown, cb: (r: boolean) => void) => m.permissionsContains(p, cb),
        request: (p: unknown, cb: (g: boolean | undefined) => void) => m.permissionsRequest(p, cb),
        remove: (p: unknown, cb: (r: boolean | undefined) => void) => m.permissionsRemove(p, cb),
      },
      tabGroups: {
        query: (...a: unknown[]) => m.tabGroupsQuery(...a),
        update: (...a: unknown[]) => m.tabGroupsUpdate(...a),
      },
      browsingData: {
        removeCache: (...a: unknown[]) => m.browsingDataRemoveCache(...a),
        removeCookies: (...a: unknown[]) => m.browsingDataRemoveCookies(...a),
        removeLocalStorage: (...a: unknown[]) => m.browsingDataRemoveLocalStorage(...a),
        removeDownloads: (...a: unknown[]) => m.browsingDataRemoveDownloads(...a),
        removeFormData: (...a: unknown[]) => m.browsingDataRemoveFormData(...a),
        removePasswords: (...a: unknown[]) => m.browsingDataRemovePasswords(...a),
        remove: (...a: unknown[]) => m.browsingDataRemove(...a),
      },
      topSites: {
        get: (cb: (s: any[]) => void) => m.topSitesGet(cb),
      },
      bookmarks: {
        search: (...a: unknown[]) => m.bookmarksSearch(...a),
        getRecent: (...a: unknown[]) => m.bookmarksGetRecent(...a),
        create: (...a: unknown[]) => m.bookmarksCreate(...a),
        get: (...a: unknown[]) => m.bookmarksGet(...a),
      },
      sessions: {
        getRecentlyClosed: (opts: unknown, cb: (s: any[]) => void) => m.sessionsGetRecentlyClosed(opts, cb),
        restore: (...a: unknown[]) => m.sessionsRestore(...a),
      },
    },
  };
});

vi.mock('../../favicon-cache', () => ({
  clearFaviconCache: vi.fn(async () => ({ cleared: 0, freedBytes: 0 })),
  getFaviconCacheStats: vi.fn(async () => ({ count: 0, totalSize: 0, oldestCacheDate: null })),
  getFaviconWithCache: vi.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let registry: MessageHandlerRegistry;

function dispatch(
  msg: { type: string;[k: string]: unknown },
  sender: any = {},
): Promise<any> {
  return new Promise((resolve) => {
    void registry.dispatch(msg, sender, (r: unknown) => resolve(r));
  });
}

function resetAllMocks() {
  const m = mocks;
  m.tabsQuery.mockResolvedValue([]);
  m.tabsRemove.mockResolvedValue(undefined);
  m.tabsCreate.mockResolvedValue({});
  m.tabsDiscard.mockResolvedValue({});
  m.tabsMove.mockResolvedValue({});
  m.tabsUpdate.mockResolvedValue({});
  m.tabsGet.mockResolvedValue({ id: 1, groupId: -1 });
  m.tabsGroup.mockResolvedValue(1);
  m.tabsUngroup.mockResolvedValue(undefined);
  m.tabsReload.mockResolvedValue(undefined);
  m.tabsDuplicate.mockResolvedValue({});
  m.tabsGoBack.mockResolvedValue(undefined);
  m.tabsGoForward.mockResolvedValue(undefined);
  m.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(1.0));
  m.tabsSetZoom.mockReturnValue(undefined);
  m.windowsCreate.mockResolvedValue({});
  m.windowsUpdate.mockResolvedValue({});
  m.windowsGetCurrent.mockResolvedValue({ id: 10 });
  m.windowsGetAll.mockResolvedValue([]);
  m.scriptingExecuteScript.mockResolvedValue([]);
  m.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(true));
  m.permissionsRequest.mockImplementation((_p: unknown, cb: (g: boolean | undefined) => void) => cb(true));
  m.permissionsRemove.mockImplementation((_p: unknown, cb: (r: boolean | undefined) => void) => cb(true));
  m.tabGroupsQuery.mockResolvedValue([]);
  m.tabGroupsUpdate.mockResolvedValue({});
  m.browsingDataRemoveCache.mockResolvedValue(undefined);
  m.browsingDataRemoveCookies.mockResolvedValue(undefined);
  m.browsingDataRemoveLocalStorage.mockResolvedValue(undefined);
  m.browsingDataRemoveDownloads.mockResolvedValue(undefined);
  m.browsingDataRemoveFormData.mockResolvedValue(undefined);
  m.browsingDataRemovePasswords.mockResolvedValue(undefined);
  m.browsingDataRemove.mockResolvedValue(undefined);
  m.topSitesGet.mockImplementation((cb: (s: any[]) => void) => cb([]));
  m.bookmarksSearch.mockResolvedValue([]);
  m.bookmarksGetRecent.mockResolvedValue([]);
  m.bookmarksCreate.mockResolvedValue({});
  m.bookmarksGet.mockResolvedValue([{ title: 'Folder', parentId: '0' }]);
  m.sessionsGetRecentlyClosed.mockImplementation((_: unknown, cb: (s: any[]) => void) => cb([]));
  m.sessionsRestore.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  registry = new MessageHandlerRegistry();
  registerCommandHandlers(registry);
});

// ===========================================================================
// 1. Tab handlers — sender.tab?.id fallback & "no tab" error branches
// ===========================================================================

describe('Tab handlers — sender.tab?.id fallback and no-tab errors', () => {
  const tabHandlers = [
    { type: 'CLOSE_TAB', errorMsg: 'No tab to close' },
    { type: 'DUPLICATE_TAB', errorMsg: 'No tab to duplicate' },
    { type: 'PIN_TAB', errorMsg: 'No tab to pin' },
    { type: 'UNPIN_TAB', errorMsg: 'No tab' },
    { type: 'MUTE_TAB', errorMsg: 'No tab to mute' },
    { type: 'UNMUTE_TAB', errorMsg: 'No tab' },
    { type: 'TAB_RELOAD', errorMsg: 'No tab to reload' },
    { type: 'TAB_HARD_RELOAD', errorMsg: 'No tab to reload' },
    { type: 'TAB_GO_BACK', errorMsg: 'No tab' },
    { type: 'TAB_GO_FORWARD', errorMsg: 'No tab' },
    { type: 'TAB_ZOOM', errorMsg: 'No tab' },
    { type: 'DISCARD_TAB', errorMsg: 'No tab to discard' },
  ];

  for (const { type, errorMsg } of tabHandlers) {
    it(`${type} uses sender.tab.id when msg.tabId is absent`, async () => {
      mocks.tabsGet.mockResolvedValue({ id: 42, pinned: false, mutedInfo: { muted: false } });
      const res = await dispatch({ type }, { tab: { id: 42 } });
      expect(res.status).toBe('OK');
    });

    it(`${type} returns error when both msg.tabId and sender.tab are missing`, async () => {
      const res = await dispatch({ type }, {});
      expect(res.error).toBe(errorMsg);
    });

    it(`${type} returns error when sender.tab exists but id is undefined`, async () => {
      const res = await dispatch({ type }, { tab: {} });
      expect(res.error).toBe(errorMsg);
    });
  }
});

// ===========================================================================
// 2. TAB_ZOOM direction branches
// ===========================================================================

describe('TAB_ZOOM direction branches', () => {
  it('zoom in clamps at 5', async () => {
    mocks.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(4.95));
    const res = await dispatch({ type: 'TAB_ZOOM', tabId: 1, direction: 'in' });
    expect(res.zoom).toBe(5);
  });

  it('zoom out clamps at 0.25', async () => {
    mocks.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(0.25));
    const res = await dispatch({ type: 'TAB_ZOOM', tabId: 1, direction: 'out' });
    expect(res.zoom).toBe(0.25);
  });

  it('zoom reset sets to 1 regardless of current', async () => {
    mocks.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(2.5));
    const res = await dispatch({ type: 'TAB_ZOOM', tabId: 1, direction: 'reset' });
    expect(res.zoom).toBe(1);
  });

  it('no direction keeps current zoom', async () => {
    mocks.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(1.5));
    const res = await dispatch({ type: 'TAB_ZOOM', tabId: 1 });
    expect(res.zoom).toBe(1.5);
    expect(res.status).toBe('OK');
  });

  it('unknown direction keeps current zoom', async () => {
    mocks.tabsGetZoom.mockImplementation((_: number, cb: (z: number) => void) => cb(1.0));
    const res = await dispatch({ type: 'TAB_ZOOM', tabId: 1, direction: 'unknown' });
    expect(res.zoom).toBe(1.0);
  });
});

// ===========================================================================
// 3. TAB_VIEW_SOURCE — falsy url branch
// ===========================================================================

describe('TAB_VIEW_SOURCE', () => {
  it('returns error when sender.tab has id but no url', async () => {
    const res = await dispatch({ type: 'TAB_VIEW_SOURCE' }, { tab: { id: 5, url: '' } });
    expect(res.error).toBe('No tab URL');
  });

  it('returns error when sender.tab has id but url is undefined', async () => {
    const res = await dispatch({ type: 'TAB_VIEW_SOURCE' }, { tab: { id: 5 } });
    expect(res.error).toBe('No tab URL');
  });

  it('returns error when sender has no tab at all', async () => {
    const res = await dispatch({ type: 'TAB_VIEW_SOURCE' }, {});
    expect(res.error).toBe('No tab URL');
  });
});

// ===========================================================================
// 4. CLOSE_OTHER_TABS — toRemove.length === 0
// ===========================================================================

describe('CLOSE_OTHER_TABS', () => {
  it('does not call tabs.remove when no tabs to close', async () => {
    mocks.tabsQuery.mockResolvedValue([{ id: 1, pinned: false }]);
    const res = await dispatch({ type: 'CLOSE_OTHER_TABS', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('skips pinned tabs', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, pinned: false },
      { id: 2, pinned: true },
    ]);
    const res = await dispatch({ type: 'CLOSE_OTHER_TABS', tabId: 1 });
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('uses sender.tab.id fallback', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 10, pinned: false },
      { id: 11, pinned: false },
    ]);
    const res = await dispatch({ type: 'CLOSE_OTHER_TABS' }, { tab: { id: 10 } });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
  });

  it('returns error when no tab context', async () => {
    const res = await dispatch({ type: 'CLOSE_OTHER_TABS' }, {});
    expect(res.error).toBe('No active tab');
  });
});

// ===========================================================================
// 5–7. CLOSE_TABS_RIGHT / CLOSE_TABS_LEFT — fallback + null id/index
// ===========================================================================

describe('CLOSE_TABS_RIGHT', () => {
  it('falls back to query when sender.tab is null', async () => {
    mocks.tabsQuery
      .mockResolvedValueOnce([{ id: 5, index: 1 }])
      .mockResolvedValueOnce([
        { id: 5, index: 1, pinned: false },
        { id: 6, index: 2, pinned: false },
      ]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, {});
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
  });

  it('returns error when senderTab has null id', async () => {
    mocks.tabsQuery.mockResolvedValueOnce([{ id: null, index: 0 }]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, {});
    expect(res.error).toBe('No tab context');
  });

  it('returns error when senderTab has undefined id', async () => {
    mocks.tabsQuery.mockResolvedValueOnce([{ index: 0 }]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, {});
    expect(res.error).toBe('No tab context');
  });

  it('returns error when senderTab has null index', async () => {
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, { tab: { id: 5, index: null } });
    expect(res.error).toBe('No tab context');
  });

  it('returns error when senderTab has undefined index', async () => {
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, { tab: { id: 5 } });
    expect(res.error).toBe('No tab context');
  });

  it('does not call tabs.remove when no tabs to the right', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 5, index: 2, pinned: false },
    ]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, { tab: { id: 5, index: 2 } });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('skips pinned tabs to the right', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 5, index: 0, pinned: false },
      { id: 6, index: 1, pinned: true },
    ]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, { tab: { id: 5, index: 0 } });
    expect(res.closed).toBe(0);
  });

  it('returns error when query returns empty array (no active tab)', async () => {
    mocks.tabsQuery.mockResolvedValueOnce([]);
    const res = await dispatch({ type: 'CLOSE_TABS_RIGHT' }, {});
    expect(res.error).toBe('No tab context');
  });
});

describe('CLOSE_TABS_LEFT', () => {
  it('falls back to query when sender.tab is null', async () => {
    mocks.tabsQuery
      .mockResolvedValueOnce([{ id: 5, index: 2 }])
      .mockResolvedValueOnce([
        { id: 4, index: 0, pinned: false },
        { id: 5, index: 2, pinned: false },
      ]);
    const res = await dispatch({ type: 'CLOSE_TABS_LEFT' }, {});
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
  });

  it('returns error when senderTab has null id', async () => {
    mocks.tabsQuery.mockResolvedValueOnce([{ id: null, index: 0 }]);
    const res = await dispatch({ type: 'CLOSE_TABS_LEFT' }, {});
    expect(res.error).toBe('No tab context');
  });

  it('returns error when senderTab has undefined index', async () => {
    const res = await dispatch({ type: 'CLOSE_TABS_LEFT' }, { tab: { id: 5 } });
    expect(res.error).toBe('No tab context');
  });

  it('does not call tabs.remove when no tabs to the left', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 5, index: 0, pinned: false },
    ]);
    const res = await dispatch({ type: 'CLOSE_TABS_LEFT' }, { tab: { id: 5, index: 0 } });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('returns error when query returns empty array', async () => {
    mocks.tabsQuery.mockResolvedValueOnce([]);
    const res = await dispatch({ type: 'CLOSE_TABS_LEFT' }, {});
    expect(res.error).toBe('No tab context');
  });
});

// ===========================================================================
// 8. WINDOW_CREATE — safeUrl branches
// ===========================================================================

describe('WINDOW_CREATE safeUrl branches', () => {
  it('background-tab rejects file: protocol', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 'file:///etc/passwd',
    });
    expect(res.status).toBe('ERROR');
    expect(res.message).toContain('Invalid');
  });

  it('background-tab rejects non-parseable URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: ':::not-a-url',
    });
    expect(res.status).toBe('ERROR');
  });

  it('background-tab rejects empty string URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: '',
    });
    expect(res.status).toBe('ERROR');
  });

  it('background-tab rejects non-string URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 123,
    });
    expect(res.status).toBe('ERROR');
  });

  it('background-tab accepts chrome: URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 'chrome://settings',
    });
    expect(res.status).toBe('OK');
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: 'chrome://settings', active: false });
  });

  it('background-tab accepts chrome-extension: URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 'chrome-extension://abc/page.html',
    });
    expect(res.status).toBe('OK');
  });

  it('default windowType falls back to chrome://newtab when url is invalid', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'something-else',
      url: 'ftp://example.com',
    });
    expect(res.status).toBe('OK');
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: 'chrome://newtab' });
  });

  it('default windowType uses valid url when provided', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'tab',
      url: 'https://example.com',
    });
    expect(res.status).toBe('OK');
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: 'https://example.com' });
  });

  it('default windowType falls back to chrome://newtab when no url', async () => {
    const res = await dispatch({ type: 'WINDOW_CREATE', windowType: 'tab' });
    expect(res.status).toBe('OK');
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: 'chrome://newtab' });
  });

  it('background-tab rejects javascript: protocol', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 'javascript:alert(1)',
    });
    expect(res.status).toBe('ERROR');
  });

  it('background-tab rejects data: URL', async () => {
    const res = await dispatch({
      type: 'WINDOW_CREATE',
      windowType: 'background-tab',
      url: 'data:text/html,<h1>Hi</h1>',
    });
    expect(res.status).toBe('ERROR');
  });
});

// ===========================================================================
// 9. GROUP_TAB — error catch + no tabId
// ===========================================================================

describe('GROUP_TAB error branches', () => {
  it('returns error when no tabId and no sender.tab', async () => {
    const res = await dispatch({ type: 'GROUP_TAB' }, {});
    expect(res.error).toBe('No tab');
  });

  it('catches tabs.group error', async () => {
    mocks.tabsGroup.mockRejectedValue(new Error('group failed'));
    const res = await dispatch({ type: 'GROUP_TAB', tabId: 1 });
    expect(res.error).toBe('group failed');
  });

  it('uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'GROUP_TAB' }, { tab: { id: 7 } });
    expect(res.status).toBe('OK');
    expect(res.groupId).toBe(1);
  });

  it('returns error when tabGroups permission not granted', async () => {
    mocks.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(false));
    const res = await dispatch({ type: 'GROUP_TAB', tabId: 1 });
    expect(res.error).toContain('tabGroups');
  });
});

// ===========================================================================
// 10. UNGROUP_TAB — error catch + no tabId
// ===========================================================================

describe('UNGROUP_TAB error branches', () => {
  it('returns error when no tabId', async () => {
    const res = await dispatch({ type: 'UNGROUP_TAB' }, {});
    expect(res.error).toBe('No tab');
  });

  it('catches tabs.ungroup error', async () => {
    mocks.tabsUngroup.mockRejectedValue(new Error('ungroup failed'));
    const res = await dispatch({ type: 'UNGROUP_TAB', tabId: 1 });
    expect(res.error).toBe('ungroup failed');
  });

  it('uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'UNGROUP_TAB' }, { tab: { id: 9 } });
    expect(res.status).toBe('OK');
  });
});

// ===========================================================================
// 11. COLLAPSE_GROUPS — permission denied + error catch
// ===========================================================================

describe('COLLAPSE_GROUPS error branches', () => {
  it('returns error when tabGroups permission denied', async () => {
    mocks.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(false));
    const res = await dispatch({ type: 'COLLAPSE_GROUPS' });
    expect(res.error).toContain('tabGroups');
  });

  it('catches error during collapse', async () => {
    mocks.tabGroupsQuery.mockRejectedValue(new Error('collapse error'));
    const res = await dispatch({ type: 'COLLAPSE_GROUPS' });
    expect(res.error).toBe('collapse error');
  });
});

// ===========================================================================
// 12. EXPAND_GROUPS — permission denied + error catch
// ===========================================================================

describe('EXPAND_GROUPS error branches', () => {
  it('returns error when tabGroups permission denied', async () => {
    mocks.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(false));
    const res = await dispatch({ type: 'EXPAND_GROUPS' });
    expect(res.error).toContain('tabGroups');
  });

  it('catches error during expand', async () => {
    mocks.tabGroupsQuery.mockRejectedValue(new Error('expand error'));
    const res = await dispatch({ type: 'EXPAND_GROUPS' });
    expect(res.error).toBe('expand error');
  });
});

// ===========================================================================
// 13. NAME_GROUP — no tabId + catch error
// ===========================================================================

describe('NAME_GROUP error branches', () => {
  it('returns error when no tabId', async () => {
    const res = await dispatch({ type: 'NAME_GROUP' }, {});
    expect(res.error).toBe('No tab');
  });

  it('catches error during name update', async () => {
    mocks.tabsGet.mockRejectedValue(new Error('get failed'));
    const res = await dispatch({ type: 'NAME_GROUP', tabId: 1 });
    expect(res.error).toBe('get failed');
  });

  it('uses default name "Group" when msg.name is absent', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 42 });
    const res = await dispatch({ type: 'NAME_GROUP', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabGroupsUpdate).toHaveBeenCalledWith(42, { title: 'Group' });
  });

  it('returns error when tab groupId is 0 (falsy)', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 0 });
    const res = await dispatch({ type: 'NAME_GROUP', tabId: 1 });
    expect(res.error).toContain('not in a group');
  });

  it('uses sender.tab.id fallback', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 3, groupId: 10 });
    const res = await dispatch({ type: 'NAME_GROUP', name: 'Work' }, { tab: { id: 3 } });
    expect(res.status).toBe('OK');
  });
});

// ===========================================================================
// 14. COLOR_GROUP — not in group + no tabId + catch error
// ===========================================================================

describe('COLOR_GROUP error branches', () => {
  it('returns error when tab is not in a group (groupId === -1)', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: -1 });
    const res = await dispatch({ type: 'COLOR_GROUP', tabId: 1, color: 'red' });
    expect(res.error).toContain('not in a group');
  });

  it('returns error when no tabId', async () => {
    const res = await dispatch({ type: 'COLOR_GROUP' }, {});
    expect(res.error).toBe('No tab');
  });

  it('catches error during color update', async () => {
    mocks.tabsGet.mockRejectedValue(new Error('color failed'));
    const res = await dispatch({ type: 'COLOR_GROUP', tabId: 1 });
    expect(res.error).toBe('color failed');
  });

  it('defaults color to "blue" when msg.color is absent', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 7 });
    const res = await dispatch({ type: 'COLOR_GROUP', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabGroupsUpdate).toHaveBeenCalledWith(7, { color: 'blue' });
  });

  it('uses sender.tab.id fallback', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 3, groupId: 5 });
    const res = await dispatch({ type: 'COLOR_GROUP', color: 'green' }, { tab: { id: 3 } });
    expect(res.status).toBe('OK');
  });

  it('returns error when groupId is 0 (falsy)', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 0 });
    const res = await dispatch({ type: 'COLOR_GROUP', tabId: 1 });
    expect(res.error).toContain('not in a group');
  });
});

// ===========================================================================
// 15. CLOSE_GROUP — not in group + no tabId + catch error + ids.length === 0
// ===========================================================================

describe('CLOSE_GROUP error branches', () => {
  it('returns error when tab is not in a group', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: -1 });
    const res = await dispatch({ type: 'CLOSE_GROUP', tabId: 1 });
    expect(res.error).toContain('not in a group');
  });

  it('returns error when no tabId', async () => {
    const res = await dispatch({ type: 'CLOSE_GROUP' }, {});
    expect(res.error).toBe('No tab');
  });

  it('catches error during close', async () => {
    mocks.tabsGet.mockRejectedValue(new Error('close failed'));
    const res = await dispatch({ type: 'CLOSE_GROUP', tabId: 1 });
    expect(res.error).toBe('close failed');
  });

  it('does not call tabs.remove when ids array is empty', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 42 });
    mocks.tabsQuery.mockResolvedValue([]);
    const res = await dispatch({ type: 'CLOSE_GROUP', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('filters out falsy tab ids', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 42 });
    mocks.tabsQuery.mockResolvedValue([{ id: 0 }, { id: null }, { id: 10 }]);
    const res = await dispatch({ type: 'CLOSE_GROUP', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
    expect(mocks.tabsRemove).toHaveBeenCalledWith([10]);
  });

  it('uses sender.tab.id fallback', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 3, groupId: 99 });
    mocks.tabsQuery.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    const res = await dispatch({ type: 'CLOSE_GROUP' }, { tab: { id: 3 } });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
  });

  it('returns error when groupId is 0 (falsy)', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, groupId: 0 });
    const res = await dispatch({ type: 'CLOSE_GROUP', tabId: 1 });
    expect(res.error).toContain('not in a group');
  });
});

// ===========================================================================
// 16. UNGROUP_ALL — catch error
// ===========================================================================

describe('UNGROUP_ALL error branches', () => {
  it('catches error during ungroup', async () => {
    mocks.tabsQuery.mockResolvedValue([{ id: 1, groupId: 5 }]);
    mocks.tabsUngroup.mockRejectedValue(new Error('ungroup all failed'));
    const res = await dispatch({ type: 'UNGROUP_ALL' });
    expect(res.error).toBe('ungroup all failed');
  });

  it('skips tabs with groupId === -1', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, groupId: -1 },
      { id: 2, groupId: 0 },
    ]);
    const res = await dispatch({ type: 'UNGROUP_ALL' });
    expect(res.status).toBe('OK');
    expect(res.ungrouped).toBe(0);
    expect(mocks.tabsUngroup).not.toHaveBeenCalled();
  });

  it('skips tabs without id', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { groupId: 5 },
      { id: 2, groupId: 5 },
    ]);
    const res = await dispatch({ type: 'UNGROUP_ALL' });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUngroup).toHaveBeenCalledTimes(1);
    expect(mocks.tabsUngroup).toHaveBeenCalledWith(2);
  });
});

// ===========================================================================
// 17. CLOSE_DUPLICATES — tab without url/id
// ===========================================================================

describe('CLOSE_DUPLICATES edge cases', () => {
  it('skips tabs without url', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, url: 'https://example.com' },
      { id: 2 },
      { id: 3, url: 'https://example.com' },
    ]);
    const res = await dispatch({ type: 'CLOSE_DUPLICATES' });
    expect(res.closed).toBe(1);
    expect(mocks.tabsRemove).toHaveBeenCalledWith([3]);
  });

  it('skips tabs without id', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, url: 'https://example.com' },
      { url: 'https://example.com' },
    ]);
    const res = await dispatch({ type: 'CLOSE_DUPLICATES' });
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('normalizes URLs by stripping fragment', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, url: 'https://example.com/page#section1' },
      { id: 2, url: 'https://example.com/page#section2' },
    ]);
    const res = await dispatch({ type: 'CLOSE_DUPLICATES' });
    expect(res.closed).toBe(1);
    expect(mocks.tabsRemove).toHaveBeenCalledWith([2]);
  });

  it('reports closed 0 when no duplicates and does not call remove', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, url: 'https://a.com' },
      { id: 2, url: 'https://b.com' },
    ]);
    const res = await dispatch({ type: 'CLOSE_DUPLICATES' });
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 18. SORT_TABS — tab without id in sort loop
// ===========================================================================

describe('SORT_TABS edge cases', () => {
  it('skips tabs without id during move', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: undefined, pinned: false, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://a.com' },
    ]);
    const res = await dispatch({ type: 'SORT_TABS' });
    expect(res.status).toBe('OK');
    expect(mocks.tabsMove).toHaveBeenCalledTimes(1);
    expect(mocks.tabsMove).toHaveBeenCalledWith(2, { index: 0 });
  });

  it('sorts tabs by url with undefined urls treated as empty', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, pinned: false, url: undefined },
      { id: 2, pinned: false, url: 'https://a.com' },
    ]);
    const res = await dispatch({ type: 'SORT_TABS' });
    expect(res.status).toBe('OK');
    expect(res.sorted).toBe(2);
  });

  it('offsets sort index by pinned tab count', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, pinned: true, url: 'https://pinned.com' },
      { id: 2, pinned: false, url: 'https://b.com' },
      { id: 3, pinned: false, url: 'https://a.com' },
    ]);
    const res = await dispatch({ type: 'SORT_TABS' });
    expect(res.sorted).toBe(2);
    expect(mocks.tabsMove).toHaveBeenCalledWith(3, { index: 1 });
    expect(mocks.tabsMove).toHaveBeenCalledWith(2, { index: 2 });
  });
});

// ===========================================================================
// 19. SEARCH_BOOKMARKS — bookmark without url, folderPath catch, deep nested
// ===========================================================================

describe('SEARCH_BOOKMARKS edge cases', () => {
  it('filters out bookmarks without url', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'Folder', parentId: '0' },
      { id: '2', title: 'Link', url: 'https://x.com', parentId: '0' },
    ]);
    mocks.bookmarksGet.mockResolvedValue([{ title: '', parentId: '0' }]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'test' });
    expect(res.bookmarks).toHaveLength(1);
    expect(res.bookmarks[0].url).toBe('https://x.com');
  });

  it('catches error in folderPath resolution and returns empty path', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'BM', url: 'https://x.com', parentId: '99' },
    ]);
    mocks.bookmarksGet.mockRejectedValue(new Error('not found'));
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'test' });
    expect(res.bookmarks).toHaveLength(1);
    expect(res.bookmarks[0].folderPath).toBe('');
  });

  it('resolves deeply nested folder path', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '10', title: 'Deep', url: 'https://deep.com', parentId: '3' },
    ]);
    mocks.bookmarksGet
      .mockResolvedValueOnce([{ title: 'Level3', parentId: '2' }])
      .mockResolvedValueOnce([{ title: 'Level2', parentId: '1' }])
      .mockResolvedValueOnce([{ title: 'Level1', parentId: '0' }]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'deep' });
    expect(res.bookmarks[0].folderPath).toBe('Level1 > Level2 > Level3');
  });

  it('stops walking when parentId is 0', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'BM', url: 'https://x.com', parentId: '2' },
    ]);
    mocks.bookmarksGet.mockResolvedValue([{ title: 'Root', parentId: '0' }]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'x' });
    expect(res.bookmarks[0].folderPath).toBe('Root');
  });

  it('skips parent parts with empty title', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'BM', url: 'https://x.com', parentId: '2' },
    ]);
    mocks.bookmarksGet
      .mockResolvedValueOnce([{ title: '', parentId: '1' }])
      .mockResolvedValueOnce([{ title: 'Bar', parentId: '0' }]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'x' });
    expect(res.bookmarks[0].folderPath).toBe('Bar');
  });

  it('uses empty query when msg.query is undefined', async () => {
    mocks.bookmarksSearch.mockResolvedValue([]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS' });
    expect(mocks.bookmarksSearch).toHaveBeenCalledWith('');
    expect(res.bookmarks).toEqual([]);
  });

  it('bookmark with no parentId gets empty folderPath', async () => {
    mocks.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'BM', url: 'https://x.com' },
    ]);
    const res = await dispatch({ type: 'SEARCH_BOOKMARKS', query: 'x' });
    expect(res.bookmarks[0].folderPath).toBe('');
  });
});

// ===========================================================================
// 20. ADD_BOOKMARK — catch error
// ===========================================================================

describe('ADD_BOOKMARK error branches', () => {
  it('catches bookmark creation error', async () => {
    mocks.bookmarksCreate.mockRejectedValue(new Error('create failed'));
    const res = await dispatch(
      { type: 'ADD_BOOKMARK' },
      { tab: { id: 1, url: 'https://x.com', title: 'X' } },
    );
    expect(res.error).toBe('create failed');
  });

  it('returns error when tab has url but no title', async () => {
    const res = await dispatch(
      { type: 'ADD_BOOKMARK' },
      { tab: { id: 1, url: 'https://x.com' } },
    );
    expect(res.error).toBe('No active tab info available');
  });

  it('returns error when tab has title but no url', async () => {
    const res = await dispatch(
      { type: 'ADD_BOOKMARK' },
      { tab: { id: 1, title: 'X' } },
    );
    expect(res.error).toBe('No active tab info available');
  });
});

// ===========================================================================
// 21. GET_RECENTLY_CLOSED — success and error paths
// ===========================================================================

describe('GET_RECENTLY_CLOSED', () => {
  it('returns sessions on success', async () => {
    const sessions = [{ tab: { sessionId: 'abc' } }];
    mocks.sessionsGetRecentlyClosed.mockImplementation(
      (_: unknown, cb: (s: any[]) => void) => cb(sessions),
    );
    const res = await dispatch({ type: 'GET_RECENTLY_CLOSED' });
    expect(res.sessions).toEqual(sessions);
  });

  it('returns empty sessions with error on failure', async () => {
    mocks.sessionsGetRecentlyClosed.mockImplementation(() => {
      throw new Error('session error');
    });
    const res = await dispatch({ type: 'GET_RECENTLY_CLOSED' });
    expect(res.sessions).toEqual([]);
    expect(res.error).toBe('session error');
  });
});

// ===========================================================================
// 22. GET_FAVICON, CLEAR_FAVICON_CACHE, GET_FAVICON_CACHE_STATS error paths
// ===========================================================================

describe('Favicon handler error branches', () => {
  it('GET_FAVICON_CACHE_STATS returns ERROR on failure', async () => {
    const { getFaviconCacheStats } = await import('../../favicon-cache');
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('stats fail'));
    const res = await dispatch({ type: 'GET_FAVICON_CACHE_STATS' });
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('stats fail');
  });

  it('GET_FAVICON returns null dataUrl on error', async () => {
    const { getFaviconWithCache } = await import('../../favicon-cache');
    (getFaviconWithCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fav fail'));
    const res = await dispatch({ type: 'GET_FAVICON', hostname: 'bad.com' });
    expect(res.dataUrl).toBeNull();
  });

  it('CLEAR_FAVICON_CACHE returns ERROR on failure', async () => {
    const { clearFaviconCache } = await import('../../favicon-cache');
    (clearFaviconCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('clear fail'));
    const res = await dispatch({ type: 'CLEAR_FAVICON_CACHE' });
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('clear fail');
  });

  it('CLEAR_FAVICON_CACHE returns OK with result on success', async () => {
    const { clearFaviconCache } = await import('../../favicon-cache');
    (clearFaviconCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cleared: 5, freedBytes: 1024 });
    const res = await dispatch({ type: 'CLEAR_FAVICON_CACHE' });
    expect(res.status).toBe('OK');
    expect(res.cleared).toBe(5);
  });

  it('GET_FAVICON_CACHE_STATS returns OK with stats on success', async () => {
    const { getFaviconCacheStats } = await import('../../favicon-cache');
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 3, totalSize: 512 });
    const res = await dispatch({ type: 'GET_FAVICON_CACHE_STATS' });
    expect(res.status).toBe('OK');
    expect(res.count).toBe(3);
  });

  it('GET_FAVICON returns dataUrl on success', async () => {
    const { getFaviconWithCache } = await import('../../favicon-cache');
    (getFaviconWithCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce('data:image/png;base64,abc');
    const res = await dispatch({ type: 'GET_FAVICON', hostname: 'good.com' });
    expect(res.dataUrl).toBe('data:image/png;base64,abc');
  });
});

// ===========================================================================
// 23–24. Permission helpers — undefined callback values (nullish coalescing)
// ===========================================================================

describe('Permission helper nullish coalescing branches', () => {
  it('removeOptionalPermissions resolves false when callback receives undefined', async () => {
    mocks.permissionsRemove.mockImplementation((_p: unknown, cb: (r: boolean | undefined) => void) => cb(undefined as any));
    const res = await dispatch({ type: 'REMOVE_OPTIONAL_PERMISSIONS', permissions: ['topSites'] });
    expect(res.status).toBe('OK');
    expect(res.removed).toBe(false);
  });

  it('removeOptionalPermissions resolves true when callback receives true', async () => {
    mocks.permissionsRemove.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(true));
    const res = await dispatch({ type: 'REMOVE_OPTIONAL_PERMISSIONS', permissions: ['topSites'] });
    expect(res.status).toBe('OK');
    expect(res.removed).toBe(true);
  });

  it('requestOptionalPermissions resolves false when callback receives undefined', async () => {
    mocks.permissionsRequest.mockImplementation((_p: unknown, cb: (g: boolean | undefined) => void) => cb(undefined as any));
    const res = await dispatch({ type: 'REQUEST_OPTIONAL_PERMISSIONS', permissions: ['topSites'] });
    expect(res.status).toBe('OK');
    expect(res.granted).toBe(false);
  });

  it('requestOptionalPermissions resolves true when callback receives true', async () => {
    mocks.permissionsRequest.mockImplementation((_p: unknown, cb: (g: boolean) => void) => cb(true));
    const res = await dispatch({ type: 'REQUEST_OPTIONAL_PERMISSIONS', permissions: ['topSites'] });
    expect(res.status).toBe('OK');
    expect(res.granted).toBe(true);
  });

  it('REQUEST_OPTIONAL_PERMISSIONS catches thrown error', async () => {
    mocks.permissionsRequest.mockImplementation(() => { throw new Error('perm error'); });
    const res = await dispatch({ type: 'REQUEST_OPTIONAL_PERMISSIONS', permissions: ['x'] });
    expect(res.error).toBe('perm error');
  });

  it('REMOVE_OPTIONAL_PERMISSIONS catches thrown error', async () => {
    mocks.permissionsRemove.mockImplementation(() => { throw new Error('remove error'); });
    const res = await dispatch({ type: 'REMOVE_OPTIONAL_PERMISSIONS', permissions: ['x'] });
    expect(res.error).toBe('remove error');
  });

  it('REQUEST_OPTIONAL_PERMISSIONS uses empty array when permissions is undefined', async () => {
    const res = await dispatch({ type: 'REQUEST_OPTIONAL_PERMISSIONS' });
    expect(res.status).toBe('OK');
  });

  it('REMOVE_OPTIONAL_PERMISSIONS uses empty array when permissions is undefined', async () => {
    const res = await dispatch({ type: 'REMOVE_OPTIONAL_PERMISSIONS' });
    expect(res.status).toBe('OK');
  });

  it('CHECK_PERMISSIONS uses empty array when permissions is undefined', async () => {
    const res = await dispatch({ type: 'CHECK_PERMISSIONS' });
    expect(res.status).toBe('OK');
    expect(res.granted).toBe(true);
  });

  it('CHECK_PERMISSIONS catches thrown error', async () => {
    mocks.permissionsContains.mockImplementation(() => { throw new Error('check error'); });
    const res = await dispatch({ type: 'CHECK_PERMISSIONS', permissions: ['x'] });
    expect(res.error).toBe('check error');
  });
});

// ===========================================================================
// Additional coverage: DISCARD_TAB / DISCARD_OTHER_TABS edge cases
// ===========================================================================

describe('DISCARD_TAB error branches', () => {
  it('returns error when no tabId and no sender.tab', async () => {
    const res = await dispatch({ type: 'DISCARD_TAB' }, {});
    expect(res.error).toBe('No tab to discard');
  });

  it('uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'DISCARD_TAB' }, { tab: { id: 15 } });
    expect(res.status).toBe('OK');
    expect(mocks.tabsDiscard).toHaveBeenCalledWith(15);
  });
});

describe('DISCARD_OTHER_TABS edge cases', () => {
  it('skips tabs that are active', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, active: true, discarded: false },
      { id: 2, active: true, discarded: false },
    ]);
    const res = await dispatch({ type: 'DISCARD_OTHER_TABS', tabId: 1 });
    expect(res.discarded).toBe(0);
  });

  it('skips tabs that are already discarded', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, active: true, discarded: false },
      { id: 2, active: false, discarded: true },
    ]);
    const res = await dispatch({ type: 'DISCARD_OTHER_TABS', tabId: 1 });
    expect(res.discarded).toBe(0);
  });

  it('skips tabs without id', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, active: true, discarded: false },
      { active: false, discarded: false },
    ]);
    const res = await dispatch({ type: 'DISCARD_OTHER_TABS', tabId: 1 });
    expect(res.discarded).toBe(0);
  });

  it('catches discard error silently', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 1, active: true, discarded: false },
      { id: 2, active: false, discarded: false },
    ]);
    mocks.tabsDiscard.mockRejectedValue(new Error('cannot discard'));
    const res = await dispatch({ type: 'DISCARD_OTHER_TABS', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(res.discarded).toBe(0);
  });

  it('uses sender.tab.id to exclude active tab', async () => {
    mocks.tabsQuery.mockResolvedValue([
      { id: 10, active: false, discarded: false },
      { id: 11, active: false, discarded: false },
    ]);
    const res = await dispatch({ type: 'DISCARD_OTHER_TABS' }, { tab: { id: 10 } });
    expect(res.discarded).toBe(1);
  });
});

// ===========================================================================
// MOVE_TAB_NEW_WINDOW error branch
// ===========================================================================

describe('MOVE_TAB_NEW_WINDOW error branches', () => {
  it('returns error when no tabId', async () => {
    const res = await dispatch({ type: 'MOVE_TAB_NEW_WINDOW' }, {});
    expect(res.error).toBe('No tab to move');
  });

  it('uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'MOVE_TAB_NEW_WINDOW' }, { tab: { id: 20 } });
    expect(res.status).toBe('OK');
    expect(mocks.windowsCreate).toHaveBeenCalledWith({ tabId: 20 });
  });
});

// ===========================================================================
// SCROLL handlers — no-tab error branches
// ===========================================================================

describe('Scroll handler no-tab branches', () => {
  it('SCROLL_TO_TOP returns error when no tab', async () => {
    const res = await dispatch({ type: 'SCROLL_TO_TOP' }, {});
    expect(res.error).toBe('No tab');
  });

  it('SCROLL_TO_TOP uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'SCROLL_TO_TOP' }, { tab: { id: 30 } });
    expect(res.status).toBe('OK');
  });

  it('SCROLL_TO_BOTTOM returns error when no tab', async () => {
    const res = await dispatch({ type: 'SCROLL_TO_BOTTOM' }, {});
    expect(res.error).toBe('No tab');
  });

  it('SCROLL_TO_BOTTOM uses sender.tab.id fallback', async () => {
    const res = await dispatch({ type: 'SCROLL_TO_BOTTOM' }, { tab: { id: 31 } });
    expect(res.status).toBe('OK');
  });
});

// ===========================================================================
// GET_WINDOWS edge cases
// ===========================================================================

describe('GET_WINDOWS edge cases', () => {
  it('filters out popup windows', async () => {
    mocks.windowsGetAll.mockResolvedValue([
      { id: 1, type: 'normal', tabs: [{ id: 10, active: true, title: 'T', favIconUrl: 'f' }] },
      { id: 2, type: 'popup', tabs: [] },
    ]);
    const res = await dispatch({ type: 'GET_WINDOWS' }, { tab: { windowId: 1 } });
    expect(res.windows).toHaveLength(1);
  });

  it('handles window without active tab', async () => {
    mocks.windowsGetAll.mockResolvedValue([
      { id: 1, type: 'normal', tabs: [{ id: 10, active: false }] },
    ]);
    const res = await dispatch({ type: 'GET_WINDOWS' }, {});
    expect(res.windows[0].activeTabTitle).toBe('New Tab');
    expect(res.windows[0].activeTabFavicon).toBe('');
  });

  it('handles window without tabs array', async () => {
    mocks.windowsGetAll.mockResolvedValue([
      { id: 1, type: 'normal' },
    ]);
    const res = await dispatch({ type: 'GET_WINDOWS' }, {});
    expect(res.windows[0].tabCount).toBe(0);
  });

  it('marks current window as isCurrent', async () => {
    mocks.windowsGetAll.mockResolvedValue([
      { id: 5, type: 'normal', tabs: [] },
      { id: 6, type: 'normal', tabs: [] },
    ]);
    const res = await dispatch({ type: 'GET_WINDOWS' }, { tab: { windowId: 5 } });
    expect(res.windows.find((w: any) => w.id === 5).isCurrent).toBe(true);
    expect(res.windows.find((w: any) => w.id === 6).isCurrent).toBe(false);
  });

  it('filters out windows with undefined id', async () => {
    mocks.windowsGetAll.mockResolvedValue([
      { type: 'normal', tabs: [] },
      { id: 1, type: 'normal', tabs: [] },
    ]);
    const res = await dispatch({ type: 'GET_WINDOWS' }, {});
    expect(res.windows).toHaveLength(1);
  });
});

// ===========================================================================
// MERGE_WINDOWS edge cases
// ===========================================================================

describe('MERGE_WINDOWS edge cases', () => {
  it('skips tabs without id', async () => {
    mocks.windowsGetCurrent.mockResolvedValue({ id: 1 });
    mocks.windowsGetAll.mockResolvedValue([
      { id: 1 },
      { id: 2, tabs: [{ id: undefined }, { id: 20 }] },
    ]);
    const res = await dispatch({ type: 'MERGE_WINDOWS' });
    expect(res.moved).toBe(1);
    expect(mocks.tabsMove).toHaveBeenCalledTimes(1);
  });

  it('skips windows without tabs', async () => {
    mocks.windowsGetCurrent.mockResolvedValue({ id: 1 });
    mocks.windowsGetAll.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);
    const res = await dispatch({ type: 'MERGE_WINDOWS' });
    expect(res.moved).toBe(0);
  });
});

// ===========================================================================
// CLOSE_ALL_TABS — toRemove.length === 0 branch
// ===========================================================================

describe('CLOSE_ALL_TABS', () => {
  it('does not call remove when no tabs to close', async () => {
    mocks.tabsQuery.mockResolvedValue([]);
    const res = await dispatch({ type: 'CLOSE_ALL_TABS' });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(0);
    expect(mocks.tabsRemove).not.toHaveBeenCalled();
  });

  it('closes all tabs and creates new tab', async () => {
    mocks.tabsQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await dispatch({ type: 'CLOSE_ALL_TABS' });
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: 'chrome://newtab' });
    expect(mocks.tabsRemove).toHaveBeenCalledWith([1, 2]);
  });
});

// ===========================================================================
// PIN_TAB / MUTE_TAB — toggle logic branches
// ===========================================================================

describe('PIN_TAB toggle logic', () => {
  it('unpins a pinned tab', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, pinned: true });
    const res = await dispatch({ type: 'PIN_TAB', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(1, { pinned: false });
  });

  it('pins an unpinned tab', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, pinned: false });
    const res = await dispatch({ type: 'PIN_TAB', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(1, { pinned: true });
  });
});

describe('MUTE_TAB toggle logic', () => {
  it('unmutes a muted tab', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, mutedInfo: { muted: true } });
    const res = await dispatch({ type: 'MUTE_TAB', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(1, { muted: false });
  });

  it('mutes an unmuted tab', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1, mutedInfo: { muted: false } });
    const res = await dispatch({ type: 'MUTE_TAB', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(1, { muted: true });
  });

  it('handles tab with no mutedInfo (treats as unmuted)', async () => {
    mocks.tabsGet.mockResolvedValue({ id: 1 });
    const res = await dispatch({ type: 'MUTE_TAB', tabId: 1 });
    expect(res.status).toBe('OK');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(1, { muted: true });
  });
});

// ===========================================================================
// REOPEN_TAB — error path
// ===========================================================================

describe('REOPEN_TAB error branches', () => {
  it('returns error on failure', async () => {
    mocks.sessionsRestore.mockRejectedValue(new Error('restore fail'));
    const res = await dispatch({ type: 'REOPEN_TAB', sessionId: 'abc' });
    expect(res.error).toBe('restore fail');
  });
});

// ===========================================================================
// GET_RECENT_BOOKMARKS — error path
// ===========================================================================

describe('GET_RECENT_BOOKMARKS error branches', () => {
  it('returns empty bookmarks with error on failure', async () => {
    mocks.bookmarksGetRecent.mockRejectedValue(new Error('recent fail'));
    const res = await dispatch({ type: 'GET_RECENT_BOOKMARKS' });
    expect(res.bookmarks).toEqual([]);
    expect(res.error).toBe('recent fail');
  });
});

// ===========================================================================
// Browsing data handlers — permission denied + error catch
// ===========================================================================

describe('Browsing data permission and error branches', () => {
  const bdHandlers = [
    'CLEAR_BROWSER_CACHE',
    'CLEAR_COOKIES',
    'CLEAR_LOCAL_STORAGE',
    'CLEAR_DOWNLOADS_HISTORY',
    'CLEAR_FORM_DATA',
    'CLEAR_PASSWORDS',
    'CLEAR_LAST_HOUR',
    'CLEAR_LAST_DAY',
  ];

  for (const type of bdHandlers) {
    it(`${type} returns error when browsingData permission denied`, async () => {
      mocks.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(false));
      const res = await dispatch({ type });
      expect(res.error).toContain('browsingData');
    });
  }

  it('CLEAR_BROWSER_CACHE catches thrown error', async () => {
    mocks.browsingDataRemoveCache.mockRejectedValue(new Error('cache err'));
    const res = await dispatch({ type: 'CLEAR_BROWSER_CACHE' });
    expect(res.error).toBe('cache err');
  });

  it('CLEAR_COOKIES catches thrown error', async () => {
    mocks.browsingDataRemoveCookies.mockRejectedValue(new Error('cookie err'));
    const res = await dispatch({ type: 'CLEAR_COOKIES' });
    expect(res.error).toBe('cookie err');
  });

  it('CLEAR_LOCAL_STORAGE catches thrown error', async () => {
    mocks.browsingDataRemoveLocalStorage.mockRejectedValue(new Error('ls err'));
    const res = await dispatch({ type: 'CLEAR_LOCAL_STORAGE' });
    expect(res.error).toBe('ls err');
  });

  it('CLEAR_DOWNLOADS_HISTORY catches thrown error', async () => {
    mocks.browsingDataRemoveDownloads.mockRejectedValue(new Error('dl err'));
    const res = await dispatch({ type: 'CLEAR_DOWNLOADS_HISTORY' });
    expect(res.error).toBe('dl err');
  });

  it('CLEAR_FORM_DATA catches thrown error', async () => {
    mocks.browsingDataRemoveFormData.mockRejectedValue(new Error('form err'));
    const res = await dispatch({ type: 'CLEAR_FORM_DATA' });
    expect(res.error).toBe('form err');
  });

  it('CLEAR_PASSWORDS catches thrown error', async () => {
    mocks.browsingDataRemovePasswords.mockRejectedValue(new Error('pw err'));
    const res = await dispatch({ type: 'CLEAR_PASSWORDS' });
    expect(res.error).toBe('pw err');
  });

  it('CLEAR_LAST_HOUR catches thrown error', async () => {
    mocks.browsingDataRemove.mockRejectedValue(new Error('hour err'));
    const res = await dispatch({ type: 'CLEAR_LAST_HOUR' });
    expect(res.error).toBe('hour err');
  });

  it('CLEAR_LAST_DAY catches thrown error', async () => {
    mocks.browsingDataRemove.mockRejectedValue(new Error('day err'));
    const res = await dispatch({ type: 'CLEAR_LAST_DAY' });
    expect(res.error).toBe('day err');
  });
});

// ===========================================================================
// GET_TOP_SITES — permission denied + error catch
// ===========================================================================

describe('GET_TOP_SITES error branches', () => {
  it('returns error when topSites permission denied', async () => {
    mocks.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => cb(false));
    const res = await dispatch({ type: 'GET_TOP_SITES' });
    expect(res.error).toContain('topSites');
  });

  it('catches error during topSites fetch', async () => {
    mocks.topSitesGet.mockImplementation(() => { throw new Error('top err'); });
    const res = await dispatch({ type: 'GET_TOP_SITES' });
    expect(res.error).toBe('top err');
  });
});

// ===========================================================================
// MOVE_TAB_TO_WINDOW — sender.tab.id fallback
// ===========================================================================

describe('MOVE_TAB_TO_WINDOW edge cases', () => {
  it('uses sender.tab.id fallback when msg.tabId is absent', async () => {
    const res = await dispatch(
      { type: 'MOVE_TAB_TO_WINDOW', targetWindowId: 2 },
      { tab: { id: 5 } },
    );
    expect(res.status).toBe('OK');
    expect(mocks.tabsMove).toHaveBeenCalledWith(5, { windowId: 2, index: -1 });
  });
});
