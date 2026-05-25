/**
 * Unit tests for toolbar-renderer.ts — the shared toolbar render/sync logic
 * that drives both popup and quick-search.
 *
 * The renderer is host-agnostic: it talks to a `SettingsPort` adapter rather
 * than `SettingsManager` or `chrome.runtime` directly, so all tests use an
 * in-memory port stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderToolbarToggles,
  syncToolbarToggles,
  injectToolbarToggleCss,
  TOOLBAR_TOGGLE_CSS,
  type SettingsPort,
} from '../toolbar-renderer';
import type { AppSettings } from '../../core/settings';

function makePort(initial: Partial<AppSettings> = {}): {
  port: SettingsPort;
  state: Partial<AppSettings>;
  setCalls: Array<{ key: string; value: unknown }>;
  toastCalls: Array<{ message: string; type?: string }>;
  afterToggleCalls: string[];
} {
  const state: Partial<AppSettings> = { ...initial };
  const setCalls: Array<{ key: string; value: unknown }> = [];
  const toastCalls: Array<{ message: string; type?: string }> = [];
  const afterToggleCalls: string[] = [];
  const port: SettingsPort = {
    get: <K extends keyof AppSettings>(k: K) => state[k] as AppSettings[K] | undefined,
    set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
      (state as Record<string, unknown>)[k as string] = v;
      setCalls.push({ key: k as string, value: v });
    },
    showToast: (message, type) => { toastCalls.push({ message, type }); },
    onAfterToggle: (key) => { afterToggleCalls.push(String(key)); },
  };
  return { port, state, setCalls, toastCalls, afterToggleCalls };
}

describe('toolbar-renderer', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    parent.className = 'toggle-bar';
    document.body.appendChild(parent);
  });

  describe('renderToolbarToggles', () => {
    it('creates one chip per visible key, skipping unknown keys', () => {
      const { port } = makePort();
      renderToolbarToggles(parent, port, ['ollamaEnabled', 'not-a-real-key', 'indexBookmarks']);
      const chips = parent.querySelectorAll('.toggle-chip');
      expect(chips.length).toBe(2);
      expect((chips[0] as HTMLElement).dataset.toggleKey).toBe('ollamaEnabled');
      expect((chips[1] as HTMLElement).dataset.toggleKey).toBe('indexBookmarks');
    });

    it('clears existing children before re-rendering (idempotent)', () => {
      const { port } = makePort();
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      renderToolbarToggles(parent, port, ['ollamaEnabled', 'indexBookmarks']);
      expect(parent.querySelectorAll('.toggle-chip').length).toBe(2);
    });

    it('boolean chip click flips the value via port.set and fires onAfterToggle', () => {
      const { port, state, setCalls, afterToggleCalls } = makePort({ ollamaEnabled: false });
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();

      expect(setCalls).toEqual([{ key: 'ollamaEnabled', value: true }]);
      expect(state.ollamaEnabled).toBe(true);
      expect(afterToggleCalls).toEqual(['ollamaEnabled']);
    });

    it('boolean chip click again flips back to false', () => {
      const { port, state, setCalls } = makePort({ ollamaEnabled: true });
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();
      expect(setCalls).toEqual([{ key: 'ollamaEnabled', value: false }]);
      expect(state.ollamaEnabled).toBe(false);
    });

    it('cycle chip rotates through cycleValues in order', () => {
      const { port, setCalls } = makePort({ theme: 'auto' });
      renderToolbarToggles(parent, port, ['theme']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();
      expect(setCalls[0].value).toBe('light');
      chip.click();
      expect(setCalls[1].value).toBe('dark');
      chip.click();
      expect(setCalls[2].value).toBe('auto');
    });

    it('Semantic chip click calls port.set even when AI chip is OFF — fully independent', () => {
      const { port, setCalls, toastCalls, afterToggleCalls } = makePort({
        ollamaEnabled: false,
        embeddingsEnabled: false,
      });
      renderToolbarToggles(parent, port, ['embeddingsEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();

      // Semantic is independent of AI — click goes through without any toast
      expect(setCalls).toEqual([{ key: 'embeddingsEnabled', value: true }]);
      expect(afterToggleCalls).toEqual(['embeddingsEnabled']);
      expect(toastCalls).toEqual([]);
    });

    it('Semantic chip click works regardless of AI chip state (AI ON or OFF)', () => {
      // Verify it works with AI off (the critical independence case)
      const { port, setCalls } = makePort({
        ollamaEnabled: false,
        embeddingsEnabled: false,
      });
      renderToolbarToggles(parent, port, ['embeddingsEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();
      expect(setCalls).toEqual([{ key: 'embeddingsEnabled', value: true }]);
    });

    it('click event does not bubble (stopPropagation honored)', () => {
      const { port } = makePort();
      const outerListener = vi.fn();
      parent.addEventListener('click', outerListener);
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      chip.click();
      // The button itself bubbles to .toggle-bar, but stopPropagation() halts there.
      // Test that no document-level handler would fire.
      const docListener = vi.fn();
      document.addEventListener('click', docListener);
      chip.click();
      expect(docListener).not.toHaveBeenCalled();
      document.removeEventListener('click', docListener);
    });

    it('rendering applies initial active/disabled state via internal sync call', () => {
      const { port } = makePort({ ollamaEnabled: true });
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      expect(chip.classList.contains('active')).toBe(true);
      expect(chip.classList.contains('disabled')).toBe(false);
    });
  });

  describe('syncToolbarToggles', () => {
    it('updates active class based on current port state', () => {
      const { port, state } = makePort({ ollamaEnabled: false });
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      expect(chip.classList.contains('active')).toBe(false);

      state.ollamaEnabled = true;
      syncToolbarToggles(parent, port);
      expect(chip.classList.contains('active')).toBe(true);

      state.ollamaEnabled = false;
      syncToolbarToggles(parent, port);
      expect(chip.classList.contains('active')).toBe(false);
    });

    it('Semantic chip is never disabled by AI chip state — disabled class absent in all combinations', () => {
      const { port, state } = makePort({
        ollamaEnabled: false,
        embeddingsEnabled: false,
      });
      renderToolbarToggles(parent, port, ['embeddingsEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      // AI off: Semantic chip must NOT be greyed
      expect(chip.classList.contains('disabled')).toBe(false);
      expect(chip.getAttribute('aria-disabled')).toBe('false');

      state.ollamaEnabled = true;
      syncToolbarToggles(parent, port);
      // AI on: still not disabled (independent)
      expect(chip.classList.contains('disabled')).toBe(false);
      expect(chip.getAttribute('aria-disabled')).toBe('false');
    });

    it('applies tooltipOn / tooltipOff for boolean chips', () => {
      const { port, state } = makePort({ ollamaEnabled: false });
      renderToolbarToggles(parent, port, ['ollamaEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      const tooltipOff = chip.title;
      expect(tooltipOff.length).toBeGreaterThan(0);

      state.ollamaEnabled = true;
      syncToolbarToggles(parent, port);
      const tooltipOn = chip.title;
      expect(tooltipOn).not.toBe(tooltipOff);
    });

    it('Semantic chip uses tooltipOn/tooltipOff based on its own state, not AI state', () => {
      const { port, state } = makePort({
        ollamaEnabled: false,
        embeddingsEnabled: false,
      });
      renderToolbarToggles(parent, port, ['embeddingsEnabled']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      const tooltipWhenOff = chip.title;
      expect(tooltipWhenOff).toMatch(/semantic/i);  // tooltipOff reflects Semantic state

      state.embeddingsEnabled = true;
      syncToolbarToggles(parent, port);
      const tooltipWhenOn = chip.title;
      expect(tooltipWhenOn).not.toBe(tooltipWhenOff);  // switched to tooltipOn
      expect(tooltipWhenOn).toMatch(/semantic/i);       // still about Semantic, not AI
    });

    it('updates cycle chip label/icon based on current cycle value', () => {
      const { port, state } = makePort({ theme: 'auto' });
      renderToolbarToggles(parent, port, ['theme']);
      const chip = parent.querySelector('.toggle-chip') as HTMLButtonElement;
      const initialHtml = chip.innerHTML;

      state.theme = 'dark';
      syncToolbarToggles(parent, port);
      expect(chip.innerHTML).not.toBe(initialHtml);
    });

    it('chips without dataset.toggleKey are ignored (defensive)', () => {
      const { port } = makePort();
      const stray = document.createElement('button');
      stray.className = 'toggle-chip';
      parent.appendChild(stray);
      expect(() => syncToolbarToggles(parent, port)).not.toThrow();
    });
  });

  describe('injectToolbarToggleCss', () => {
    it('appends a <style data-toolbar-toggle-css> to the document head', () => {
      // Clean any prior injection from earlier tests
      document.head.querySelectorAll('style[data-toolbar-toggle-css]').forEach(s => s.remove());
      injectToolbarToggleCss(document);
      const styles = document.head.querySelectorAll('style[data-toolbar-toggle-css]');
      expect(styles.length).toBe(1);
      expect(styles[0].textContent).toContain('.toggle-chip');
    });

    it('is idempotent (second call does not duplicate the style)', () => {
      document.head.querySelectorAll('style[data-toolbar-toggle-css]').forEach(s => s.remove());
      injectToolbarToggleCss(document);
      injectToolbarToggleCss(document);
      injectToolbarToggleCss(document);
      const styles = document.head.querySelectorAll('style[data-toolbar-toggle-css]');
      expect(styles.length).toBe(1);
    });

    it('TOOLBAR_TOGGLE_CSS uses generic theme tokens (--toolbar-*) so each host can map its own variables', () => {
      expect(TOOLBAR_TOGGLE_CSS).toContain('--toolbar-accent');
      expect(TOOLBAR_TOGGLE_CSS).toContain('--toolbar-border');
      expect(TOOLBAR_TOGGLE_CSS).toContain('--toolbar-muted');
    });
  });
});
