/**
 * Shared, surface-agnostic renderer for the inline `??` answer pane (popup +
 * quick-search overlay). CSP-safe: builds everything with `createElement` /
 * `textContent` / `createTextNode` — NEVER `innerHTML` for dynamic text — so it
 * is safe inside the overlay's Shadow DOM and the popup alike.
 *
 * Each surface supplies its own class names and an `onActivate` callback
 * (popup → chrome.tabs.create; overlay → window.open/WINDOW_CREATE), keeping
 * open-behaviour surface-correct while the DOM construction stays shared.
 */
import { appendHighlightedTextToDOM, type SearchResult } from './search-ui-base';
import type { WebSearchEngineChip } from './web-search';

export type InlineAnswerState = 'thinking' | 'streaming' | 'done' | 'hidden' | 'fallback';

/** Loader animation shown during the `thinking` phase (before the first token). */
export type AnswerLoaderStyle = 'spinner' | 'dots' | 'shimmer' | 'caret';

/** One navigable row beneath the answer: either a history page or an engine chip. */
export interface InlineAnswerRow {
    kind: 'history' | 'chip';
    result?: SearchResult;      // when kind === 'history'
    chip?: WebSearchEngineChip; // when kind === 'chip'
}

export interface InlineAnswerClassNames {
    answerBlock: string;
    answerLabel: string;
    answerText: string;
    row: string;
    rowSelected: string;
    historyRow: string;
    chipRow: string;
    disabledRow: string;
    rowTitle: string;
    rowSubtitle: string;
    highlight?: string;
    aiHighlight?: string;
}

export interface AnswerBlock {
    /** The block element to insert into the results area. */
    root: HTMLElement;
    /** The element streamed tokens are appended to. */
    textEl: HTMLElement;
    /** The "thinking" loader element (animated via surface CSS on `data-state`). */
    loaderEl: HTMLElement;
}

export interface BuildAnswerBlockOptions {
    classNames: Pick<InlineAnswerClassNames, 'answerBlock' | 'answerLabel' | 'answerText'>;
    /** e.g. "local · llama3.2:3b". */
    modelLabel?: string;
    /** Loader style for the thinking phase. Default `'spinner'`. */
    loaderStyle?: AnswerLoaderStyle;
}

/** Build the loader's inner DOM for the chosen style (animation lives in surface CSS). */
function buildLoaderInner(style: AnswerLoaderStyle): HTMLElement {
    const el = document.createElement('div');
    el.className = 'inline-answer-loader';
    el.setAttribute('aria-label', 'Generating answer');
    if (style === 'dots') {
        for (let i = 0; i < 3; i++) {
            const d = document.createElement('span');
            d.className = 'ila-dot';
            el.appendChild(d);
        }
    } else if (style === 'shimmer') {
        for (let i = 0; i < 2; i++) {
            const b = document.createElement('span');
            b.className = 'ila-bar';
            el.appendChild(b);
        }
    } else if (style === 'spinner') {
        const s = document.createElement('span');
        s.className = 'ila-spin';
        el.appendChild(s);
        const t = document.createElement('span');
        t.className = 'ila-thinking';
        t.textContent = 'thinking…';
        el.appendChild(t);
    }
    // 'caret': empty container; surface CSS renders a blinking ▍ via ::after.
    return el;
}

/**
 * Build the (initially empty) AI answer block. Presentational — not focusable.
 * Starts in the `thinking` state so the loader shows the moment the pane renders.
 */
export function buildInlineAnswerBlock(opts: BuildAnswerBlockOptions): AnswerBlock {
    const { classNames } = opts;
    const style = opts.loaderStyle ?? 'spinner';
    const root = document.createElement('div');
    root.className = classNames.answerBlock;
    root.dataset.state = 'thinking';
    root.dataset.loader = style;
    root.setAttribute('aria-live', 'polite');
    root.tabIndex = -1;

    const label = document.createElement('div');
    label.className = classNames.answerLabel;
    label.textContent = opts.modelLabel ? `🧠 AI · ${opts.modelLabel}` : '🧠 AI';
    root.appendChild(label);

    const loaderEl = buildLoaderInner(style);
    root.appendChild(loaderEl);

    const textEl = document.createElement('div');
    textEl.className = classNames.answerText;
    root.appendChild(textEl);

    return { root, textEl, loaderEl };
}

/**
 * Append a streamed token — mutates ONLY the answer text, never the rows below.
 * The first token auto-switches the block from `thinking` to `streaming`.
 */
export function appendAnswerToken(block: AnswerBlock, token: string): void {
    if (block.root.dataset.state === 'thinking') {
        setAnswerState(block, 'streaming');
    }
    block.textEl.appendChild(document.createTextNode(token));
}

/** Reflect the stream lifecycle on the block (CSS hooks on `data-state`; `hidden` collapses it). */
export function setAnswerState(block: AnswerBlock, state: InlineAnswerState): void {
    block.root.dataset.state = state;
    block.root.style.display = state === 'hidden' ? 'none' : '';
}

