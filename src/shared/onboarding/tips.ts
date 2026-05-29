// tips.ts — Silo B: replayable just-in-time "Did you know?" tips.
//
// Fixes the old "shown once, lost forever" latch (commandPaletteOnboarded): instead
// of a permanent boolean, each tip is shown up to `maxShows` times on a cooldown and
// can be reset. Pure policy (shouldShowTip) + thin chrome.storage I/O. Gated by
// onboardingEnabled (master) + onboardingTipsEnabled. No DOM here — callers render.

import type { AppSettings } from '../../core/settings';

export interface TipDefinition {
  id: string;
  message: string;
}

/** The palette-intro tip (the copy the old one-shot first-use hint used). */
export const PALETTE_TIP_ID = 'paletteIntro';

export const TIP_DEFINITIONS: Record<string, TipDefinition> = {
  [PALETTE_TIP_ID]: {
    id: PALETTE_TIP_ID,
    message: 'New: Type / for commands, @ for tabs, # for bookmarks, ?? for web',
  },
};

export interface TipRecord {
  lastShown: number;
  count: number;
}
export type TipState = Record<string, TipRecord>;

export interface TipPolicy {
  maxShows: number;
  cooldownMs: number;
}
export const DEFAULT_TIP_POLICY: TipPolicy = {
  maxShows: 3,
  cooldownMs: 3 * 24 * 60 * 60 * 1000, // re-show at most once every 3 days
};

type OnboardingFlags = Pick<AppSettings, 'onboardingEnabled' | 'onboardingTipsEnabled'>;

/** Master + silo gate. */
export function areTipsEnabled(settings: OnboardingFlags | null | undefined): boolean {
  if (!settings) { return false; }
  return settings.onboardingEnabled !== false && settings.onboardingTipsEnabled !== false;
}

/** Pure: may this tip be shown now, given its record and the policy? */
export function shouldShowTip(
  record: TipRecord | undefined,
  now: number,
  policy: TipPolicy = DEFAULT_TIP_POLICY,
): boolean {
  if (!record) { return true; }
  if (record.count >= policy.maxShows) { return false; }
  return now - record.lastShown >= policy.cooldownMs;
}

const STORAGE_KEY = 'onboardingTipState';

export async function getTipState(): Promise<TipState> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    const s = r[STORAGE_KEY];
    if (s && typeof s === 'object') { return s as TipState; }
    return {};
  } catch {
    return {};
  }
}

/** Record that a tip was shown now: bumps count + lastShown (replayable, not a latch). */
export async function recordTipShown(id: string, now: number = Date.now()): Promise<void> {
  try {
    const state = await getTipState();
    const prev = state[id];
    const next: TipRecord = { lastShown: now, count: (prev?.count ?? 0) + 1 };
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...state, [id]: next } });
  } catch {
    // non-critical
  }
}

export async function resetTips(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // non-critical
  }
}
