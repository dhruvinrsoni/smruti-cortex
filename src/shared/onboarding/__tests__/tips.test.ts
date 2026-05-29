import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { chromeMock } from '../../../__test-utils__';
import {
  PALETTE_TIP_ID,
  TIP_DEFINITIONS,
  DEFAULT_TIP_POLICY,
  areTipsEnabled,
  shouldShowTip,
  getTipState,
  recordTipShown,
  resetTips,
} from '../tips';

describe('tips — gating', () => {
  it('areTipsEnabled requires both master and silo flags', () => {
    expect(areTipsEnabled({ onboardingEnabled: true, onboardingTipsEnabled: true })).toBe(true);
    expect(areTipsEnabled({ onboardingEnabled: false, onboardingTipsEnabled: true })).toBe(false);
    expect(areTipsEnabled({ onboardingEnabled: true, onboardingTipsEnabled: false })).toBe(false);
    expect(areTipsEnabled(null)).toBe(false);
    expect(areTipsEnabled(undefined)).toBe(false);
  });

  it('treats undefined flags as enabled (default-on)', () => {
    expect(areTipsEnabled({})).toBe(true);
  });
});

describe('tips — shouldShowTip (replayable, not a one-shot)', () => {
  const NOW = 1_000_000_000_000;
  const { maxShows, cooldownMs } = DEFAULT_TIP_POLICY;

  it('shows when there is no record yet', () => {
    expect(shouldShowTip(undefined, NOW)).toBe(true);
  });

  it('does not re-show within the cooldown window', () => {
    expect(shouldShowTip({ lastShown: NOW, count: 1 }, NOW + cooldownMs - 1)).toBe(false);
  });

  it('re-shows once the cooldown has elapsed', () => {
    expect(shouldShowTip({ lastShown: NOW, count: 1 }, NOW + cooldownMs)).toBe(true);
  });

  it('stops showing after maxShows (bounded replay — the fix vs the old permanent latch)', () => {
    expect(shouldShowTip({ lastShown: NOW, count: maxShows }, NOW + cooldownMs * 10)).toBe(false);
  });
});

describe('tips — storage I/O', () => {
  let get: Mock;
  let set: Mock;
  let remove: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    const chromeApi = chromeMock().withStorage().build();
    get = chromeApi.storage!.local.get as Mock;
    set = chromeApi.storage!.local.set as Mock;
    remove = chromeApi.storage!.local.remove as Mock;
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', chromeApi);
  });

  it('getTipState returns {} when empty', async () => {
    await expect(getTipState()).resolves.toEqual({});
  });

  it('recordTipShown initialises a record with count 1', async () => {
    await recordTipShown(PALETTE_TIP_ID, 5000);
    expect(set).toHaveBeenCalledWith({ onboardingTipState: { [PALETTE_TIP_ID]: { lastShown: 5000, count: 1 } } });
  });

  it('recordTipShown increments an existing count', async () => {
    get.mockResolvedValueOnce({ onboardingTipState: { [PALETTE_TIP_ID]: { lastShown: 1, count: 2 } } });
    await recordTipShown(PALETTE_TIP_ID, 9000);
    expect(set).toHaveBeenCalledWith({ onboardingTipState: { [PALETTE_TIP_ID]: { lastShown: 9000, count: 3 } } });
  });

  it('recordTipShown swallows storage errors', async () => {
    set.mockRejectedValueOnce(new Error('storage fail'));
    await expect(recordTipShown(PALETTE_TIP_ID, 1)).resolves.toBeUndefined();
  });

  it('resetTips removes the storage key (tips become showable again)', async () => {
    await resetTips();
    expect(remove).toHaveBeenCalledWith('onboardingTipState');
  });

  it('the palette tip message is defined and mentions the / prefix', () => {
    expect(TIP_DEFINITIONS[PALETTE_TIP_ID]?.message).toContain('/');
  });
});
