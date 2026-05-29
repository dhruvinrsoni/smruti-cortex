// welcome-content.ts — all the words on the welcome page, as pure data.
//
// Kept separate from welcome.ts (the DOM wiring) so the copy is testable and easy to
// edit without touching rendering. Language is deliberately plain and direct.

import { buildCheatsheetSections, type CheatsheetSection } from '../shared/onboarding/cheatsheet';

export const WELCOME_HERO = {
  emoji: '🌱',
  title: 'Welcome to SmrutiCortex',
  tagline: 'Your private memory for every page you have ever visited.',
  blurb:
    "Forgot where you read something last week? Just start typing. SmrutiCortex searches your history and bookmarks instantly — and everything stays on your own computer.",
};

export const WELCOME_BIG_TIP = {
  heading: 'The one thing to remember',
  keys: 'Ctrl + Shift + S',
  text: 'Press this on any page to open search. That is it — you are already a power user.',
};

export const WELCOME_OPEN_WAYS = {
  heading: 'Three ways to open it',
  ways: [
    'Click the SmrutiCortex icon in your browser toolbar.',
    'Press Ctrl+Shift+S on any page to pop up the search overlay.',
    'Type "sc" then Space in the address bar, then your search.',
  ],
};

export const WELCOME_PRIVACY = {
  heading: 'Your data stays yours',
  lines: [
    '100% on your device — nothing is ever sent to a server.',
    'No accounts, no tracking, no cloud.',
    'Clear or export your data anytime from Settings.',
  ],
};

export const WELCOME_FOOTER = {
  replayNote: 'You can reopen this guide anytime — type "welcome" in the command palette, or click the 👋 button in the popup.',
  onlineGuideLabel: 'See the full online guide',
  onlineGuideUrl: 'https://dhruvinrsoni.github.io/smruti-cortex/feature-tour.html',
  privacyLabel: 'Read the privacy policy',
  privacyUrl: 'https://dhruvinrsoni.github.io/smruti-cortex/privacy.html',
};

export interface WelcomePageModel {
  hero: typeof WELCOME_HERO;
  bigTip: typeof WELCOME_BIG_TIP;
  openWays: typeof WELCOME_OPEN_WAYS;
  cheatsheet: CheatsheetSection[];
  privacy: typeof WELCOME_PRIVACY;
  footer: typeof WELCOME_FOOTER;
}

/**
 * The full welcome-page content model. Pass the user's enabled palette modes so the
 * cheatsheet can dim the ones they have turned off.
 */
export function getWelcomePageModel(enabledModes?: string[]): WelcomePageModel {
  return {
    hero: WELCOME_HERO,
    bigTip: WELCOME_BIG_TIP,
    openWays: WELCOME_OPEN_WAYS,
    cheatsheet: buildCheatsheetSections({ enabledModes }),
    privacy: WELCOME_PRIVACY,
    footer: WELCOME_FOOTER,
  };
}
