import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { chromeMock } from '../../../__test-utils__';
import {
  CHECKLIST_STEPS,
  isComplete,
  completedCount,
  allComplete,
  withMilestone,
  getMilestones,
  markMilestone,
  resetMilestones,
  type MilestoneState,
} from '../milestones';

describe('milestones — pure state queries', () => {
  it('isComplete reflects the flag', () => {
    expect(isComplete({ firstSearch: true }, 'firstSearch')).toBe(true);
    expect(isComplete({}, 'firstSearch')).toBe(false);
  });

  it('completedCount counts only completed steps', () => {
    expect(completedCount({})).toBe(0);
    expect(completedCount({ firstSearch: true, firstResultOpen: true })).toBe(2);
  });

  it('allComplete is true only when every step is done', () => {
    const all: MilestoneState = {};
    for (const step of CHECKLIST_STEPS) { all[step.id] = true; }
    expect(allComplete(all)).toBe(true);
    expect(allComplete({ firstSearch: true })).toBe(false);
  });

  it('withMilestone returns a new state without mutating the original', () => {
    const state: MilestoneState = {};
    const next = withMilestone(state, 'firstSearch');
    expect(next.firstSearch).toBe(true);
    expect(state.firstSearch).toBeUndefined();
  });

  it('withMilestone returns the same reference when already set (no-op)', () => {
    const state: MilestoneState = { firstSearch: true };
    expect(withMilestone(state, 'firstSearch')).toBe(state);
  });
});

describe('milestones — storage I/O', () => {
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

  it('getMilestones returns {} when storage is empty', async () => {
    await expect(getMilestones()).resolves.toEqual({});
  });

  it('getMilestones returns the stored state', async () => {
    get.mockResolvedValueOnce({ onboardingMilestones: { firstSearch: true } });
    await expect(getMilestones()).resolves.toEqual({ firstSearch: true });
  });

  it('getMilestones returns {} on storage error', async () => {
    get.mockRejectedValueOnce(new Error('storage fail'));
    await expect(getMilestones()).resolves.toEqual({});
  });

  it('markMilestone persists a newly-reached milestone', async () => {
    await markMilestone('firstSearch');
    expect(set).toHaveBeenCalledWith({ onboardingMilestones: { firstSearch: true } });
  });

  it('markMilestone is idempotent — no write when already set', async () => {
    get.mockResolvedValueOnce({ onboardingMilestones: { firstSearch: true } });
    await markMilestone('firstSearch');
    expect(set).not.toHaveBeenCalled();
  });

  it('markMilestone swallows storage errors', async () => {
    set.mockRejectedValueOnce(new Error('storage fail'));
    await expect(markMilestone('firstSearch')).resolves.toBeUndefined();
  });

  it('resetMilestones removes the storage key', async () => {
    await resetMilestones();
    expect(remove).toHaveBeenCalledWith('onboardingMilestones');
  });
});
