/**
 * Unit tests for tour.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  POPUP_TOUR_STEPS,
  isTourCompleted,
  markTourCompleted,
  runTour,
  type TourStep,
} from '../tour';

describe('tour', () => {
  const storageGet = vi.fn();
  const storageSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storageGet.mockResolvedValue({});
    storageSet.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: storageGet,
          set: storageSet,
        },
      },
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('POPUP_TOUR_STEPS is non-empty and well-formed', () => {
    expect(POPUP_TOUR_STEPS.length).toBeGreaterThan(0);
    for (const step of POPUP_TOUR_STEPS) {
      expect(step).toMatchObject({
        target: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        position: expect.stringMatching(/top|bottom/),
      });
    }
  });

  it('isTourCompleted reads storage key', async () => {
    storageGet.mockResolvedValueOnce({ tourCompleted: true });
    await expect(isTourCompleted()).resolves.toBe(true);
    storageGet.mockResolvedValueOnce({ tourCompleted: false });
    await expect(isTourCompleted()).resolves.toBe(false);
  });

  it('isTourCompleted returns true on storage error', async () => {
    storageGet.mockRejectedValueOnce(new Error('fail'));
    await expect(isTourCompleted()).resolves.toBe(true);
  });

  it('markTourCompleted sets storage', async () => {
    await markTourCompleted();
    expect(storageSet).toHaveBeenCalledWith({ tourCompleted: true });
  });

  it('markTourCompleted ignores set errors', async () => {
    storageSet.mockRejectedValueOnce(new Error('fail'));
    await expect(markTourCompleted()).resolves.toBeUndefined();
  });

  it('runTour resolves immediately for empty steps', async () => {
    await expect(runTour([], document)).resolves.toBeUndefined();
  });

  it('runTour completes when user clicks Done (single step)', async () => {
    const box = document.createElement('div');
    box.id = 'search-input';
    document.body.appendChild(box);

    const steps: TourStep[] = [
      { target: '#search-input', title: 'One', description: 'Desc', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;

    expect(document.querySelector('.tour-tooltip')).toBeNull();
    expect(storageSet).toHaveBeenCalled();
  });

  it('runTour skips when target missing and resolves after last miss', async () => {
    const steps: TourStep[] = [
      { target: '#missing-1', title: 'A', description: 'a', position: 'bottom' },
      { target: '#missing-2', title: 'B', description: 'b', position: 'bottom' },
    ];
    await expect(runTour(steps, document)).resolves.toBeUndefined();
  });

  it('runTour uses resolveTarget when provided', async () => {
    const el = document.createElement('div');
    el.id = 'x';
    document.body.appendChild(el);

    const steps: TourStep[] = [
      { target: '#ignored', title: 'T', description: 'D', position: 'bottom' },
    ];
    const done = runTour(steps, document, () => el);

    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;
  });

  it('runTour Skip ends tour', async () => {
    const el = document.createElement('div');
    el.id = 'search-input';
    document.body.appendChild(el);

    const steps: TourStep[] = [
      { target: '#search-input', title: 'T', description: 'D', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-skip'));
    (document.querySelector('.tour-skip') as HTMLButtonElement).click();
    await done;
  });

  it('runTour Escape ends tour', async () => {
    const el = document.createElement('div');
    el.id = 'search-input';
    document.body.appendChild(el);

    const steps: TourStep[] = [
      { target: '#search-input', title: 'T', description: 'D', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-tooltip'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await done;
  });

  it('runTour Back then Done on two steps', async () => {
    const a = document.createElement('div');
    a.id = 'a';
    const b = document.createElement('div');
    b.id = 'b';
    document.body.append(a, b);

    const steps: TourStep[] = [
      { target: '#a', title: '1', description: 'one', position: 'bottom' },
      { target: '#b', title: '2', description: 'two', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    await vi.waitFor(() => document.querySelector('.tour-prev'));
    (document.querySelector('.tour-prev') as HTMLButtonElement).click();

    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const btn = document.querySelector('.tour-next') as HTMLButtonElement | null;
      return btn?.textContent === 'Done' ? btn : null;
    });
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    await done;
  });

  it('runTour positions tooltip for zero-size target (hidden element branch)', async () => {
    const el = document.createElement('div');
    el.id = 'hidden-target';
    el.style.width = '0';
    el.style.height = '0';
    el.style.overflow = 'hidden';
    document.body.appendChild(el);

    const steps: TourStep[] = [
      { target: '#hidden-target', title: 'H', description: 'hidden', position: 'top' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;
  });
});
