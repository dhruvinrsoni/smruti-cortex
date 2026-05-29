import { describe, it, expect } from 'vitest';
import { FRESH_INSTALL_PROFILE } from '../fresh-install-profile';
import { SETTINGS_SCHEMA } from '../settings';

describe('FRESH_INSTALL_PROFILE', () => {
  describe('schema validity (guards against drift)', () => {
    it('every profile key exists in SETTINGS_SCHEMA', () => {
      for (const key of Object.keys(FRESH_INSTALL_PROFILE)) {
        expect(SETTINGS_SCHEMA, `profile key "${key}" must exist in the schema`).toHaveProperty(key);
      }
    });

    it('every profile value passes its schema validate()', () => {
      const schema = SETTINGS_SCHEMA as Record<string, { validate?: (v: unknown) => boolean }>;
      for (const [key, value] of Object.entries(FRESH_INSTALL_PROFILE)) {
        const entry = schema[key];
        if (entry?.validate) {
          expect(entry.validate(value), `${key}=${JSON.stringify(value)} should pass schema validate()`).toBe(true);
        }
      }
    });
  });

  describe('safety policy — dangerous / heavy features stay opt-in', () => {
    it('does NOT enable advancedBrowserCommands', () => {
      expect(FRESH_INSTALL_PROFILE).not.toHaveProperty('advancedBrowserCommands');
    });

    it('does NOT enable Ollama or embeddings (they need a local install)', () => {
      expect(FRESH_INSTALL_PROFILE).not.toHaveProperty('ollamaEnabled');
      expect(FRESH_INSTALL_PROFILE).not.toHaveProperty('embeddingsEnabled');
    });

    it('does NOT force the command palette into the popup', () => {
      expect(FRESH_INSTALL_PROFILE).not.toHaveProperty('commandPaletteInPopup');
    });

    it('excludes the > power prefix from commandPaletteModes', () => {
      expect(FRESH_INSTALL_PROFILE.commandPaletteModes).toBeDefined();
      expect(FRESH_INSTALL_PROFILE.commandPaletteModes).not.toContain('>');
    });
  });

  describe('opinionated safe defaults are ON', () => {
    it('enables the command palette with the safe prefixes', () => {
      expect(FRESH_INSTALL_PROFILE.commandPaletteEnabled).toBe(true);
      expect(FRESH_INSTALL_PROFILE.commandPaletteModes).toEqual(
        expect.arrayContaining(['/', '@', '#', '??']),
      );
    });

    it('indexes bookmarks and shows recent history/searches', () => {
      expect(FRESH_INSTALL_PROFILE.indexBookmarks).toBe(true);
      expect(FRESH_INSTALL_PROFILE.showRecentHistory).toBe(true);
      expect(FRESH_INSTALL_PROFILE.showRecentSearches).toBe(true);
    });

    it('turns on the whole onboarding system', () => {
      expect(FRESH_INSTALL_PROFILE.onboardingEnabled).toBe(true);
      expect(FRESH_INSTALL_PROFILE.onboardingChecklistEnabled).toBe(true);
      expect(FRESH_INSTALL_PROFILE.onboardingTipsEnabled).toBe(true);
      expect(FRESH_INSTALL_PROFILE.onboardingCheatsheetEnabled).toBe(true);
      expect(FRESH_INSTALL_PROFILE.onboardingDemosEnabled).toBe(true);
    });
  });
});
