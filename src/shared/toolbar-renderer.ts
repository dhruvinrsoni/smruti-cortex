/**
 * toolbar-renderer.ts — single source of truth for the toolbar chip strip
 * shared by popup ([src/popup/popup.ts]) and the quick-search content-script
 * overlay ([src/content_scripts/quick-search.ts]).
 *
 * Both UIs feed a `SettingsPort` adapter so the renderer doesn't care whether
 * settings are persisted via popup's SettingsManager or quick-search's
 * `SETTINGS_CHANGED` runtime message — it just calls `port.get` / `port.set`
 * and lets the host run its own re-render hook in `port.onAfterToggle`.
 */

import type { AppSettings } from '../core/settings';
import {
    getToggleDef,
    getCycleState,
    getNextCycleValue,
    evaluateChipDisabled,
} from './toolbar-toggles';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface SettingsPort {
    get<K extends keyof AppSettings>(key: K): AppSettings[K] | undefined;
    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void | Promise<void>;
    showToast?(message: string, type?: ToastType): void;
    onAfterToggle?(key: keyof AppSettings): void;
}

/**
 * Render chip buttons into `parent` (clears existing children first).
 * Each chip's click handler delegates persistence to `port.set`, surfaces
 * the prerequisite-disabled toast via `port.showToast`, and notifies the
 * host of the post-toggle hook via `port.onAfterToggle`.
 */
export function renderToolbarToggles(
    parent: HTMLElement,
    port: SettingsPort,
    visibleKeys: readonly string[],
): void {
    parent.innerHTML = '';
    for (const key of visibleKeys) {
        const def = getToggleDef(key);
        if (!def) {continue;}

        const chip = document.createElement('button');
        chip.className = 'toggle-chip';
        chip.dataset.toggleKey = key;
        chip.type = 'button';

        chip.addEventListener('click', (e) => {
            e.stopPropagation();

            // Prerequisite gate: chips with `requires` are inert until the
            // prerequisite setting is truthy. Surface a toast so the user
            // understands why the click did nothing.
            if (def.requires) {
                const prereq = port.get(def.requires);
                if (!prereq) {
                    if (def.disabledToast) {port.showToast?.(def.disabledToast, 'warning');}
                    return;
                }
            }

            if (def.type === 'boolean') {
                const cur = port.get(def.key) as boolean | undefined;
                const next = !cur;
                port.set(def.key, next as AppSettings[typeof def.key]);
            } else if (def.type === 'cycle') {
                const cur = port.get(def.key);
                const next = getNextCycleValue(def, cur);
                port.set(def.key, next as AppSettings[typeof def.key]);
            }

            port.onAfterToggle?.(def.key);
        });

        parent.appendChild(chip);
    }
    syncToolbarToggles(parent, port);
}

/**
 * Layer 5: subtly indicate that the chip's feature is doing background work
 * (e.g. AI chip pulses while Phase 2 embedding is in flight). Idempotent — no-op
 * when the requested state already matches.
 *
 * The actual pulse is a CSS animation triggered by the `.busy` class on
 * `.toggle-chip` (see `TOOLBAR_TOGGLE_CSS` below). No JS animation frames involved.
 */
export function setChipBusy(parent: HTMLElement, key: keyof AppSettings, busy: boolean): void {
    const chip = parent.querySelector<HTMLButtonElement>(`.toggle-chip[data-toggle-key="${key}"]`);
    if (!chip) {return;}
    chip.classList.toggle('busy', busy);
}

/**
 * Refresh existing chip class/title/innerHTML to match `port.get` state.
 * Safe to call repeatedly; does not rebuild the DOM or rebind handlers.
 */
