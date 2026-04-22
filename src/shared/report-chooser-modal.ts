// report-chooser-modal.ts — DOM builder for the Report button's masking-
// level chooser. Kept in `shared/` so both the popup (attached to
// document.body) and the quick-search overlay (attached to its shadowRoot
// container) can reuse the exact same markup.

import type { MaskingLevel } from './data-masker';
import { MASKING_OPTIONS } from './report-chooser-utils';

export interface ReportChooserCallbacks {
    onPick: (level: MaskingLevel) => void;
    onCancel?: () => void;
}

export interface ReportChooserStyles {
    /** CSS applied to the full-viewport backdrop. */
    overlayCss?: string;
    /** CSS applied to the centered dialog card. */
    dialogCss?: string;
    /** CSS applied to each option row (`button` element). */
    optionCss?: string;
    /** CSS applied to the option label (larger text). */
    labelCss?: string;
    /** CSS applied to the option description (smaller muted text). */
    descCss?: string;
    /** CSS applied to the Cancel button. */
    cancelBtnCss?: string;
}

/**
 * What's returned from {@link buildReportChooser}. The caller is
 * responsible for attaching `root` to the DOM; `dispose` removes the root
 * and detaches any document-level listeners (Escape key).
 */
export interface ReportChooserHandle {
    /** The overlay element — attach this to the DOM. */
    root: HTMLElement;
    /** The dialog card inside the overlay (for focus management / testing). */
    dialog: HTMLElement;
    /** The list of option buttons in `none → partial → full` order. */
    optionButtons: HTMLButtonElement[];
    /** The Cancel button. */
    cancelButton: HTMLButtonElement;
    /** Default-focus button (the `partial` row). */
    defaultFocusButton: HTMLButtonElement | null;
    /** Tear down: removes the overlay and detaches key listeners. */
    dispose: () => void;
}

const DEFAULT_STYLES: Required<ReportChooserStyles> = {
    overlayCss: 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;',
    dialogCss: 'background:var(--bg,#fff);color:var(--text,#1a1a1a);border-radius:12px;padding:20px 24px;max-width:360px;width:92%;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-family:inherit;',
    optionCss: 'display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border,#d1d5db);background:transparent;color:inherit;border-radius:8px;cursor:pointer;font-family:inherit;',
    labelCss: 'font-size:13px;font-weight:600;margin-bottom:2px;',
    descCss: 'font-size:11px;color:var(--muted,#666);line-height:1.4;',
    cancelBtnCss: 'padding:6px 16px;font-size:12px;font-weight:600;border:1px solid #d1d5db;color:var(--text,#333);background:transparent;border-radius:6px;cursor:pointer;',
};

/**
 * Build the chooser modal. Does NOT attach to the DOM — the caller picks
 * the insertion point (document.body for the popup, shadowRoot container
 * for the quick-search overlay) and owns when to show/hide it.
 *
 * The returned {@link ReportChooserHandle} disposes itself on pick or
 * cancel; explicit `dispose()` is only needed if the caller wants to
 * force-close the modal.
 */
export function buildReportChooser(
    doc: Document,
    callbacks: ReportChooserCallbacks,
    styles: ReportChooserStyles = {},
): ReportChooserHandle {
    const s = { ...DEFAULT_STYLES, ...styles };

    const overlay = doc.createElement('div');
    overlay.className = 'report-chooser-overlay';
    overlay.style.cssText = s.overlayCss;

    const dialog = doc.createElement('div');
    dialog.className = 'report-chooser-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Choose report masking level');
    dialog.style.cssText = s.dialogCss;

    const title = doc.createElement('div');
    title.className = 'report-chooser-title';
    title.textContent = 'How should we mask the report?';
    title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:4px;';

    const subtitle = doc.createElement('div');
    subtitle.className = 'report-chooser-subtitle';
    subtitle.textContent = 'The report is copied to your clipboard. Pick how much to redact before you paste it into GitHub.';
    subtitle.style.cssText = 'font-size:11px;color:var(--muted,#666);line-height:1.45;margin-bottom:14px;';

    dialog.appendChild(title);
    dialog.appendChild(subtitle);

    let picked = false;
    let disposed = false;
    const optionButtons: HTMLButtonElement[] = [];
    let defaultFocusButton: HTMLButtonElement | null = null;

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
        }
    };

    const dispose = () => {
        if (disposed) { return; }
        disposed = true;
        doc.removeEventListener('keydown', onKey, true);
        overlay.remove();
    };

    const cancel = () => {
        if (picked || disposed) { return; }
        dispose();
        callbacks.onCancel?.();
    };

    const pick = (level: MaskingLevel) => {
        if (picked || disposed) { return; }
        picked = true;
        dispose();
        callbacks.onPick(level);
    };

    for (const opt of MASKING_OPTIONS) {
        const row = doc.createElement('button');
        row.className = `report-chooser-option report-chooser-option-${opt.level}`;
        row.setAttribute('data-level', opt.level);
        row.type = 'button';
        row.style.cssText = s.optionCss;

        const label = doc.createElement('div');
        label.className = 'report-chooser-option-label';
        label.textContent = opt.label;
        label.style.cssText = s.labelCss;

        const desc = doc.createElement('div');
        desc.className = 'report-chooser-option-description';
        desc.textContent = opt.description;
        desc.style.cssText = s.descCss;

        row.appendChild(label);
        row.appendChild(desc);
        row.addEventListener('click', () => pick(opt.level));

        dialog.appendChild(row);
        optionButtons.push(row);
        if (opt.level === 'partial') { defaultFocusButton = row; }
    }

    const btnRow = doc.createElement('div');
    btnRow.className = 'report-chooser-actions';
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:6px;';

    const cancelBtn = doc.createElement('button');
    cancelBtn.className = 'report-chooser-cancel';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = s.cancelBtnCss;
    cancelBtn.addEventListener('click', cancel);
    btnRow.appendChild(cancelBtn);
    dialog.appendChild(btnRow);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cancel(); } });
    doc.addEventListener('keydown', onKey, true);

    return { root: overlay, dialog, optionButtons, cancelButton: cancelBtn, defaultFocusButton, dispose };
}
