// fresh-install-profile.ts — the "fully set-up gift" applied ONCE on a brand-new install.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE ONE PLACE TO TUNE THE OUT-OF-BOX EXPERIENCE.                   │
// │  Edit a single line here to change what every brand-new user starts with.  │
// └──────────────────────────────────────────────────────────────────────────┘
//
// HOW IT RELATES TO settings.ts (the single source of truth):
//   • SETTINGS_SCHEMA (settings.ts) owns the SHAPE + the SAFE BASELINE default of
//     every setting. That baseline is deliberately conservative.
//   • FRESH_INSTALL_PROFILE (this file) is an opinionated, documented OVERLAY of a
//     SUBSET of those same keys — "what a brand-new user should start with", which
//     can be more generous than the conservative baseline.
//   • It is typed `Partial<AppSettings>`, so EVERY key here must be a real settings
//     key with a correctly-typed value — the compiler rejects typos and drift.
//     We never invent keys or values the schema wouldn't validate.
//
// WHEN IT APPLIES:
//   • Exactly once, on chrome.runtime.onInstalled with reason === 'install'.
//   • Existing users upgrading (reason === 'update') are NEVER touched — their
//     chosen settings are preserved. See lifecycle/fresh-install.ts.
//
// THE POLICY (Spring-Boot-style "max SAFE auto-config"):
//   • Turn ON safe, high-value features so the extension feels fully set up.
//   • Keep DANGEROUS / heavy / setup-requiring features OFF (opt-in), so a brand-new
//     user is never handed a loaded gun and never hits a "why is this broken?" wall.

import type { AppSettings } from './settings';

export const FRESH_INSTALL_PROFILE: Partial<AppSettings> = {
  // ── SAFE high-value features: ON out of the box ──────────────────────────────
  commandPaletteEnabled: true,                // prefix modes available immediately
  commandPaletteModes: ['/', '@', '#', '??'], // NOTE: '>' (power tier) is intentionally
                                              // dropped for new users — it's opt-in and
                                              // warned (progressive disclosure). They can
                                              // enable it later via Settings / the palette.
  indexBookmarks: true,                       // bookmarks searchable from day one
  showRecentHistory: true,                    // empty popup shows recent pages…
  showRecentSearches: true,                   // …and recent searches (useful, not noisy)

  // ── Onboarding / teaching: ON for the new user ───────────────────────────────
  // (These also default true in the schema; restated here so this file is the
  //  complete, self-documenting picture of a fresh install. Flip any line to false
  //  to ship a new install with that piece off.)
  onboardingEnabled: true,                    // master switch for welcome + all silos
  onboardingChecklistEnabled: true,           // Silo A: learn-by-doing checklist
  onboardingTipsEnabled: true,                // Silo B: replayable just-in-time tips
  onboardingCheatsheetEnabled: true,          // Silo C: rich `?` cheatsheet panel
  onboardingDemosEnabled: true,               // Silo D: animated demos on welcome page

  // ── DELIBERATELY OMITTED (kept at the conservative schema baseline = OFF) ─────
  //   advancedBrowserCommands → ~45 power commands + a Chrome optional-permission
  //                             prompt. Opt-in only.
  //   ollamaEnabled / embeddingsEnabled → require a local Ollama install; turning
  //                             them on by default would surface "AI offline" errors.
  //   commandPaletteInPopup   → keep the popup simple by default; the overlay is the
  //                             power surface.
  //   '>' power prefix        → see commandPaletteModes above.
};