export function syncToolbarToggles(parent: HTMLElement, port: SettingsPort): void {
    const chips = parent.querySelectorAll<HTMLButtonElement>('.toggle-chip');
    chips.forEach(chip => {
        const key = chip.dataset.toggleKey as keyof AppSettings | undefined;
        if (!key) {return;}
        const def = getToggleDef(key);
        if (!def) {return;}

        const val = port.get(key);
        const isDisabled = def.requires
            ? evaluateChipDisabled(def, { [def.requires]: port.get(def.requires) } as Partial<AppSettings>)
            : false;
        chip.classList.toggle('disabled', isDisabled);
        chip.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

        if (def.type === 'boolean') {
            const isActive = Boolean(val);
            chip.classList.toggle('active', isActive && !isDisabled);
            chip.title = isDisabled
                ? (def.disabledTooltip ?? def.tooltipOff)
                : (isActive ? def.tooltipOn : def.tooltipOff);
            chip.innerHTML = `<span class="chip-icon">${def.icon}</span>${def.label}`;
        } else if (def.type === 'cycle') {
            const cs = getCycleState(def, val);
            chip.classList.toggle('active', !isDisabled);
            chip.title = isDisabled
                ? (def.disabledTooltip ?? def.tooltipOff)
                : `${def.tooltipOn.replace(/:.+$/, '')}: ${cs?.label ?? String(val)}`;
            chip.innerHTML = `<span class="chip-icon">${cs?.icon ?? def.icon}</span>${cs?.label ?? def.label}`;
        }
    });
}

/**
 * Canonical CSS for `.toggle-bar` and `.toggle-chip`. Uses generic theme
 * tokens (`--toolbar-accent`, `--toolbar-border`, `--toolbar-muted`,
 * `--toolbar-on-accent`, `--toolbar-active-shadow`) so each host maps its
 * existing CSS variables onto these names at the host's own scope
 * (`:root` for popup, `:host` for quick-search Shadow DOM).
 */
export const TOOLBAR_TOGGLE_CSS = `
.toggle-bar {
  display: flex;
  gap: 6px;
  padding: 4px 16px;
  align-items: center;
  flex-wrap: wrap;
  min-height: 0;
}
.toggle-bar:empty {
  display: none;
}
.toggle-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--toolbar-border);
  background: transparent;
  color: var(--toolbar-muted);
  transition: all 0.18s ease;
  user-select: none;
  white-space: nowrap;
  font-family: inherit;
  line-height: 1.5;
  opacity: 0.55;
}
.toggle-chip:hover {
  opacity: 0.8;
}
.toggle-chip.active {
  background: var(--toolbar-accent);
  color: var(--toolbar-on-accent, #fff);
  border-color: var(--toolbar-accent);
  opacity: 1;
  box-shadow: 0 0 6px var(--toolbar-active-shadow, rgba(59, 130, 246, 0.35));
}
.toggle-chip.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
  background: transparent;
  color: var(--toolbar-muted);
  border-color: var(--toolbar-border);
}
.toggle-chip.disabled:hover {
  opacity: 0.45;
}
.toggle-chip .chip-icon {
  font-size: 12px;
}
/* Layer 5: subtle pulse while the chip's feature is doing background work
   (e.g. AI Phase 2 embedding in flight). Pure CSS animation — zero JS cost
   beyond toggling the .busy class. The animation tweaks box-shadow only,
   so a busy chip can also be .active (the brighter blue stays visible). */
.toggle-chip.busy {
  animation: toggle-chip-busy-pulse 1.2s ease-in-out infinite;
}
@keyframes toggle-chip-busy-pulse {
  0%, 100% { box-shadow: 0 0 6px var(--toolbar-active-shadow, rgba(59, 130, 246, 0.35)); }
  50%      { box-shadow: 0 0 14px var(--toolbar-active-shadow, rgba(59, 130, 246, 0.7)); }
}
@media (prefers-reduced-motion: reduce) {
  .toggle-chip.busy { animation: none; }
}
`;

/**
 * Inject `TOOLBAR_TOGGLE_CSS` into a Document head or ShadowRoot. Idempotent
 * via a `data-toolbar-toggle-css` marker — safe to call on every renderer init.
 */
export function injectToolbarToggleCss(target: Document | ShadowRoot): void {
    const root: ParentNode = target instanceof Document ? target.head : target;
    if (root.querySelector('style[data-toolbar-toggle-css]')) {return;}

    const ownerDoc = target instanceof Document ? target : (target.ownerDocument ?? document);
    const style = ownerDoc.createElement('style');
    style.setAttribute('data-toolbar-toggle-css', '');
    style.textContent = TOOLBAR_TOGGLE_CSS;
    root.appendChild(style);
}