/**
 * Replace the answer area with a muted "unavailable" hint and (optionally) a
 * clickable action — e.g. the popup deep-links to Settings → AI tab. CSP-safe:
 * built with createElement + addEventListener, never innerHTML.
 */
export function showAnswerUnavailable(
    block: AnswerBlock,
    opts: { message: string; action?: { label: string; onClick: () => void } },
): void {
    setAnswerState(block, 'fallback');
    block.textEl.textContent = '';
    const hint = document.createElement('span');
    hint.className = 'inline-answer-hint';
    hint.textContent = opts.message;
    block.textEl.appendChild(hint);
    if (opts.action) {
        block.textEl.appendChild(document.createTextNode(' '));
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'inline-answer-hint-link';
        link.textContent = opts.action.label;
        link.addEventListener('click', opts.action.onClick);
        block.textEl.appendChild(link);
    }
}

/**
 * Map an `ANSWER_ERROR` reason to a user-facing hint. Returns `null` for
 * reasons that should stay silent (`empty`, `busy`, `aborted`).
 *
 * NOTE: only a definitive connection failure yields `unavailable` ("is Ollama
 * running?"). A slow/cold model load is `warming` — never reported as "down".
 */
export function answerErrorMessage(reason: string): string | null {
    switch (reason) {
        case 'unavailable':
            return 'Local AI unavailable — is Ollama running?';
        case 'model-missing':
            return 'That model isn\'t installed in Ollama — pick another in Settings.';
        case 'warming':
        case 'timeout':
            return 'Local AI is warming up the model — give it a moment, then try again.';
        case 'circuit-open':
            return 'Local AI paused after repeated errors — check Ollama is running, then retry.';
        default:
            return null;
    }
}

export interface BuildRowsOptions {
    classNames: InlineAnswerClassNames;
    /** Query tokens for highlighting history-row titles/urls. */
    tokens?: string[];
    /** Index of the initially-selected row (drives the focus ring). */
    selectedIndex: number;
    onActivate: (
        row: InlineAnswerRow,
        index: number,
        mods: { shift: boolean; ctrlOrMeta: boolean },
    ) => void;
}

export interface BuiltRows {
    fragment: DocumentFragment;
    /** Index-aligned with the input rows — surfaces use these for the focus ring. */
    rowEls: HTMLElement[];
}

/** Build the navigable history + chip rows as a fragment + an index-aligned element list. */
export function buildInlineAnswerRows(rows: InlineAnswerRow[], opts: BuildRowsOptions): BuiltRows {
    const { classNames: cn, tokens = [] } = opts;
    const fragment = document.createDocumentFragment();
    const rowEls: HTMLElement[] = [];

    rows.forEach((row, index) => {
        const el = document.createElement('div');
        el.className = `${cn.row} ${row.kind === 'history' ? cn.historyRow : cn.chipRow}`;
        el.dataset.index = String(index);
        el.setAttribute('role', 'option');
        if (index === opts.selectedIndex) {
            el.classList.add(cn.rowSelected);
            el.setAttribute('aria-selected', 'true');
        }

        const title = document.createElement('div');
        title.className = cn.rowTitle;
        const subtitle = document.createElement('div');
        subtitle.className = cn.rowSubtitle;

        if (row.kind === 'history' && row.result) {
            appendHighlightedTextToDOM(
                title, row.result.title || row.result.url, tokens,
                cn.highlight ?? 'highlight', [], cn.aiHighlight ?? 'highlight-ai',
            );
            subtitle.textContent = row.result.url;
        } else if (row.kind === 'chip' && row.chip) {
            title.textContent = `Search ${row.chip.displayName} ›`;
            if (row.chip.disabled) {
                el.classList.add(cn.disabledRow);
                el.setAttribute('aria-disabled', 'true');
                subtitle.textContent = row.chip.disabledReason === 'no-jira-site'
                    ? 'Set your Jira site URL in settings'
                    : 'Set your Confluence site URL in settings';
            } else {
                subtitle.textContent = row.chip.url;
            }
        }

        el.appendChild(title);
        if (subtitle.textContent) { el.appendChild(subtitle); }

        el.addEventListener('click', (e: MouseEvent) => {
            opts.onActivate(row, index, { shift: e.shiftKey, ctrlOrMeta: e.ctrlKey || e.metaKey });
        });

        rowEls.push(el);
        fragment.appendChild(el);
    });

    return { fragment, rowEls };
}

/** Move the selection class to `index` across a built row list (for arrow-key nav). */
export function applyInlineRowSelection(
    rowEls: HTMLElement[],
    index: number,
    selectedClass: string,
): void {
    rowEls.forEach((el, i) => {
        const on = i === index;
        el.classList.toggle(selectedClass, on);
        if (on) { el.setAttribute('aria-selected', 'true'); }
        else { el.removeAttribute('aria-selected'); }
    });
}
