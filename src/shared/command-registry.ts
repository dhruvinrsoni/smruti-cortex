/**
 * command-registry.ts — Shared registry of all command palette commands.
 *
 * Defines the PaletteCommand interface, 60+ commands across everyday and power tiers,
 * fuzzy matching, alias resolution, sub-command expansion, and search engine URL templates.
 *
 * Both quick-search and popup import from here so command lists stay in sync.
 */

import type { AppSettings } from '../core/settings';

export interface PaletteCommand {
    id: string;
    label: string;
    icon: string;
    tier: 'everyday' | 'power';
    category:
        | 'toggle'
        | 'page'
        | 'tab'
        | 'sort'
        | 'navigation'
        | 'browser'
        | 'window'
        | 'index'
        | 'data'
        | 'ai'
        | 'diagnostics'
        | 'meta';
    keywords: string[];
    aliases?: string[];
    shortcut?: string;
    dangerous?: boolean;
    messageType?: string;
    settingKey?: keyof AppSettings;
    action:
        | 'toggle-boolean'
        | 'cycle'
        | 'message'
        | 'open-url'
        | 'page-action'
        | 'sub-command';
    subCommands?: PaletteCommand[];
    isAvailable?: (settings: AppSettings) => boolean;
    url?: string;
    cycleValues?: { value: string; label: string; icon: string }[];
}

export const SEARCH_ENGINES: Record<string, string> = {
    google: 'https://www.google.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    bing: 'https://www.bing.com/search?q=',
    youtube: 'https://www.youtube.com/results?search_query=',
    github: 'https://github.com/search?q=',
};

export const SEARCH_ENGINE_PREFIXES: Record<string, string> = {
    g: 'google',
    d: 'duckduckgo',
    b: 'bing',
    y: 'youtube',
    gh: 'github',
};

