 
import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';
import { browserAPI } from '../../core/helpers';

const log = Logger.forComponent('CommandHandlers');

function hasOptionalPermission(perm: string): Promise<boolean> {
  return new Promise((resolve) => {
    (browserAPI as typeof chrome).permissions.contains({ permissions: [perm] }, resolve);
  });
}

function requestOptionalPermissions(perms: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    (browserAPI as typeof chrome).permissions.request({ permissions: perms }, (granted) => resolve(granted ?? false));
  });
}

function removeOptionalPermissions(perms: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    (browserAPI as typeof chrome).permissions.remove({ permissions: perms }, (removed) => resolve(removed ?? false));
  });
}

function getTopSites(): Promise<chrome.topSites.MostVisitedURL[]> {
  return new Promise((resolve) => {
    (browserAPI as typeof chrome).topSites.get(resolve);
  });
}

export function registerCommandHandlers(registry: MessageHandlerRegistry): void {
  // ===== Tab handlers =====

  registry.register('GET_OPEN_TABS', async (_msg, _sender, sendResponse) => {
    const tabs = await browserAPI.tabs.query({});
    sendResponse({ tabs });
  });

  registry.register('SWITCH_TO_TAB', async (msg, _sender, sendResponse) => {
    const { tabId, windowId } = msg;
    await browserAPI.tabs.update(tabId, { active: true });
    await browserAPI.windows.update(windowId, { focused: true });
    sendResponse({ status: 'OK' });
  });

  registry.register('CLOSE_TAB', async (msg, sender, sendResponse) => {
    const targetTabId = msg.tabId ?? sender.tab?.id;
    if (targetTabId) {
      await browserAPI.tabs.remove(targetTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to close' });
    }
  });

  registry.register('DUPLICATE_TAB', async (msg, sender, sendResponse) => {
    const dupTabId = msg.tabId ?? sender.tab?.id;
    if (dupTabId) {
      await browserAPI.tabs.duplicate(dupTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to duplicate' });
    }
  });

  registry.register('PIN_TAB', async (msg, sender, sendResponse) => {
    const pinTabId = msg.tabId ?? sender.tab?.id;
    if (pinTabId) {
      const tab = await browserAPI.tabs.get(pinTabId);
      await browserAPI.tabs.update(pinTabId, { pinned: !tab.pinned });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to pin' });
    }
  });

  registry.register('UNPIN_TAB', async (msg, sender, sendResponse) => {
    const unpinTabId = msg.tabId ?? sender.tab?.id;
    if (unpinTabId) {
      await browserAPI.tabs.update(unpinTabId, { pinned: false });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('MUTE_TAB', async (msg, sender, sendResponse) => {
    const muteTabId = msg.tabId ?? sender.tab?.id;
    if (muteTabId) {
      const tab = await browserAPI.tabs.get(muteTabId);
      await browserAPI.tabs.update(muteTabId, { muted: !tab.mutedInfo?.muted });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to mute' });
    }
  });

  registry.register('UNMUTE_TAB', async (msg, sender, sendResponse) => {
    const unmuteTabId = msg.tabId ?? sender.tab?.id;
    if (unmuteTabId) {
      await browserAPI.tabs.update(unmuteTabId, { muted: false });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('TAB_RELOAD', async (msg, sender, sendResponse) => {
    const reloadTabId = msg.tabId ?? sender.tab?.id;
    if (reloadTabId) {
      await browserAPI.tabs.reload(reloadTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to reload' });
    }
  });

  registry.register('TAB_HARD_RELOAD', async (msg, sender, sendResponse) => {
    const hardReloadTabId = msg.tabId ?? sender.tab?.id;
    if (hardReloadTabId) {
      await browserAPI.tabs.reload(hardReloadTabId, { bypassCache: true });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to reload' });
    }
  });

  registry.register('TAB_GO_BACK', async (msg, sender, sendResponse) => {
    const backTabId = msg.tabId ?? sender.tab?.id;
    if (backTabId) {
      await browserAPI.tabs.goBack(backTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('TAB_GO_FORWARD', async (msg, sender, sendResponse) => {
    const fwdTabId = msg.tabId ?? sender.tab?.id;
    if (fwdTabId) {
      await browserAPI.tabs.goForward(fwdTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('TAB_ZOOM', async (msg, sender, sendResponse) => {
    const zoomTabId = msg.tabId ?? sender.tab?.id;
    if (zoomTabId) {
      const currentZoom = await new Promise<number>((resolve) => {
        browserAPI.tabs.getZoom(zoomTabId, resolve);
      });
      let newZoom = currentZoom;
      if (msg.direction === 'in') { newZoom = Math.min(currentZoom + 0.1, 5); }
      else if (msg.direction === 'out') { newZoom = Math.max(currentZoom - 0.1, 0.25); }
      else if (msg.direction === 'reset') { newZoom = 1; }
      browserAPI.tabs.setZoom(zoomTabId, newZoom);
      sendResponse({ status: 'OK', zoom: newZoom });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('TAB_VIEW_SOURCE', async (_msg, sender, sendResponse) => {
    const vsTabId = sender.tab?.id;
    if (vsTabId && sender.tab?.url) {
      await browserAPI.tabs.create({ url: `view-source:${sender.tab.url}` });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab URL' });
    }
  });

  registry.register('CLOSE_OTHER_TABS', async (msg, sender, sendResponse) => {
    const activeTabId = msg.tabId ?? sender.tab?.id;
    if (activeTabId) {
      const tabs = await browserAPI.tabs.query({ currentWindow: true });
      const toRemove = tabs.filter((t: chrome.tabs.Tab) => t.id !== activeTabId && !t.pinned).map((t: chrome.tabs.Tab) => t.id!);
      if (toRemove.length) { await browserAPI.tabs.remove(toRemove); }
      sendResponse({ status: 'OK', closed: toRemove.length });
    } else {
      sendResponse({ error: 'No active tab' });
    }
  });

  registry.register('CLOSE_TABS_RIGHT', async (_msg, sender, sendResponse) => {
    const senderTab = sender.tab ?? (await browserAPI.tabs.query({ active: true, currentWindow: true }))[0];
    if (senderTab?.id !== null && senderTab?.id !== undefined && senderTab.index !== null && senderTab.index !== undefined) {
      const tabs = await browserAPI.tabs.query({ currentWindow: true });
      const toRemove = tabs.filter((t: chrome.tabs.Tab) => t.index > senderTab.index && !t.pinned).map((t: chrome.tabs.Tab) => t.id!);
      if (toRemove.length) { await browserAPI.tabs.remove(toRemove); }
      sendResponse({ status: 'OK', closed: toRemove.length });
    } else {
      sendResponse({ error: 'No tab context' });
    }
  });

  registry.register('CLOSE_TABS_LEFT', async (_msg, sender, sendResponse) => {
    const senderTabL = sender.tab ?? (await browserAPI.tabs.query({ active: true, currentWindow: true }))[0];
    if (senderTabL?.id !== null && senderTabL?.id !== undefined && senderTabL.index !== null && senderTabL.index !== undefined) {
      const tabs = await browserAPI.tabs.query({ currentWindow: true });
      const toRemove = tabs.filter((t: chrome.tabs.Tab) => t.index < senderTabL.index && !t.pinned).map((t: chrome.tabs.Tab) => t.id!);
      if (toRemove.length) { await browserAPI.tabs.remove(toRemove); }
      sendResponse({ status: 'OK', closed: toRemove.length });
    } else {
      sendResponse({ error: 'No tab context' });
    }
  });

  registry.register('CLOSE_ALL_TABS', async (_msg, _sender, sendResponse) => {
    const tabs = await browserAPI.tabs.query({ currentWindow: true });
    await browserAPI.tabs.create({ url: 'chrome://newtab' });
    const toRemove = tabs.map((t: chrome.tabs.Tab) => t.id!);
    if (toRemove.length) { await browserAPI.tabs.remove(toRemove); }
    sendResponse({ status: 'OK', closed: toRemove.length });
  });

  registry.register('DISCARD_TAB', async (msg, sender, sendResponse) => {
    const discardTabId = msg.tabId ?? sender.tab?.id;
    if (discardTabId) {
      await browserAPI.tabs.discard(discardTabId);
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to discard' });
    }
  });

  registry.register('DISCARD_OTHER_TABS', async (msg, sender, sendResponse) => {
    const activeDiscardId = msg.tabId ?? sender.tab?.id;
    const allTabs = await browserAPI.tabs.query({ currentWindow: true });
    let discardedCount = 0;
    for (const t of allTabs) {
      if (t.id && t.id !== activeDiscardId && !t.active && !t.discarded) {
        try { await browserAPI.tabs.discard(t.id); discardedCount++; } catch { /* pinned/active tabs can't be discarded */ }
      }
    }
    sendResponse({ status: 'OK', discarded: discardedCount });
  });

  registry.register('MOVE_TAB_NEW_WINDOW', async (msg, sender, sendResponse) => {
    const moveTabId = msg.tabId ?? sender.tab?.id;
    if (moveTabId) {
      await browserAPI.windows.create({ tabId: moveTabId });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab to move' });
    }
  });

  registry.register('SORT_TABS', async (_msg, _sender, sendResponse) => {
    const sortTabs = await browserAPI.tabs.query({ currentWindow: true });
    const pinned = sortTabs.filter((t: chrome.tabs.Tab) => t.pinned);
    const unpinned = sortTabs.filter((t: chrome.tabs.Tab) => !t.pinned);
    unpinned.sort((a: chrome.tabs.Tab, b: chrome.tabs.Tab) => (a.url ?? '').localeCompare(b.url ?? ''));
    for (let i = 0; i < unpinned.length; i++) {
      if (unpinned[i].id) {
        await browserAPI.tabs.move(unpinned[i].id!, { index: pinned.length + i });
      }
    }
    sendResponse({ status: 'OK', sorted: unpinned.length });
  });

  // ===== Window handlers =====

  registry.register('WINDOW_CREATE', async (msg, _sender, sendResponse) => {
    const ALLOWED_SCHEMES = ['http:', 'https:', 'chrome:', 'chrome-extension:'];
    const safeUrl = (raw: unknown): string | undefined => {
      if (typeof raw !== 'string' || !raw) { return undefined; }
      try {
        const parsed = new URL(raw);
        return ALLOWED_SCHEMES.includes(parsed.protocol) ? raw : undefined;
      } catch { return undefined; }
    };

    if (msg.windowType === 'incognito') {
      await browserAPI.windows.create({ incognito: true });
    } else if (msg.windowType === 'window') {
      await browserAPI.windows.create({});
    } else if (msg.windowType === 'background-tab') {
      const url = safeUrl(msg.url);
      if (!url) { sendResponse({ status: 'ERROR', message: 'Invalid or disallowed URL scheme' }); return; }
      await browserAPI.tabs.create({ url, active: false });
    } else {
      const url = safeUrl(msg.url) || 'chrome://newtab';
      await browserAPI.tabs.create({ url });
    }
    sendResponse({ status: 'OK' });
  });

  registry.register('GET_WINDOWS', async (_msg, sender, sendResponse) => {
    const allWins = await browserAPI.windows.getAll({ populate: true });
    const senderWindowId = sender.tab?.windowId;
    const windowList = allWins
      .filter(w => w.type === 'normal' && w.id !== undefined)
      .map(w => {
        const activeTab = w.tabs?.find(t => t.active);
        return {
          id: w.id!,
          tabCount: w.tabs?.length ?? 0,
          activeTabTitle: activeTab?.title ?? 'New Tab',
          activeTabFavicon: activeTab?.favIconUrl ?? '',
          isCurrent: w.id === senderWindowId,
        };
      });
    sendResponse({ windows: windowList });
  });

  registry.register('MOVE_TAB_TO_WINDOW', async (msg, sender, sendResponse) => {
    const srcTabId = msg.tabId ?? sender.tab?.id;
    const targetWinId = msg.targetWindowId as number | undefined;
    if (!srcTabId) {
      sendResponse({ error: 'No tab to move' });
      return;
    }
    if (!targetWinId) {
      sendResponse({ error: 'No target window specified' });
      return;
    }
    await browserAPI.tabs.move(srcTabId, { windowId: targetWinId, index: -1 });
    await browserAPI.tabs.update(srcTabId, { active: true });
    await browserAPI.windows.update(targetWinId, { focused: true });
    sendResponse({ status: 'OK' });
  });

  registry.register('MERGE_WINDOWS', async (_msg, _sender, sendResponse) => {
    const currentWindow = await browserAPI.windows.getCurrent();
    const allWindows = await browserAPI.windows.getAll({ populate: true });
    let movedCount = 0;
    for (const w of allWindows) {
      if (w.id !== currentWindow.id && w.tabs) {
        for (const t of w.tabs) {
          if (t.id) {
            await browserAPI.tabs.move(t.id, { windowId: currentWindow.id!, index: -1 });
            movedCount++;
          }
        }
      }
    }
    sendResponse({ status: 'OK', moved: movedCount });
  });

  // ===== Group handlers =====

  registry.register('GROUP_TAB', async (msg, sender, sendResponse) => {
    const groupTabId = msg.tabId ?? sender.tab?.id;
    if (groupTabId) {
      try {
        if (!await hasOptionalPermission('tabGroups')) {
          sendResponse({ error: 'tabGroups permission not granted. Enable Advanced Browser Commands in settings.' });
          return;
        }
        const groupId = await (browserAPI as typeof chrome).tabs.group({ tabIds: groupTabId });
        sendResponse({ status: 'OK', groupId });
      } catch (err) {
        sendResponse({ error: (err as Error).message });
      }
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('UNGROUP_TAB', async (msg, sender, sendResponse) => {
    const ungroupTabId = msg.tabId ?? sender.tab?.id;
    if (ungroupTabId) {
      try {
        await (browserAPI as typeof chrome).tabs.ungroup(ungroupTabId);
        sendResponse({ status: 'OK' });
      } catch (err) {
        sendResponse({ error: (err as Error).message });
      }
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('COLLAPSE_GROUPS', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('tabGroups')) {
        sendResponse({ error: 'tabGroups permission not granted' });
        return;
      }
      const groups = await (browserAPI as typeof chrome).tabGroups.query({ windowId: (browserAPI as typeof chrome).windows.WINDOW_ID_CURRENT });
      for (const g of groups) {
        await (browserAPI as typeof chrome).tabGroups.update(g.id, { collapsed: true });
      }
      sendResponse({ status: 'OK', collapsed: groups.length });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('EXPAND_GROUPS', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('tabGroups')) {
        sendResponse({ error: 'tabGroups permission not granted' });
        return;
      }
      const groups = await (browserAPI as typeof chrome).tabGroups.query({ windowId: (browserAPI as typeof chrome).windows.WINDOW_ID_CURRENT });
      for (const g of groups) {
        await (browserAPI as typeof chrome).tabGroups.update(g.id, { collapsed: false });
      }
      sendResponse({ status: 'OK', expanded: groups.length });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('NAME_GROUP', async (msg, sender, sendResponse) => {
    try {
      const nameTabId = msg.tabId ?? sender.tab?.id;
      if (!nameTabId) { sendResponse({ error: 'No tab' }); return; }
      const tab = await browserAPI.tabs.get(nameTabId);
      if (tab.groupId && tab.groupId !== -1) {
        await (browserAPI as typeof chrome).tabGroups.update(tab.groupId, { title: msg.name ?? 'Group' });
        sendResponse({ status: 'OK' });
      } else {
        sendResponse({ error: 'Tab is not in a group' });
      }
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('COLOR_GROUP', async (msg, sender, sendResponse) => {
    try {
      const colorTabId = msg.tabId ?? sender.tab?.id;
      if (!colorTabId) { sendResponse({ error: 'No tab' }); return; }
      const tab = await browserAPI.tabs.get(colorTabId);
      if (tab.groupId && tab.groupId !== -1) {
        const color = msg.color ?? 'blue';
        await (browserAPI as typeof chrome).tabGroups.update(tab.groupId, { color: color as chrome.tabGroups.ColorEnum });
        sendResponse({ status: 'OK' });
      } else {
        sendResponse({ error: 'Tab is not in a group' });
      }
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLOSE_GROUP', async (msg, sender, sendResponse) => {
    try {
      const closeGroupTabId = msg.tabId ?? sender.tab?.id;
      if (!closeGroupTabId) { sendResponse({ error: 'No tab' }); return; }
      const tab = await browserAPI.tabs.get(closeGroupTabId);
      if (tab.groupId && tab.groupId !== -1) {
        const groupTabs = await browserAPI.tabs.query({ groupId: tab.groupId });
        const ids = groupTabs.map((t: chrome.tabs.Tab) => t.id!).filter(Boolean);
        if (ids.length) { await browserAPI.tabs.remove(ids); }
        sendResponse({ status: 'OK', closed: ids.length });
      } else {
        sendResponse({ error: 'Tab is not in a group' });
      }
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('UNGROUP_ALL', async (_msg, _sender, sendResponse) => {
    try {
      const allGroupedTabs = await browserAPI.tabs.query({ currentWindow: true });
      const grouped = allGroupedTabs.filter((t: chrome.tabs.Tab) => t.groupId && t.groupId !== -1);
      for (const t of grouped) {
        if (t.id) { await (browserAPI as typeof chrome).tabs.ungroup(t.id); }
      }
      sendResponse({ status: 'OK', ungrouped: grouped.length });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLOSE_DUPLICATES', async (_msg, _sender, sendResponse) => {
    const dedupTabs = await browserAPI.tabs.query({ currentWindow: true });
    const seen = new Map<string, number>();
    const toRemove: number[] = [];
    for (const t of dedupTabs) {
      if (t.url && t.id) {
        const normalized = t.url.replace(/#.*$/, '');
        if (seen.has(normalized)) {
          toRemove.push(t.id);
        } else {
          seen.set(normalized, t.id);
        }
      }
    }
    if (toRemove.length) { await browserAPI.tabs.remove(toRemove); }
    sendResponse({ status: 'OK', closed: toRemove.length });
  });

  // ===== Scroll handlers =====

  registry.register('SCROLL_TO_TOP', async (msg, sender, sendResponse) => {
    const scrollTopTabId = msg.tabId ?? sender.tab?.id;
    if (scrollTopTabId) {
      await (browserAPI as typeof chrome).scripting.executeScript({
        target: { tabId: scrollTopTabId },
        func: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  registry.register('SCROLL_TO_BOTTOM', async (msg, sender, sendResponse) => {
    const scrollBtmTabId = msg.tabId ?? sender.tab?.id;
    if (scrollBtmTabId) {
      await (browserAPI as typeof chrome).scripting.executeScript({
        target: { tabId: scrollBtmTabId },
        func: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
      });
      sendResponse({ status: 'OK' });
    } else {
      sendResponse({ error: 'No tab' });
    }
  });

  // ===== Bookmark handlers =====

  registry.register('SEARCH_BOOKMARKS', async (msg, _sender, sendResponse) => {
    try {
      const bookmarks = await browserAPI.bookmarks.search(msg.query || '');
      const withPaths = await Promise.all(
        bookmarks.filter((b: chrome.bookmarks.BookmarkTreeNode) => b.url).map(async (b: chrome.bookmarks.BookmarkTreeNode) => {
          let folderPath = '';
          try {
            let parentId = b.parentId;
            const parts: string[] = [];
            let depth = 0;
            const MAX_BOOKMARK_DEPTH = 20;
            while (parentId && parentId !== '0' && depth++ < MAX_BOOKMARK_DEPTH) {
              const parents = await browserAPI.bookmarks.get(parentId);
              if (parents[0]?.title) { parts.unshift(parents[0].title); }
              parentId = parents[0]?.parentId;
            }
            folderPath = parts.join(' > ');
          } catch { /* root node */ }
          return { ...b, folderPath };
        })
      );
      sendResponse({ bookmarks: withPaths });
    } catch (err) {
      sendResponse({ bookmarks: [], error: (err as Error).message });
    }
  });

  registry.register('GET_RECENT_BOOKMARKS', async (_msg, _sender, sendResponse) => {
    try {
      const bookmarks = await browserAPI.bookmarks.getRecent(15);
      sendResponse({ bookmarks });
    } catch (err) {
      sendResponse({ bookmarks: [], error: (err as Error).message });
    }
  });

  registry.register('ADD_BOOKMARK', async (_msg, sender, sendResponse) => {
    try {
      const tab = sender.tab;
      if (tab?.url && tab?.title) {
        await browserAPI.bookmarks.create({ title: tab.title, url: tab.url });
        sendResponse({ status: 'OK' });
      } else {
        sendResponse({ error: 'No active tab info available' });
      }
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  // ===== Session handlers =====

  registry.register('GET_RECENTLY_CLOSED', async (_msg, _sender, sendResponse) => {
    try {
      const sessions = await new Promise<chrome.sessions.Session[]>((resolve) => {
        browserAPI.sessions.getRecentlyClosed({ maxResults: 10 }, resolve);
      });
      sendResponse({ sessions });
    } catch (err) {
      sendResponse({ sessions: [], error: (err as Error).message });
    }
  });

  registry.register('REOPEN_TAB', async (msg, _sender, sendResponse) => {
    try {
      await browserAPI.sessions.restore(msg.sessionId);
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  // ===== Browsing data handlers =====

  registry.register('CLEAR_BROWSER_CACHE', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) {
        sendResponse({ error: 'browsingData permission not granted. Enable Advanced Browser Commands in settings.' });
        return;
      }
      await (browserAPI as typeof chrome).browsingData.removeCache({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_COOKIES', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      await (browserAPI as typeof chrome).browsingData.removeCookies({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_LOCAL_STORAGE', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      await (browserAPI as typeof chrome).browsingData.removeLocalStorage({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_DOWNLOADS_HISTORY', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      await (browserAPI as typeof chrome).browsingData.removeDownloads({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_FORM_DATA', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      await (browserAPI as typeof chrome).browsingData.removeFormData({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_PASSWORDS', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      await (browserAPI as typeof chrome).browsingData.removePasswords({});
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_LAST_HOUR', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      const since = Date.now() - (60 * 60 * 1000);
      await (browserAPI as typeof chrome).browsingData.remove({ since }, {
        cache: true, cookies: true, downloads: true,
        formData: true, history: true, localStorage: true,
      });
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CLEAR_LAST_DAY', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('browsingData')) { sendResponse({ error: 'browsingData permission not granted' }); return; }
      const since = Date.now() - (24 * 60 * 60 * 1000);
      await (browserAPI as typeof chrome).browsingData.remove({ since }, {
        cache: true, cookies: true, downloads: true,
        formData: true, history: true, localStorage: true,
      });
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  // ===== Permission handlers =====

  registry.register('GET_TOP_SITES', async (_msg, _sender, sendResponse) => {
    try {
      if (!await hasOptionalPermission('topSites')) {
        sendResponse({ error: 'topSites permission not granted. Enable Advanced Browser Commands in settings.' });
        return;
      }
      const sites = await getTopSites();
      sendResponse({ status: 'OK', sites });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('REQUEST_OPTIONAL_PERMISSIONS', async (msg, _sender, sendResponse) => {
    try {
      const granted = await requestOptionalPermissions(msg.permissions ?? []);
      sendResponse({ status: 'OK', granted });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('CHECK_PERMISSIONS', async (msg, _sender, sendResponse) => {
    try {
      const permsToCheck: string[] = msg.permissions ?? [];
      const results = await Promise.all(permsToCheck.map((p: string) => hasOptionalPermission(p)));
      sendResponse({ status: 'OK', granted: results.every(Boolean) });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  registry.register('REMOVE_OPTIONAL_PERMISSIONS', async (msg, _sender, sendResponse) => {
    try {
      const removed = await removeOptionalPermissions(msg.permissions ?? []);
      sendResponse({ status: 'OK', removed });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  // ===== Favicon handlers =====

  registry.register('CLEAR_FAVICON_CACHE', async (_msg, _sender, sendResponse) => {
    log.info('handle', 'CLEAR_FAVICON_CACHE requested');
    try {
      const { clearFaviconCache } = await import('../favicon-cache');
      const result = await clearFaviconCache();
      log.info('handle', 'CLEAR_FAVICON_CACHE completed', result);
      sendResponse({ status: 'OK', ...result });
    } catch (error) {
      log.error('handle', 'CLEAR_FAVICON_CACHE failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_FAVICON_CACHE_STATS', async (_msg, _sender, sendResponse) => {
    log.debug('handle', 'GET_FAVICON_CACHE_STATS requested');
    try {
      const { getFaviconCacheStats } = await import('../favicon-cache');
      const stats = await getFaviconCacheStats();
      sendResponse({ status: 'OK', ...stats });
    } catch (error) {
      log.error('handle', 'GET_FAVICON_CACHE_STATS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_FAVICON', async (msg, _sender, sendResponse) => {
    const hostname = msg.hostname as string;
    log.trace('handle', 'GET_FAVICON requested:', hostname);
    try {
      const { getFaviconWithCache } = await import('../favicon-cache');
      const dataUrl = await getFaviconWithCache(hostname);
      sendResponse({ dataUrl });
    } catch (error) {
      log.warn('handle', 'GET_FAVICON failed:', errorMeta(error));
      sendResponse({ dataUrl: null });
    }
  });
}
