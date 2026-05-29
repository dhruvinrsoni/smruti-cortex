import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { chromeMock } from '../../../__test-utils__';

const mocks = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));

vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: (k: string) => mocks.settings[k],
    init: () => Promise.resolve(),
  },
}));

import { initChecklist } from '../checklist';

const ALL_DONE = {
  onboardingMilestones: {
    firstSearch: true,
    firstResultOpen: true,
    firstSlashCommand: true,
    firstWebSearch: true,
    firstOverlayOpen: true,
  },
};

describe('onboarding checklist (Silo A)', () => {
  let get: Mock;
  let set: Mock;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = { onboardingEnabled: true, onboardingChecklistEnabled: true };
    const chromeApi = chromeMock().withStorage().build();
    get = chromeApi.storage!.local.get as Mock;
    set = chromeApi.storage!.local.set as Mock;
    get.mockImplementation(() => Promise.resolve({})); // not dismissed, no milestones
    set.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', chromeApi);
    container = document.createElement('div');
  });

  it('renders when enabled, not dismissed, and not all done', async () => {
    const rendered = await initChecklist(container);
    expect(rendered).toBe(true);
    expect(container.querySelector('.onboarding-checklist')).not.toBeNull();
    expect(container.querySelectorAll('.onboarding-checklist__item').length).toBe(5);
  });

  it('marks completed steps and shows a progress count', async () => {
    get.mockImplementation((key: string) =>
      Promise.resolve(key === 'onboardingMilestones' ? { onboardingMilestones: { firstSearch: true } } : {}),
    );
    await initChecklist(container);
    expect(container.querySelectorAll('.onboarding-checklist__item.is-done').length).toBe(1);
    expect(container.querySelector('.onboarding-checklist__title')?.textContent).toContain('1/5');
  });

  it('is a no-op when the silo flag is off', async () => {
    mocks.settings.onboardingChecklistEnabled = false;
    const rendered = await initChecklist(container);
    expect(rendered).toBe(false);
    expect(container.querySelector('.onboarding-checklist')).toBeNull();
  });

  it('is a no-op when the master flag is off', async () => {
    mocks.settings.onboardingEnabled = false;
    expect(await initChecklist(container)).toBe(false);
  });

  it('does not render once all milestones are complete', async () => {
    get.mockImplementation((key: string) =>
      Promise.resolve(key === 'onboardingMilestones' ? ALL_DONE : {}),
    );
    expect(await initChecklist(container)).toBe(false);
  });

  it('does not render when previously dismissed', async () => {
    get.mockImplementation((key: string) =>
      Promise.resolve(key === 'onboardingChecklistDismissed' ? { onboardingChecklistDismissed: true } : {}),
    );
    expect(await initChecklist(container)).toBe(false);
  });

  it('dismiss button stores the flag and clears the card', async () => {
    await initChecklist(container);
    const close = container.querySelector('.onboarding-checklist__close') as HTMLButtonElement;
    expect(close).not.toBeNull();
    close.click();
    expect(set).toHaveBeenCalledWith({ onboardingChecklistDismissed: true });
    expect(container.querySelector('.onboarding-checklist')).toBeNull();
  });

  it('returns false for a null container', async () => {
    expect(await initChecklist(null)).toBe(false);
  });
});