const EVERYDAY_COMMANDS: PaletteCommand[] = [
    // --- Quick Toggles ---
    {
        id: 'toggle-ai',
        label: 'Toggle AI Search',
        icon: '🤖',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['ai', 'ollama', 'semantic', 'smart'],
        aliases: ['ai'],
        action: 'toggle-boolean',
        settingKey: 'ollamaEnabled',
    },
    {
        id: 'toggle-bookmarks',
        label: 'Toggle Bookmark Indexing',
        icon: '⭐',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['bookmarks', 'index', 'star'],
        action: 'toggle-boolean',
        settingKey: 'indexBookmarks',
    },
    {
        id: 'toggle-duplicates',
        label: 'Toggle Duplicate URLs',
        icon: '⧉',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['duplicates', 'dupes', 'duplicate', 'diversity'],
        aliases: ['dupes'],
        action: 'toggle-boolean',
        settingKey: 'showDuplicateUrls',
    },
    {
        id: 'toggle-highlights',
        label: 'Toggle Match Highlighting',
        icon: '🖍️',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['highlight', 'highlights', 'match', 'color'],
        action: 'toggle-boolean',
        settingKey: 'highlightMatches',
    },
    {
        id: 'toggle-fuzzy',
        label: 'Toggle Strict/Fuzzy Mode',
        icon: '≈',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['fuzzy', 'strict', 'non-matching', 'filter'],
        aliases: ['strict'],
        action: 'toggle-boolean',
        settingKey: 'showNonMatchingResults',
    },
    {
        id: 'toggle-select-all',
        label: 'Toggle Select-All-on-Focus',
        icon: '[A]',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['select', 'all', 'focus', 'tab'],
        action: 'toggle-boolean',
        settingKey: 'selectAllOnFocus',
    },
    {
        id: 'toggle-history',
        label: 'Toggle Recent History on Empty Input',
        icon: '🕘',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['history', 'recent', 'empty', 'default'],
        action: 'toggle-boolean',
        settingKey: 'showRecentHistory',
    },
    {
        id: 'toggle-searches',
        label: 'Toggle Recent Searches on Empty Input',
        icon: '🔎',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['searches', 'recent', 'queries'],
        action: 'toggle-boolean',
        settingKey: 'showRecentSearches',
    },

    // --- Cycle Settings (sub-command pattern) ---
    {
        id: 'theme',
        label: 'Theme',
        icon: '🎨',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['theme', 'dark', 'light', 'auto', 'mode', 'color'],
        action: 'sub-command',
        settingKey: 'theme',
        cycleValues: [
            { value: 'auto', label: 'Auto', icon: '🎨' },
            { value: 'light', label: 'Light', icon: '☀️' },
            { value: 'dark', label: 'Dark', icon: '🌙' },
        ],
        subCommands: [
            {
                id: 'theme-auto',
                label: 'Theme: Auto',
                icon: '🎨',
                tier: 'everyday',
                category: 'toggle',
                keywords: ['auto', 'system'],
                action: 'cycle',
                settingKey: 'theme',
            },
            {
                id: 'theme-light',
                label: 'Theme: Light',
                icon: '☀️',
                tier: 'everyday',
                category: 'toggle',
                keywords: ['light', 'day'],
                action: 'cycle',
                settingKey: 'theme',
            },
            {
                id: 'theme-dark',
                label: 'Theme: Dark',
                icon: '🌙',
                tier: 'everyday',
                category: 'toggle',
                keywords: ['dark', 'night'],
                action: 'cycle',
                settingKey: 'theme',
            },
        ],
    },
    {
        id: 'view',
        label: 'View',
        icon: '☰',
        tier: 'everyday',
        category: 'toggle',
        keywords: ['view', 'display', 'list', 'cards', 'layout'],
        action: 'sub-command',
        settingKey: 'displayMode',
        cycleValues: [
            { value: 'list', label: 'List', icon: '☰' },
            { value: 'cards', label: 'Cards', icon: '⊞' },
        ],
        subCommands: [
            {
                id: 'view-list',
                label: 'View: List',
                icon: '☰',
                tier: 'everyday',
                category: 'toggle',
                keywords: ['list', 'vertical'],
                action: 'cycle',
                settingKey: 'displayMode',
            },
            {
                id: 'view-cards',
                label: 'View: Cards',
                icon: '⊞',
                tier: 'everyday',
                category: 'toggle',
                keywords: ['cards', 'grid', 'horizontal'],
                action: 'cycle',
                settingKey: 'displayMode',
            },
        ],
    },
    {
        id: 'sort',
        label: 'Sort',
        icon: '🔀',
        tier: 'everyday',
        category: 'sort',
        keywords: ['sort', 'order', 'rank', 'arrange'],
        action: 'sub-command',
        settingKey: 'sortBy',
        cycleValues: [
            { value: 'best-match', label: 'Best Match', icon: '🎯' },
            { value: 'most-recent', label: 'Most Recent', icon: '🕒' },
            { value: 'most-visited', label: 'Most Visited', icon: '🔥' },
            { value: 'alphabetical', label: 'Alphabetical', icon: '🔤' },
        ],
        subCommands: [
            {
                id: 'sort-best',
                label: 'Sort: Best Match',
                icon: '🎯',
                tier: 'everyday',
                category: 'sort',
                keywords: ['best', 'match', 'relevance'],
                action: 'cycle',
                settingKey: 'sortBy',
            },
            {
                id: 'sort-recent',
                label: 'Sort: Most Recent',
                icon: '🕒',
                tier: 'everyday',
                category: 'sort',
                keywords: ['recent', 'newest', 'latest', 'time'],
                action: 'cycle',
                settingKey: 'sortBy',
            },
            {
                id: 'sort-visited',
                label: 'Sort: Most Visited',
                icon: '🔥',
                tier: 'everyday',
                category: 'sort',
                keywords: ['visited', 'frequent', 'popular', 'count'],
                action: 'cycle',
                settingKey: 'sortBy',
            },
            {
                id: 'sort-alpha',
                label: 'Sort: Alphabetical',
                icon: '🔤',
                tier: 'everyday',
                category: 'sort',
                keywords: ['alphabetical', 'alpha', 'a-z', 'name'],
                action: 'cycle',
                settingKey: 'sortBy',
            },
        ],
    },

    // --- Current-Page Actions ---
    {
        id: 'copy-url',
        label: 'Copy URL',
        icon: '🔗',
        tier: 'everyday',
        category: 'page',
        keywords: ['copy', 'url', 'link', 'address'],
        action: 'page-action',
    },
    {
        id: 'copy-title',
        label: 'Copy Title',
        icon: '📋',
        tier: 'everyday',
        category: 'page',
        keywords: ['copy', 'title', 'name', 'heading'],
        action: 'page-action',
    },
    {
        id: 'copy-markdown',
        label: 'Copy Markdown Link',
        icon: '📝',
        tier: 'everyday',
        category: 'page',
        keywords: ['copy', 'markdown', 'link', 'md'],
        aliases: ['md'],
        action: 'page-action',
    },
    {
        id: 'share',
        label: 'Share Page',
        icon: '📤',
        tier: 'everyday',
        category: 'page',
        keywords: ['share', 'send'],
        action: 'page-action',
        isAvailable: () => typeof navigator !== 'undefined' && !!navigator.share,
    },
    {
        id: 'print',
        label: 'Print Page',
        icon: '🖨️',
        tier: 'everyday',
        category: 'page',
        keywords: ['print', 'pdf'],
        action: 'page-action',
    },
    {
        id: 'fullscreen',
        label: 'Toggle Fullscreen',
        icon: '⛶',
        tier: 'everyday',
        category: 'page',
        keywords: ['fullscreen', 'full', 'screen', 'maximize'],
        action: 'page-action',
    },
    {
        id: 'add-bookmark',
        label: 'Bookmark This Page',
        icon: '⭐',
        tier: 'everyday',
        category: 'page',
        keywords: ['bookmark', 'save', 'add', 'star'],
        action: 'message',
        messageType: 'ADD_BOOKMARK',
    },

    // --- Tab Actions ---
    {
        id: 'duplicate-tab',
        label: 'Duplicate Tab',
        icon: '📑',
        tier: 'everyday',
        category: 'tab',
        keywords: ['duplicate', 'clone', 'copy', 'tab'],
        aliases: ['dup'],
        action: 'message',
        messageType: 'DUPLICATE_TAB',
    },
    {
        id: 'pin-tab',
        label: 'Pin/Unpin Tab',
        icon: '📌',
        tier: 'everyday',
        category: 'tab',
        keywords: ['pin', 'unpin', 'tab'],
        action: 'message',
        messageType: 'PIN_TAB',
    },
    {
        id: 'mute-tab',
        label: 'Mute/Unmute Tab',
        icon: '🔇',
        tier: 'everyday',
        category: 'tab',
        keywords: ['mute', 'unmute', 'sound', 'audio', 'tab'],
        action: 'message',
        messageType: 'MUTE_TAB',
    },
    {
        id: 'close-tab',
        label: 'Close Tab',
        icon: '❌',
        tier: 'everyday',
        category: 'tab',
        keywords: ['close', 'tab'],
        action: 'message',
        messageType: 'CLOSE_TAB',
    },
    {
        id: 'reload',
        label: 'Reload',
        icon: '🔄',
        tier: 'everyday',
        category: 'tab',
        keywords: ['reload', 'refresh'],
        aliases: ['refresh'],
        action: 'message',
        messageType: 'TAB_RELOAD',
    },
    {
        id: 'hard-reload',
        label: 'Hard Reload',
        icon: '🔄',
        tier: 'everyday',
        category: 'tab',
        keywords: ['hard', 'reload', 'cache', 'force', 'refresh'],
        action: 'message',
        messageType: 'TAB_HARD_RELOAD',
    },
    {
        id: 'go-back',
        label: 'Go Back',
        icon: '⬅️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['back', 'previous', 'history'],
        aliases: ['back'],
        action: 'message',
        messageType: 'TAB_GO_BACK',
    },
    {
        id: 'go-forward',
        label: 'Go Forward',
        icon: '➡️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['forward', 'next'],
        aliases: ['forward'],
        action: 'message',
        messageType: 'TAB_GO_FORWARD',
    },
    {
        id: 'zoom-in',
        label: 'Zoom In',
        icon: '🔍',
        tier: 'everyday',
        category: 'tab',
        keywords: ['zoom', 'in', 'bigger', 'larger'],
        action: 'message',
        messageType: 'TAB_ZOOM',
    },
    {
        id: 'zoom-out',
        label: 'Zoom Out',
        icon: '🔍',
        tier: 'everyday',
        category: 'tab',
        keywords: ['zoom', 'out', 'smaller'],
        action: 'message',
        messageType: 'TAB_ZOOM',
    },
    {
        id: 'zoom-reset',
        label: 'Zoom Reset',
        icon: '🔍',
        tier: 'everyday',
        category: 'tab',
        keywords: ['zoom', 'reset', 'default', '100'],
        action: 'message',
        messageType: 'TAB_ZOOM',
    },
    {
        id: 'view-source',
        label: 'View Source',
        icon: '💻',
        tier: 'everyday',
        category: 'tab',
        keywords: ['view', 'source', 'html', 'code'],
        action: 'message',
        messageType: 'TAB_VIEW_SOURCE',
    },

    // --- Navigation ---
    {
        id: 'settings',
        label: 'Open Settings',
        icon: '⚙️',
        tier: 'everyday',
        category: 'navigation',
        keywords: ['settings', 'preferences', 'options', 'config'],
        shortcut: 'Ctrl+,',
        action: 'message',
        messageType: 'OPEN_SETTINGS',
    },
    {
        id: 'tour',
        label: 'Open Feature Tour',
        icon: '📖',
        tier: 'everyday',
        category: 'navigation',
        keywords: ['tour', 'guide', 'help', 'tutorial', 'walkthrough'],
        action: 'page-action',
    },
    {
        id: 'shortcuts',
        label: 'Show Keyboard Shortcuts',
        icon: '⌨️',
        tier: 'everyday',
        category: 'navigation',
        keywords: ['shortcuts', 'keyboard', 'hotkeys', 'keys'],
        action: 'page-action',
    },

    // --- Advanced Tab Management (gated by advancedBrowserCommands) ---
    {
        id: 'close-other-tabs',
        label: 'Close Other Tabs',
        icon: '🗑️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['close', 'other', 'tabs'],
        action: 'message',
        messageType: 'CLOSE_OTHER_TABS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'close-tabs-right',
        label: 'Close Tabs to the Right',
        icon: '➡️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['close', 'tabs', 'right'],
        action: 'message',
        messageType: 'CLOSE_TABS_RIGHT',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'close-tabs-left',
        label: 'Close Tabs to the Left',
        icon: '⬅️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['close', 'tabs', 'left'],
        action: 'message',
        messageType: 'CLOSE_TABS_LEFT',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'discard-tab',
        label: 'Suspend Tab (Save Memory)',
        icon: '💤',
        tier: 'everyday',
        category: 'tab',
        keywords: ['suspend', 'discard', 'tab', 'memory', 'sleep'],
        action: 'message',
        messageType: 'DISCARD_TAB',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'discard-other-tabs',
        label: 'Suspend Other Tabs',
        icon: '💤',
        tier: 'everyday',
        category: 'tab',
        keywords: ['suspend', 'discard', 'other', 'tabs', 'memory'],
        action: 'message',
        messageType: 'DISCARD_OTHER_TABS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'move-tab-new-window',
        label: 'Move Tab to New Window',
        icon: '🪟',
        tier: 'everyday',
        category: 'tab',
        keywords: ['move', 'tab', 'new', 'window', 'detach'],
        action: 'message',
        messageType: 'MOVE_TAB_NEW_WINDOW',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'merge-windows',
        label: 'Merge All Windows',
        icon: '🔗',
        tier: 'everyday',
        category: 'tab',
        keywords: ['merge', 'windows', 'combine', 'join'],
        action: 'message',
        messageType: 'MERGE_WINDOWS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'close-duplicates',
        label: 'Close Duplicate Tabs',
        icon: '🧹',
        tier: 'everyday',
        category: 'tab',
        keywords: ['close', 'duplicate', 'tabs', 'dedup', 'clean'],
        action: 'message',
        messageType: 'CLOSE_DUPLICATES',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'sort-tabs',
        label: 'Sort Tabs by URL',
        icon: '🔤',
        tier: 'everyday',
        category: 'tab',
        keywords: ['sort', 'tabs', 'organize', 'order', 'alphabetical'],
        action: 'message',
        messageType: 'SORT_TABS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'scroll-to-top',
        label: 'Scroll to Top',
        icon: '⬆️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['scroll', 'top', 'beginning'],
        action: 'message',
        messageType: 'SCROLL_TO_TOP',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'scroll-to-bottom',
        label: 'Scroll to Bottom',
        icon: '⬇️',
        tier: 'everyday',
        category: 'tab',
        keywords: ['scroll', 'bottom', 'end'],
        action: 'message',
        messageType: 'SCROLL_TO_BOTTOM',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'unpin-tab',
        label: 'Unpin Tab',
        icon: '📌',
        tier: 'everyday',
        category: 'tab',
        keywords: ['unpin', 'tab'],
        action: 'message',
        messageType: 'UNPIN_TAB',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'unmute-tab',
        label: 'Unmute Tab',
        icon: '🔊',
        tier: 'everyday',
        category: 'tab',
        keywords: ['unmute', 'sound', 'audio', 'tab'],
        action: 'message',
        messageType: 'UNMUTE_TAB',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },

    // --- Browser Actions ---
    {
        id: 'new-tab',
        label: 'New Tab',
        icon: '➕',
        tier: 'everyday',
        category: 'browser',
        keywords: ['new', 'tab', 'open'],
        action: 'message',
        messageType: 'WINDOW_CREATE',
    },
    {
        id: 'downloads',
        label: 'Downloads',
        icon: '📥',
        tier: 'everyday',
        category: 'browser',
        keywords: ['downloads', 'files'],
        action: 'open-url',
        url: 'chrome://downloads',
    },
    {
        id: 'browser-history',
        label: 'Browser History',
        icon: '🕐',
        tier: 'everyday',
        category: 'browser',
        keywords: ['browser', 'history', 'chrome'],
        action: 'open-url',
        url: 'chrome://history',
    },
    {
        id: 'bookmarks-manager',
        label: 'Bookmarks Manager',
        icon: '📚',
        tier: 'everyday',
        category: 'browser',
        keywords: ['bookmarks', 'manager', 'organize'],
        action: 'open-url',
        url: 'chrome://bookmarks',
    },
    {
        id: 'extensions',
        label: 'Extensions',
        icon: '🧩',
        tier: 'everyday',
        category: 'browser',
        keywords: ['extensions', 'addons', 'plugins'],
        action: 'open-url',
        url: 'chrome://extensions',
    },
    {
        id: 'browser-settings',
        label: 'Browser Settings',
        icon: '🔧',
        tier: 'everyday',
        category: 'browser',
        keywords: ['browser', 'settings', 'chrome', 'preferences'],
        action: 'open-url',
        url: 'chrome://settings',
    },

    // --- chrome://settings Sub-pages (gated) ---
    {
        id: 'password-manager',
        label: 'Password Manager',
        icon: '🔑',
        tier: 'everyday',
        category: 'browser',
        keywords: ['password', 'manager', 'passwords', 'credentials'],
        action: 'open-url',
        url: 'chrome://password-manager/passwords',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'site-settings',
        label: 'Site Settings',
        icon: '🌐',
        tier: 'everyday',
        category: 'browser',
        keywords: ['site', 'settings', 'content', 'permissions'],
        action: 'open-url',
        url: 'chrome://settings/content',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'privacy-settings',
        label: 'Privacy Settings',
        icon: '🛡️',
        tier: 'everyday',
        category: 'browser',
        keywords: ['privacy', 'settings', 'security'],
        action: 'open-url',
        url: 'chrome://settings/privacy',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'search-settings',
        label: 'Search Engine Settings',
        icon: '🔍',
        tier: 'everyday',
        category: 'browser',
        keywords: ['search', 'engine', 'settings', 'default'],
        action: 'open-url',
        url: 'chrome://settings/search',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-browser-data',
        label: 'Clear Browser Data Dialog',
        icon: '🗑️',
        tier: 'everyday',
        category: 'browser',
        keywords: ['clear', 'browser', 'data', 'delete', 'browsing'],
        action: 'open-url',
        url: 'chrome://settings/clearBrowserData',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'about-chrome',
        label: 'About Chrome',
        icon: 'ℹ️',
        tier: 'everyday',
        category: 'browser',
        keywords: ['about', 'chrome', 'version', 'update'],
        action: 'open-url',
        url: 'chrome://settings/help',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'appearance-settings',
        label: 'Appearance Settings',
        icon: '🎨',
        tier: 'everyday',
        category: 'browser',
        keywords: ['appearance', 'theme', 'fonts', 'look'],
        action: 'open-url',
        url: 'chrome://settings/appearance',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'autofill-settings',
        label: 'Autofill Settings',
        icon: '📝',
        tier: 'everyday',
        category: 'browser',
        keywords: ['autofill', 'addresses', 'forms'],
        action: 'open-url',
        url: 'chrome://settings/autofill',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'top-sites',
        label: 'Most Visited Sites',
        icon: '🏆',
        tier: 'everyday',
        category: 'browser',
        keywords: ['top', 'sites', 'most', 'visited', 'popular', 'frequent'],
        action: 'message',
        messageType: 'GET_TOP_SITES',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },

    // --- Window Management ---
    {
        id: 'new-window',
        label: 'New Window',
        icon: '🪟',
        tier: 'everyday',
        category: 'window',
        keywords: ['new', 'window'],
        action: 'message',
        messageType: 'WINDOW_CREATE',
    },
    {
        id: 'new-incognito',
        label: 'New Incognito Window',
        icon: '🕶️',
        tier: 'everyday',
        category: 'window',
        keywords: ['incognito', 'private', 'window'],
        action: 'message',
        messageType: 'WINDOW_CREATE',
    },

    // --- Extension Meta ---
    {
        id: 'about',
        label: 'About SmrutiCortex',
        icon: 'ℹ️',
        tier: 'everyday',
        category: 'meta',
        keywords: ['about', 'version', 'info'],
        action: 'page-action',
    },
    {
        id: 'changelog',
        label: 'Changelog',
        icon: '📋',
        tier: 'everyday',
        category: 'meta',
        keywords: ['changelog', 'release', 'notes', 'updates', 'whats new'],
        action: 'open-url',
        url: 'https://github.com/dhruvinrsoni/smruti-cortex/releases',
    },
    {
        id: 'rate',
        label: 'Rate on Chrome Web Store',
        icon: '⭐',
        tier: 'everyday',
        category: 'meta',
        keywords: ['rate', 'review', 'store', 'chrome'],
        action: 'open-url',
        url: 'https://chromewebstore.google.com/detail/smruticortex-instant-brow/kbeadnkjlmnpfejgdldhlaoafplnfaih',
    },
    {
        id: 'report-bug',
        label: 'Report a Bug',
        icon: '🐛',
        tier: 'everyday',
        category: 'meta',
        keywords: ['bug', 'report', 'issue', 'github', 'problem'],
        action: 'open-url',
        url: 'https://github.com/dhruvinrsoni/smruti-cortex/issues/new',
    },
];

