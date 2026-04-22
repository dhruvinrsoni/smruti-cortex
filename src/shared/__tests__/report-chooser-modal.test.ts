// Tests for report-chooser-modal.ts — shared DOM builder for the Report
// button's masking-level chooser.

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildReportChooser } from '../report-chooser-modal';
import { MASKING_OPTIONS } from '../report-chooser-utils';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('buildReportChooser', () => {
    it('creates exactly one option button per MASKING_OPTIONS entry, in order', () => {
        const handle = buildReportChooser(document, { onPick: vi.fn() });
        document.body.appendChild(handle.root);

        expect(handle.optionButtons).toHaveLength(MASKING_OPTIONS.length);
        for (let i = 0; i < MASKING_OPTIONS.length; i++) {
            const btn = handle.optionButtons[i];
            expect(btn.getAttribute('data-level')).toBe(MASKING_OPTIONS[i].level);
            expect(btn.textContent).toContain(MASKING_OPTIONS[i].label);
            expect(btn.textContent).toContain(MASKING_OPTIONS[i].description);
        }
    });

    it('returns `partial` as the default focus button', () => {
        const handle = buildReportChooser(document, { onPick: vi.fn() });
        expect(handle.defaultFocusButton?.getAttribute('data-level')).toBe('partial');
    });

    it('calls onPick with the clicked level and disposes', () => {
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const handle = buildReportChooser(document, { onPick, onCancel });
        document.body.appendChild(handle.root);

        const fullBtn = handle.optionButtons.find((b) => b.getAttribute('data-level') === 'full')!;
        fullBtn.click();

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith('full');
        expect(onCancel).not.toHaveBeenCalled();
        expect(handle.root.isConnected).toBe(false);
    });

    it('calls onCancel when the Cancel button is clicked', () => {
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const handle = buildReportChooser(document, { onPick, onCancel });
        document.body.appendChild(handle.root);

        handle.cancelButton.click();

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onPick).not.toHaveBeenCalled();
        expect(handle.root.isConnected).toBe(false);
    });

    it('cancels when Escape is pressed', () => {
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const handle = buildReportChooser(document, { onPick, onCancel });
        document.body.appendChild(handle.root);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onPick).not.toHaveBeenCalled();
        expect(handle.root.isConnected).toBe(false);
    });

    it('cancels when the backdrop is clicked (but not when the dialog body is clicked)', () => {
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const handle = buildReportChooser(document, { onPick, onCancel });
        document.body.appendChild(handle.root);

        handle.dialog.click();
        expect(onCancel).not.toHaveBeenCalled();

        handle.root.click();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('only fires the callback once even if the user clicks multiple options rapidly', () => {
        const onPick = vi.fn();
        const handle = buildReportChooser(document, { onPick });
        document.body.appendChild(handle.root);

        handle.optionButtons[0].click();
        handle.optionButtons[1].click();

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith(MASKING_OPTIONS[0].level);
    });

    it('removes the global Escape listener on dispose', () => {
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const handle = buildReportChooser(document, { onPick, onCancel });
        document.body.appendChild(handle.root);

        handle.dispose();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(onCancel).not.toHaveBeenCalled();
    });
});
