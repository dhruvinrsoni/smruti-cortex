/**
 * Unit tests for tour.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { chromeMock } from '../../__test-utils__';
import {
  POPUP_TOUR_STEPS,
  isTourCompleted,
  markTourCompleted,
  runTour,
  type TourStep,
} from '../tour';

describe('tour', () => {
  let storageGet: Mock;
  let storageSet: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    const chromeApi = chromeMock().withStorage().build();
    storageGet = chromeApi.storage!.local.get as Mock;
    storageSet = chromeApi.storage!.local.set as Mock;
    storageGet.mockResolvedValue({});
    storageSet.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', chromeApi);
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

  it('runTour positions tooltip top when position is top and rect.top is large', async () => {
    const el = document.createElement('div');
    el.id = 'top-target';
    document.body.appendChild(el);

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 500, bottom: 530, left: 100, right: 200,
      width: 100, height: 30, x: 100, y: 500, toJSON: () => ({}),
    });

    const steps: TourStep[] = [
      { target: '#top-target', title: 'T', description: 'top position', position: 'top' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-next'));
    const tooltip = document.querySelector('.tour-tooltip') as HTMLElement;
    const topValue = parseFloat(tooltip.style.top);
    expect(topValue).toBeLessThan(500);
    (document.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;
  });

  it('runTour positions highlight for visible element', async () => {
    const el = document.createElement('div');
    el.id = 'visible-target';
    document.body.appendChild(el);

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 130, left: 50, right: 150,
      width: 100, height: 30, x: 50, y: 100, toJSON: () => ({}),
    });

    const steps: TourStep[] = [
      { target: '#visible-target', title: 'V', description: 'visible', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    await vi.waitFor(() => document.querySelector('.tour-highlight'));
    const highlight = document.querySelector('.tour-highlight') as HTMLElement;
    expect(highlight.style.display).toBe('block');
    expect(highlight.style.width).toBe('112px');
    (document.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;
  });

  it('runTour skips middle step when target is missing', async () => {
    const a = document.createElement('div');
    a.id = 'first';
    const c = document.createElement('div');
    c.id = 'third';
    document.body.append(a, c);

    const steps: TourStep[] = [
      { target: '#first', title: '1', description: 'one', position: 'bottom' },
      { target: '#missing-middle', title: '2', description: 'two', position: 'bottom' },
      { target: '#third', title: '3', description: 'three', position: 'bottom' },
    ];
    const done = runTour(steps, document);

    // Step 0: click Next → showStep(1) → skip (missing) → showStep(2) renders
    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    // currentStep is 1 after the first Next click; showStep(2) rendered "Done"
    // Click Done → currentStep becomes 2, showStep(2) re-renders
    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    // Click Done again → currentStep 2 === steps.length-1 → cleanup
    await vi.waitFor(() => document.querySelector('.tour-next'));
    (document.querySelector('.tour-next') as HTMLButtonElement).click();

    await done;
  });

  it('runTour appends to ShadowRoot when root is ShadowRoot', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const el = document.createElement('div');
    el.id = 'shadow-target';
    shadow.appendChild(el);

    const steps: TourStep[] = [
      { target: '#shadow-target', title: 'S', description: 'shadow', position: 'bottom' },
    ];
    const done = runTour(steps, shadow);

    await vi.waitFor(() => shadow.querySelector('.tour-next'));
    expect(shadow.querySelector('.tour-tooltip')).toBeTruthy();
    expect(shadow.querySelector('.tour-backdrop')).toBeTruthy();
    (shadow.querySelector('.tour-next') as HTMLButtonElement).click();
    await done;
  });
});
