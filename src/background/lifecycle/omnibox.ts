import { runSearch } from '../search/search-engine';
import { browserAPI } from '../../core/helpers';
import { Logger, errorMeta } from '../../core/logger';
import { SettingsManager } from '../../core/settings';

const logger = Logger.forComponent('Omnibox');

export function setupOmnibox(isInitialized: () => boolean): void {
  browserAPI.omnibox.setDefaultSuggestion({
    description: 'Search history, or use / for commands, @ for tabs, # for bookmarks',
  });

  browserAPI.omnibox.onInputChanged.addListener(async (text, suggest) => {
    try {
      if (!isInitialized()) { suggest([]); return; }
      const trimmed = text.trim();
      if (!trimmed) { suggest([]); return; }

      if (trimmed.startsWith('/') || trimmed.startsWith('>')) {
        const { matchCommands: matchCmds, getCommandsByTier: getCmds } = await import('../../shared/command-registry');
        const tier = trimmed.startsWith('>') ? 'power' as const : 'everyday' as const;
        const query = trimmed.slice(1).trim();
        const settings = SettingsManager.getSettings();
        const commands = getCmds(tier);
        const matches = matchCmds(query, commands, settings);
        suggest(matches.slice(0, 5).map(cmd => ({
          content: `${trimmed[0]}${cmd.id}`,
          description: `${cmd.icon} ${cmd.label} — ${cmd.category}`,
        })));
        return;
      }

      if (trimmed.startsWith('@')) {
        const tabs = await browserAPI.tabs.query({});
        const query = trimmed.slice(1).trim().toLowerCase();
        const filtered = query
          ? tabs.filter(t => t.title?.toLowerCase().includes(query) || t.url?.toLowerCase().includes(query))
          : tabs;
        suggest(filtered.slice(0, 5).map(t => ({
          content: `@tab:${t.id}`,
          description: `${t.title || 'Untitled'} — ${t.url || ''}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
        })));
        return;
      }

      if (trimmed.startsWith('#')) {
        const query = trimmed.slice(1).trim();
        if (query) {
          const bookmarks = await browserAPI.bookmarks.search(query);
          suggest(bookmarks.filter((b: chrome.bookmarks.BookmarkTreeNode) => b.url).slice(0, 5).map((b: chrome.bookmarks.BookmarkTreeNode) => ({
            content: b.url!,
            description: `${b.title || 'Untitled'} — ${b.url}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
          })));
        }
        return;
      }

      const results = await runSearch(trimmed, { skipAI: true });
      suggest(results.slice(0, 5).map(r => ({
        content: r.url,
        description: `${r.title || 'Untitled'} — ${r.url}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      })));
    } catch (err) {
      logger.debug('omnibox', 'onInputChanged error:', errorMeta(err));
      suggest([]);
    }
  });

  browserAPI.omnibox.onInputEntered.addListener(async (text, disposition) => {
    try {
      const trimmed = text.trim();

      if (trimmed.startsWith('@tab:')) {
        const tabId = parseInt(trimmed.replace('@tab:', ''), 10);
        if (!isNaN(tabId)) {
          const tab = await browserAPI.tabs.get(tabId);
          await browserAPI.tabs.update(tabId, { active: true });
          if (tab.windowId) {await browserAPI.windows.update(tab.windowId, { focused: true });}
        }
        return;
      }

      if (trimmed.startsWith('/') || trimmed.startsWith('>')) {
        const commandId = trimmed.slice(1).trim();
        const { ALL_COMMANDS: allCmds } = await import('../../shared/command-registry');
        const cmd = allCmds.find(c => c.id === commandId);
        if (cmd?.url) {
          await browserAPI.tabs.create({ url: cmd.url });
        } else if (cmd?.messageType) {
          browserAPI.runtime.sendMessage({ type: cmd.messageType }, () => { void browserAPI.runtime.lastError; });
        }
        return;
      }

      let url = trimmed;
      try { new URL(url); } catch { url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`; }

      if (disposition === 'currentTab') {
        const [activeTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {await browserAPI.tabs.update(activeTab.id, { url });}
      } else {
        await browserAPI.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
      }
    } catch (err) {
      logger.error('omnibox', 'onInputEntered error:', errorMeta(err));
    }
  });
}
