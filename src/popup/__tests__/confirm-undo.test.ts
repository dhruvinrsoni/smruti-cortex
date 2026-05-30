import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmDestructive, showUndoToast } from '../confirm-undo';

function dialogButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('.cu-dialog button')) as HTMLButtonElement[];
}

describe('confirmDestructive', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('renders the op title, consequences and a backup checkbox', async () => {
    const p = confirmDestructive('clear', { offerBackup: true });
    const dialog = document.querySelector('.cu-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Clear index');
    expect(document.querySelectorAll('.cu-dialog li').length).toBeGreaterThan(0);
    expect(document.querySelector('.cu-dialog input[type="checkbox"]')).not.toBeNull();
    dialogButtons()[1]!.click(); // confirm — settle the promise
    await p;
  });

  it('resolves {confirmed:true, backup:true} when confirmed with backup checked', async () => {
    const p = confirmDestructive('clear', { offerBackup: true });
    dialogButtons()[1]!.click(); // confirm ([0] is cancel)
    await expect(p).resolves.toEqual({ confirmed: true, backup: true });
    expect(document.querySelector('.cu-overlay')).toBeNull(); // dialog removed
  });

  it('resolves {confirmed:false} when cancelled', async () => {
    const p = confirmDestructive('factoryReset', { offerBackup: true });
    dialogButtons()[0]!.click(); // cancel
    await expect(p).resolves.toEqual({ confirmed: false, backup: false });
  });

  it('omits the backup checkbox when offerBackup is not set', async () => {
    const p = confirmDestructive('clear', {});
    expect(document.querySelector('.cu-dialog input[type="checkbox"]')).toBeNull();
    dialogButtons()[1]!.click();
    await p;
  });
});

describe('showUndoToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('shows a toast whose Undo button runs onUndo and dismisses', () => {
    const onUndo = vi.fn();
    showUndoToast('Cleared.', onUndo, 10_000);
    const toast = document.querySelector('.cu-undo-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Cleared.');
    (toast!.querySelector('button') as HTMLButtonElement).click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.cu-undo-toast')).toBeNull();
  });

  it('auto-dismisses after the window elapses without calling onUndo', () => {
    const onUndo = vi.fn();
    showUndoToast('Cleared.', onUndo, 10_000);
    expect(document.querySelector('.cu-undo-toast')).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(document.querySelector('.cu-undo-toast')).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
