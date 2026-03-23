/**
 * toolbar-toggles.ts — Shared registry of all toggle chip definitions
 * for the configurable toolbar bar above the search input.
 *
 * Both popup and quick-search import from here so definitions stay in sync.
 */

import type { AppSettings } from '../core/settings';

export interface CycleValue {
    value: string;
    icon: string;
    label: string;
}

export interface ToolbarToggleDef {
    key: keyof AppSettings;
    type: 'boolean' | 'cycle';
    icon: string;
    label: string;
    tooltipOn: string;
    tooltipOff: string;
    cycleValues?: CycleValue[];
}

/**
 * Master list of all available toolbar toggles.
 * Order here determines default display order in the chip bar.
 */
export const TOOLBAR_TOGGLE_DEFS: readonly ToolbarToggleDef[] = [
    {
        key: 'ollamaEnabled',
        type: 'boolean',
        icon: '🤖',
        label: 'AI',
        tooltipOn: 'AI keyword expansion ON (Ollama)',
        tooltipOff: 'AI keyword expansion OFF',
    },
    {
        key: 'indexBookmarks',
        type: 'boolean',
        icon: '⭐',
        label: 'Bookmarks',
        tooltipOn: 'Bookmarks included in search',
        tooltipOff: 'Bookmarks excluded from search',
    },
    {
        key: 'showDuplicateUrls',
        type: 'boolean',
        icon: '⧉',
        label: 'Dupes',
        tooltipOn: 'Showing duplicate URLs',
        tooltipOff: 'Duplicate URLs hidden',
    },
    {
        key: 'highlightMatches',
        type: 'boolean',
        icon: '🖍️',
        label: 'Highlights',
        tooltipOn: 'Match highlighting ON',
        tooltipOff: 'Match highlighting OFF',
    },
    {
        key: 'showNonMatchingResults',
        type: 'boolean',
        icon: '≈',
        label: 'Fuzzy',
        tooltipOn: 'Showing all results (fuzzy)',
        tooltipOff: 'Strict matching only',
    },
    {
        key: 'displayMode',
        type: 'cycle',
        icon: '☰',
        label: 'List',
        tooltipOn: 'Current view: List',
        tooltipOff: 'Current view: Cards',
        cycleValues: [
            { value: 'list', icon: '☰', label: 'List' },
            { value: 'cards', icon: '⊞', label: 'Cards' },
        ],
    },
    {
        key: 'selectAllOnFocus',
        type: 'boolean',
        icon: '[A]',
        label: 'Select All',
        tooltipOn: 'Tab selects all text',
        tooltipOff: 'Tab places cursor at end',
    },
    {
        key: 'showRecentHistory',
        type: 'boolean',
        icon: '🕘',
        label: 'History',
        tooltipOn: 'Recent history shown on empty input',
        tooltipOff: 'Recent history hidden',
    },
    {
        key: 'showRecentSearches',
        type: 'boolean',
        icon: '🔎',
        label: 'Searches',
        tooltipOn: 'Recent searches shown on empty input',
        tooltipOff: 'Recent searches hidden',
    },
    {
        key: 'theme',
        type: 'cycle',
        icon: '🎨',
        label: 'Auto',
        tooltipOn: 'Theme: Auto',
        tooltipOff: 'Theme',
        cycleValues: [
            { value: 'auto', icon: '🎨', label: 'Auto' },
            { value: 'light', icon: '☀️', label: 'Light' },
            { value: 'dark', icon: '🌙', label: 'Dark' },
        ],
    },
] as const;

/** Default toggles visible in the toolbar */
export const DEFAULT_TOOLBAR_TOGGLES: string[] = [
    'ollamaEnabled',
    'indexBookmarks',
    'showDuplicateUrls',
];

/** Look up a toggle definition by settings key */
export function getToggleDef(key: string): ToolbarToggleDef | undefined {
    return TOOLBAR_TOGGLE_DEFS.find(t => t.key === key);
}

/** For a cycle toggle, get the icon and label for the current value */
export function getCycleState(def: ToolbarToggleDef, currentValue: unknown): CycleValue | undefined {
    if (def.type !== 'cycle' || !def.cycleValues) return undefined;
    return def.cycleValues.find(cv => cv.value === currentValue) ?? def.cycleValues[0];
}

/** For a cycle toggle, get the next value after the current one */
export function getNextCycleValue(def: ToolbarToggleDef, currentValue: unknown): string {
    if (!def.cycleValues || def.cycleValues.length === 0) return String(currentValue);
    const idx = def.cycleValues.findIndex(cv => cv.value === currentValue);
    const nextIdx = (idx + 1) % def.cycleValues.length;
    return def.cycleValues[nextIdx].value;
}