const POWER_COMMANDS: PaletteCommand[] = [
    // --- Advanced Tab (dangerous) ---
    {
        id: 'close-all-tabs',
        label: 'Close All Tabs (Keep One)',
        icon: '💀',
        tier: 'power',
        category: 'tab',
        keywords: ['close', 'all', 'tabs', 'nuke'],
        dangerous: true,
        action: 'message',
        messageType: 'CLOSE_ALL_TABS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },

    // --- Tab Groups (optional permission: tabGroups) ---
    {
        id: 'group-tab',
        label: 'Group Current Tab',
        icon: '📂',
        tier: 'power',
        category: 'tab',
        keywords: ['group', 'tab', 'add'],
        action: 'message',
        messageType: 'GROUP_TAB',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'ungroup-tab',
        label: 'Ungroup Current Tab',
        icon: '📁',
        tier: 'power',
        category: 'tab',
        keywords: ['ungroup', 'tab', 'remove'],
        action: 'message',
        messageType: 'UNGROUP_TAB',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'collapse-groups',
        label: 'Collapse All Tab Groups',
        icon: '📁',
        tier: 'power',
        category: 'tab',
        keywords: ['collapse', 'groups', 'minimize'],
        action: 'message',
        messageType: 'COLLAPSE_GROUPS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'expand-groups',
        label: 'Expand All Tab Groups',
        icon: '📂',
        tier: 'power',
        category: 'tab',
        keywords: ['expand', 'groups', 'maximize'],
        action: 'message',
        messageType: 'EXPAND_GROUPS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'name-group',
        label: 'Name Tab Group',
        icon: '✏️',
        tier: 'power',
        category: 'tab',
        keywords: ['name', 'rename', 'group', 'title'],
        action: 'message',
        messageType: 'NAME_GROUP',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'color-group',
        label: 'Color Tab Group',
        icon: '🎨',
        tier: 'power',
        category: 'tab',
        keywords: ['color', 'group', 'colour'],
        action: 'sub-command',
        isAvailable: (s) => !!s.advancedBrowserCommands,
        subCommands: [
            { id: 'color-group-grey', label: 'Group Color: Grey', icon: '⚪', tier: 'power', category: 'tab', keywords: ['grey', 'gray'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-blue', label: 'Group Color: Blue', icon: '🔵', tier: 'power', category: 'tab', keywords: ['blue'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-red', label: 'Group Color: Red', icon: '🔴', tier: 'power', category: 'tab', keywords: ['red'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-yellow', label: 'Group Color: Yellow', icon: '🟡', tier: 'power', category: 'tab', keywords: ['yellow'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-green', label: 'Group Color: Green', icon: '🟢', tier: 'power', category: 'tab', keywords: ['green'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-pink', label: 'Group Color: Pink', icon: '🩷', tier: 'power', category: 'tab', keywords: ['pink'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-purple', label: 'Group Color: Purple', icon: '🟣', tier: 'power', category: 'tab', keywords: ['purple'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-cyan', label: 'Group Color: Cyan', icon: '🔵', tier: 'power', category: 'tab', keywords: ['cyan', 'teal'], action: 'message', messageType: 'COLOR_GROUP' },
            { id: 'color-group-orange', label: 'Group Color: Orange', icon: '🟠', tier: 'power', category: 'tab', keywords: ['orange'], action: 'message', messageType: 'COLOR_GROUP' },
        ],
    },
    {
        id: 'close-group',
        label: 'Close Tab Group',
        icon: '🗑️',
        tier: 'power',
        category: 'tab',
        keywords: ['close', 'group', 'delete'],
        dangerous: true,
        action: 'message',
        messageType: 'CLOSE_GROUP',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'ungroup-all',
        label: 'Ungroup All Tabs',
        icon: '📁',
        tier: 'power',
        category: 'tab',
        keywords: ['ungroup', 'all', 'tabs', 'dissolve'],
        action: 'message',
        messageType: 'UNGROUP_ALL',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },

    // --- Browsing Data Cleanup (optional permission: browsingData) ---
    {
        id: 'clear-cache',
        label: 'Clear Browser Cache',
        icon: '🧹',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'cache', 'browser'],
        action: 'message',
        messageType: 'CLEAR_BROWSER_CACHE',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-cookies',
        label: 'Clear Cookies',
        icon: '🍪',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'cookies'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_COOKIES',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-local-storage',
        label: 'Clear Local Storage',
        icon: '🗄️',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'local', 'storage', 'localstorage'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_LOCAL_STORAGE',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-downloads-history',
        label: 'Clear Downloads History',
        icon: '📥',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'downloads', 'history'],
        action: 'message',
        messageType: 'CLEAR_DOWNLOADS_HISTORY',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-form-data',
        label: 'Clear Form Data',
        icon: '📝',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'form', 'data', 'autofill'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_FORM_DATA',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-passwords',
        label: 'Clear Saved Passwords',
        icon: '🔑',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'passwords', 'saved'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_PASSWORDS',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-last-hour',
        label: 'Clear Last Hour (All)',
        icon: '🕐',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'last', 'hour', 'recent'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_LAST_HOUR',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },
    {
        id: 'clear-last-day',
        label: 'Clear Last 24 Hours (All)',
        icon: '📅',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'last', 'day', '24', 'hours'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_LAST_DAY',
        isAvailable: (s) => !!s.advancedBrowserCommands,
    },

    // --- Index Management ---
    {
        id: 'rebuild-index',
        label: 'Rebuild Index',
        icon: '🔄',
        tier: 'power',
        category: 'index',
        keywords: ['rebuild', 'index', 'reindex', 'full'],
        dangerous: true,
        action: 'message',
        messageType: 'REBUILD_INDEX',
    },
    {
        id: 'index-bookmarks',
        label: 'Index Bookmarks',
        icon: '⭐',
        tier: 'power',
        category: 'index',
        keywords: ['index', 'bookmarks'],
        action: 'message',
        messageType: 'INDEX_BOOKMARKS',
    },
    {
        id: 'manual-index',
        label: 'Manual Index',
        icon: '⚡',
        tier: 'power',
        category: 'index',
        keywords: ['manual', 'index', 'incremental'],
        action: 'message',
        messageType: 'MANUAL_INDEX',
    },
    {
        id: 'export-index',
        label: 'Export Index',
        icon: '📥',
        tier: 'power',
        category: 'index',
        keywords: ['export', 'index', 'json', 'download', 'backup'],
        action: 'message',
        messageType: 'EXPORT_INDEX',
    },
    {
        id: 'import-index',
        label: 'Import Index',
        icon: '📤',
        tier: 'power',
        category: 'index',
        keywords: ['import', 'index', 'json', 'upload', 'restore'],
        action: 'page-action',
    },

    // --- Data Management ---
    {
        id: 'clear-ai-cache',
        label: 'Clear AI Cache',
        icon: '🗑️',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'ai', 'cache', 'keyword'],
        action: 'message',
        messageType: 'CLEAR_AI_CACHE',
    },
    {
        id: 'clear-favicon-cache',
        label: 'Clear Favicon Cache',
        icon: '🗑️',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'favicon', 'cache', 'icons'],
        action: 'message',
        messageType: 'CLEAR_FAVICON_CACHE',
    },
    {
        id: 'clear-recent-searches',
        label: 'Clear Recent Searches',
        icon: '🗑️',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'recent', 'searches', 'history'],
        action: 'message',
        messageType: 'CLEAR_SEARCH_DEBUG',
    },
    {
        id: 'clear-all-data',
        label: 'Clear All Data',
        icon: '🗑️',
        tier: 'power',
        category: 'data',
        keywords: ['clear', 'all', 'data', 'everything'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_ALL_DATA',
    },
    {
        id: 'factory-reset',
        label: 'Factory Reset',
        icon: '⚠️',
        tier: 'power',
        category: 'data',
        keywords: ['factory', 'reset', 'wipe', 'clean'],
        dangerous: true,
        action: 'message',
        messageType: 'FACTORY_RESET',
    },
    {
        id: 'reset-settings',
        label: 'Reset Settings',
        icon: '↺',
        tier: 'power',
        category: 'data',
        keywords: ['reset', 'settings', 'defaults'],
        dangerous: true,
        action: 'message',
        messageType: 'RESET_SETTINGS',
    },

    // --- AI and Embeddings ---
    {
        id: 'start-embeddings',
        label: 'Start Embeddings',
        icon: '▶️',
        tier: 'power',
        category: 'ai',
        keywords: ['start', 'embeddings', 'generate', 'begin'],
        action: 'message',
        messageType: 'START_EMBEDDING_PROCESSOR',
        isAvailable: (s) => !!s.embeddingsEnabled,
    },
    {
        id: 'pause-embeddings',
        label: 'Pause Embeddings',
        icon: '⏸️',
        tier: 'power',
        category: 'ai',
        keywords: ['pause', 'embeddings', 'stop'],
        action: 'message',
        messageType: 'PAUSE_EMBEDDING_PROCESSOR',
        isAvailable: (s) => !!s.embeddingsEnabled,
    },
    {
        id: 'resume-embeddings',
        label: 'Resume Embeddings',
        icon: '▶️',
        tier: 'power',
        category: 'ai',
        keywords: ['resume', 'embeddings', 'continue'],
        action: 'message',
        messageType: 'RESUME_EMBEDDING_PROCESSOR',
        isAvailable: (s) => !!s.embeddingsEnabled,
    },
    {
        id: 'clear-embeddings',
        label: 'Clear Embeddings',
        icon: '🗑️',
        tier: 'power',
        category: 'ai',
        keywords: ['clear', 'embeddings', 'remove'],
        dangerous: true,
        action: 'message',
        messageType: 'CLEAR_ALL_EMBEDDINGS',
        isAvailable: (s) => !!s.embeddingsEnabled,
    },
    {
        id: 'embedding-stats',
        label: 'Embedding Statistics',
        icon: '📊',
        tier: 'power',
        category: 'ai',
        keywords: ['embedding', 'stats', 'statistics', 'count'],
        action: 'message',
        messageType: 'GET_EMBEDDING_STATS',
    },
    {
        id: 'embedding-progress',
        label: 'Embedding Progress',
        icon: '📈',
        tier: 'power',
        category: 'ai',
        keywords: ['embedding', 'progress', 'status'],
        action: 'message',
        messageType: 'GET_EMBEDDING_PROGRESS',
    },

    // --- Diagnostics ---
    {
        id: 'diagnostics',
        label: 'Export Diagnostics',
        icon: '📋',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['diagnostics', 'debug', 'export', 'report'],
        action: 'message',
        messageType: 'EXPORT_DIAGNOSTICS',
    },
    {
        id: 'health',
        label: 'Health Status',
        icon: '💚',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['health', 'status', 'check'],
        action: 'message',
        messageType: 'GET_HEALTH_STATUS',
    },
    {
        id: 'storage',
        label: 'Storage Quota',
        icon: '💾',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['storage', 'quota', 'space', 'disk'],
        action: 'message',
        messageType: 'GET_STORAGE_QUOTA',
    },
    {
        id: 'self-heal',
        label: 'Run Self-Heal',
        icon: '🩹',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['self', 'heal', 'repair', 'fix'],
        action: 'message',
        messageType: 'SELF_HEAL',
    },
    {
        id: 'search-debug',
        label: 'Toggle Search Debug Mode',
        icon: '🔍',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['search', 'debug', 'mode', 'logging'],
        action: 'message',
        messageType: 'SET_SEARCH_DEBUG_ENABLED',
    },
    {
        id: 'export-debug',
        label: 'Export Debug Log',
        icon: '💾',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['export', 'debug', 'log', 'data'],
        action: 'message',
        messageType: 'EXPORT_SEARCH_DEBUG',
    },
    {
        id: 'performance',
        label: 'Performance Metrics',
        icon: '📊',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['performance', 'metrics', 'perf', 'speed'],
        action: 'message',
        messageType: 'GET_PERFORMANCE_METRICS',
    },
    {
        id: 'search-analytics',
        label: 'Search Analytics',
        icon: '📈',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['search', 'analytics', 'stats'],
        action: 'message',
        messageType: 'GET_SEARCH_ANALYTICS',
    },
    {
        id: 'log-level',
        label: 'Log Level',
        icon: '📝',
        tier: 'power',
        category: 'diagnostics',
        keywords: ['log', 'level', 'verbosity'],
        action: 'sub-command',
        settingKey: 'logLevel',
        cycleValues: [
            { value: '0', label: 'Error', icon: '🔴' },
            { value: '1', label: 'Warn', icon: '🟡' },
            { value: '2', label: 'Info', icon: '🔵' },
            { value: '3', label: 'Debug', icon: '🟢' },
            { value: '4', label: 'Trace', icon: '⚪' },
        ],
        subCommands: [
            {
                id: 'log-level-error',
                label: 'Log Level: Error',
                icon: '🔴',
                tier: 'power',
                category: 'diagnostics',
                keywords: ['error'],
                action: 'cycle',
                settingKey: 'logLevel',
            },
            {
                id: 'log-level-warn',
                label: 'Log Level: Warn',
                icon: '🟡',
                tier: 'power',
                category: 'diagnostics',
                keywords: ['warn', 'warning'],
                action: 'cycle',
                settingKey: 'logLevel',
            },
            {
                id: 'log-level-info',
                label: 'Log Level: Info',
                icon: '🔵',
                tier: 'power',
                category: 'diagnostics',
                keywords: ['info', 'information'],
                action: 'cycle',
                settingKey: 'logLevel',
            },
            {
                id: 'log-level-debug',
                label: 'Log Level: Debug',
                icon: '🟢',
                tier: 'power',
                category: 'diagnostics',
                keywords: ['debug'],
                action: 'cycle',
                settingKey: 'logLevel',
            },
            {
                id: 'log-level-trace',
                label: 'Log Level: Trace',
                icon: '⚪',
                tier: 'power',
                category: 'diagnostics',
                keywords: ['trace', 'verbose'],
                action: 'cycle',
                settingKey: 'logLevel',
            },
        ],
    },
];

export const ALL_COMMANDS: PaletteCommand[] = [...EVERYDAY_COMMANDS, ...POWER_COMMANDS];

export function getCommandsByTier(tier: 'everyday' | 'power'): PaletteCommand[] {
    return ALL_COMMANDS.filter(cmd => cmd.tier === tier);
}

export function getAvailableCommands(
    tier: 'everyday' | 'power',
    settings: AppSettings,
): PaletteCommand[] {
    return getCommandsByTier(tier).filter(
        cmd => !cmd.isAvailable || cmd.isAvailable(settings),
    );
}

/**
 * Flatten sub-commands for a parent, including the parent entry if desired.
 * When the query specifically matches a parent's sub-command pattern (e.g., "theme dark"),
 * we return just the sub-commands for that parent.
 */
function expandSubCommands(cmd: PaletteCommand): PaletteCommand[] {
    if (cmd.action === 'sub-command' && cmd.subCommands) {
        return cmd.subCommands;
    }
    return [cmd];
}

/**
 * Fuzzy match commands against a query string.
 * Returns commands sorted by relevance score.
 */
export function matchCommands(
    query: string,
    commands: PaletteCommand[],
    settings?: AppSettings,
): PaletteCommand[] {
    if (!query.trim()) {
        const available = settings
            ? commands.filter(cmd => !cmd.isAvailable || cmd.isAvailable(settings))
            : commands;
        const expanded: PaletteCommand[] = [];
        for (const cmd of available) {
            expanded.push(...expandSubCommands(cmd));
        }
        return expanded;
    }

    const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 0);

    const available = settings
        ? commands.filter(cmd => !cmd.isAvailable || cmd.isAvailable(settings))
        : commands;

    const scored: { cmd: PaletteCommand; score: number }[] = [];

    for (const cmd of available) {
        const allToScore = expandSubCommands(cmd);

        for (const target of allToScore) {
            const searchable = [
                target.label,
                ...target.keywords,
                ...(target.aliases ?? []),
            ]
                .join(' ')
                .toLowerCase();

            let score = 0;

            if (target.aliases?.some(a => a === query.toLowerCase())) {
                score += 1000;
            }

            if (target.label.toLowerCase().startsWith(query.toLowerCase())) {
                score += 500;
            }

            const allMatch = tokens.every(t => searchable.includes(t));
            if (allMatch) {
                score += 100 * tokens.length;
            }

            tokens.forEach(t => {
                if (searchable.includes(t)) score += 10;
            });

            if (score > 0) {
                scored.push({ cmd: target, score });
            }
        }
    }

    return scored.sort((a, b) => b.score - a.score).map(r => r.cmd);
}

/**
 * Get the value to set when a cycle sub-command is executed.
 * Extracts the value from the sub-command's ID pattern (e.g., "theme-dark" → "dark").
 */
export function getCycleValueFromCommand(cmd: PaletteCommand): string | number | undefined {
    const parent = ALL_COMMANDS.find(
        c => c.subCommands?.some(sub => sub.id === cmd.id),
    );
    if (!parent?.cycleValues) return undefined;

    for (const cv of parent.cycleValues) {
        const expectedId = `${parent.id}-${cv.label.toLowerCase().replace(/\s+/g, '-')}`;
        if (cmd.id === expectedId) {
            const numVal = Number(cv.value);
            return isNaN(numVal) ? cv.value : numVal;
        }
    }

    const suffix = cmd.id.replace(`${parent.id}-`, '');
    const match = parent.cycleValues.find(
        cv => cv.label.toLowerCase().replace(/\s+/g, '-') === suffix
            || cv.value === suffix,
    );
    if (match) {
        const numVal = Number(match.value);
        return isNaN(numVal) ? match.value : numVal;
    }

    return undefined;
}

/**
 * Get the current value label for a sub-command parent.
 */
export function getCurrentValueLabel(
    cmd: PaletteCommand,
    settings: AppSettings,
): string | undefined {
    if (!cmd.cycleValues || !cmd.settingKey) return undefined;
    const current = String(settings[cmd.settingKey]);
    const match = cmd.cycleValues.find(cv => cv.value === current);
    return match?.label;
}

const RECENT_COMMANDS_KEY = 'smruti_recent_commands';
const MAX_RECENT_COMMANDS = 10;

export function saveRecentCommand(commandId: string): void {
    try {
        const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        const filtered = list.filter(id => id !== commandId);
        filtered.unshift(commandId);
        localStorage.setItem(
            RECENT_COMMANDS_KEY,
            JSON.stringify(filtered.slice(0, MAX_RECENT_COMMANDS)),
        );
    } catch {
        // localStorage may be unavailable in some contexts
    }
}

export function getRecentCommands(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}
