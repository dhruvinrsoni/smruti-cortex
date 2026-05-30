// confirm-undo.ts — styled confirmation dialog + undo toast for destructive ops.
//
// Self-contained DOM (appended to document.body, removed on close) so it never
// collides with the existing settings-modal markup. Pure orchestration + the op
// registry live in safety-utils.ts.

import { DESTRUCTIVE_OPS, UNDO_WINDOW_MS, type DestructiveOpId } from './safety-utils';

export interface ConfirmChoice {
  confirmed: boolean;
  /** True when the user kept "Export a backup first" ticked. */
  backup: boolean;
}

/**
 * Show a styled, consequence-clear confirmation dialog. Resolves with the user's
 * choice. Replaces the easy-to-blow-through native confirm() for destructive ops.
 */
export function confirmDestructive(
  id: DestructiveOpId,
  opts: { offerBackup?: boolean } = {},
): Promise<ConfirmChoice> {
  const op = DESTRUCTIVE_OPS[id];
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cu-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:2147483646;';

    const dialog = document.createElement('div');
    dialog.className = 'cu-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText =
      'background:var(--card,#161b22);color:var(--text,#e6edf3);border:1px solid var(--border,#2a313c);border-radius:12px;max-width:360px;width:calc(100% - 32px);padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-family:inherit;';

    const title = document.createElement('h2');
    title.style.cssText = 'margin:0 0 10px;font-size:16px;';
    title.textContent = op.title;
    dialog.appendChild(title);

    const list = document.createElement('ul');
    list.style.cssText = 'margin:0 0 14px;padding-left:18px;font-size:13px;color:var(--muted,#8b949e);';
    for (const c of op.consequences) {
      const li = document.createElement('li');
      li.textContent = c;
      list.appendChild(li);
    }
    dialog.appendChild(list);

    let backupCheckbox: HTMLInputElement | null = null;
    if (opts.offerBackup) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;';
      backupCheckbox = document.createElement('input');
      backupCheckbox.type = 'checkbox';
      backupCheckbox.checked = true; // default ON — safer
      const span = document.createElement('span');
      span.textContent = 'Export a backup first';
      label.append(backupCheckbox, span);
      dialog.appendChild(label);
    }

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText =
      'font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--border,#2a313c);background:transparent;color:inherit;cursor:pointer;';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = op.confirmLabel;
    confirm.style.cssText =
      'font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #f85149;background:#f85149;color:#fff;cursor:pointer;';
    buttons.append(cancel, confirm);
    dialog.appendChild(buttons);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    confirm.focus();

    const close = (choice: ConfirmChoice): void => {
      overlay.remove();
      resolve(choice);
    };
    cancel.addEventListener('click', () => close({ confirmed: false, backup: false }));
    confirm.addEventListener('click', () => close({ confirmed: true, backup: !!backupCheckbox?.checked }));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { close({ confirmed: false, backup: false }); }
    });
    overlay.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') { close({ confirmed: false, backup: false }); }
    });
  });
}

/**
 * Show a bottom toast offering "Undo" for `ms` milliseconds. Clicking Undo runs
 * `onUndo` and dismisses; otherwise it auto-dismisses.
 */
export function showUndoToast(message: string, onUndo: () => void, ms: number = UNDO_WINDOW_MS): void {
  const toast = document.createElement('div');
  toast.className = 'cu-undo-toast';
  toast.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#161b22;color:#e6edf3;border:1px solid #2a313c;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px;z-index:2147483647;box-shadow:0 8px 30px rgba(0,0,0,0.45);font-size:13px;';

  const text = document.createElement('span');
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Undo';
  btn.style.cssText = 'font:inherit;font-weight:600;color:#58a6ff;background:transparent;border:none;cursor:pointer;';

  let timer: ReturnType<typeof setTimeout> | null = null;
  const dismiss = (): void => {
    if (timer) { clearTimeout(timer); timer = null; }
    toast.remove();
  };
  btn.addEventListener('click', () => {
    dismiss();
    onUndo();
  });
  toast.append(text, btn);
  document.body.appendChild(toast);
  timer = setTimeout(dismiss, ms);
}
