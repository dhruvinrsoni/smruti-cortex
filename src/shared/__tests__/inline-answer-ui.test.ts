// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  buildInlineAnswerBlock,
  appendAnswerToken,
  setAnswerState,
  showAnswerUnavailable,
  answerErrorMessage,
  buildInlineAnswerRows,
  applyInlineRowSelection,
  type InlineAnswerRow,
  type InlineAnswerClassNames,
} from '../inline-answer-ui';
import type { SearchResult } from '../search-ui-base';

const CN: InlineAnswerClassNames = {
  answerBlock: 'ans', answerLabel: 'ans-label', answerText: 'ans-text',
  row: 'row', rowSelected: 'sel', historyRow: 'hist', chipRow: 'chip',
  disabledRow: 'disabled', rowTitle: 'title', rowSubtitle: 'sub',
  highlight: 'hl', aiHighlight: 'hl-ai',
};

function historyResult(over: Partial<SearchResult> = {}): SearchResult {
  return { url: 'https://example.com/x', title: 'Example', visitCount: 1, lastVisit: 0, ...over };
}

describe('buildInlineAnswerBlock + streaming', () => {
  it('creates a non-focusable, aria-live block with a model label', () => {
    const block = buildInlineAnswerBlock({ classNames: CN, modelLabel: 'local · llama3.2:3b' });
    expect(block.root.className).toBe('ans');
    expect(block.root.getAttribute('aria-live')).toBe('polite');
    expect(block.root.tabIndex).toBe(-1);
    expect(block.root.querySelector('.ans-label')?.textContent).toContain('llama3.2:3b');
  });

  it('starts in the thinking state with a loader (default spinner)', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    expect(block.root.dataset.state).toBe('thinking');
    expect(block.root.dataset.loader).toBe('spinner');
    expect(block.loaderEl.querySelector('.ila-spin')).not.toBeNull();
    expect(block.loaderEl.querySelector('.ila-thinking')?.textContent).toBe('thinking…');
  });

  it('builds the right loader markup per style', () => {
    expect(buildInlineAnswerBlock({ classNames: CN, loaderStyle: 'dots' }).loaderEl.querySelectorAll('.ila-dot')).toHaveLength(3);
    expect(buildInlineAnswerBlock({ classNames: CN, loaderStyle: 'shimmer' }).loaderEl.querySelectorAll('.ila-bar')).toHaveLength(2);
    const caret = buildInlineAnswerBlock({ classNames: CN, loaderStyle: 'caret' });
    expect(caret.root.dataset.loader).toBe('caret');
    expect(caret.loaderEl.children).toHaveLength(0);
  });

  it('appends streamed tokens as text only, and the first token leaves thinking', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    appendAnswerToken(block, 'Hello');
    expect(block.root.dataset.state).toBe('streaming');
    appendAnswerToken(block, ' world');
    expect(block.textEl.textContent).toBe('Hello world');
  });

  it('does not parse tokens as HTML (CSP-safe streaming)', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    appendAnswerToken(block, '<img src=x onerror=alert(1)>');
    expect(block.textEl.querySelector('img')).toBeNull();
    expect(block.textEl.textContent).toContain('<img');
  });

  it('setAnswerState toggles data-state and hides on "hidden"', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    setAnswerState(block, 'fallback');
    expect(block.root.dataset.state).toBe('fallback');
    expect(block.root.style.display).toBe('');
    setAnswerState(block, 'hidden');
    expect(block.root.style.display).toBe('none');
  });
});

describe('showAnswerUnavailable', () => {
  it('renders a muted hint and switches to fallback state', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    appendAnswerToken(block, 'partial'); // simulate some prior text
    showAnswerUnavailable(block, { message: 'Local AI unavailable — is Ollama running?' });
    expect(block.root.dataset.state).toBe('fallback');
    expect(block.textEl.querySelector('.inline-answer-hint')?.textContent).toContain('unavailable');
    expect(block.textEl.querySelector('.inline-answer-hint-link')).toBeNull();
    expect(block.textEl.textContent).not.toContain('partial'); // cleared
  });

  it('renders a clickable action link that fires onClick', () => {
    const block = buildInlineAnswerBlock({ classNames: CN });
    const onClick = vi.fn();
    showAnswerUnavailable(block, { message: 'unavailable', action: { label: 'Open settings', onClick } });
    const link = block.textEl.querySelector('.inline-answer-hint-link') as HTMLButtonElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toBe('Open settings');
    link.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('answerErrorMessage', () => {
  it('only "unavailable" says Ollama is down; warming/timeout stay reassuring', () => {
    expect(answerErrorMessage('unavailable')).toMatch(/Ollama running/);
    expect(answerErrorMessage('model-missing')).toMatch(/installed/i);
    expect(answerErrorMessage('warming')).toMatch(/warming up/i);
    expect(answerErrorMessage('timeout')).toMatch(/warming up/i);
    expect(answerErrorMessage('circuit-open')).toMatch(/paused/);
    // a warming/slow model must NEVER be reported as "down"
    expect(answerErrorMessage('warming')).not.toMatch(/is Ollama running/i);
    expect(answerErrorMessage('empty')).toBeNull();
    expect(answerErrorMessage('busy')).toBeNull();
    expect(answerErrorMessage('aborted')).toBeNull();
  });
});

describe('buildInlineAnswerRows', () => {
  const rows: InlineAnswerRow[] = [
    { kind: 'history', result: historyResult({ title: 'Docker networking', url: 'https://docs.docker.com/net' }) },
    { kind: 'chip', chip: { key: 'google', displayName: 'Google', url: 'https://g/q=x', mode: 'static-engine' } },
    { kind: 'chip', chip: { key: 'jira', displayName: 'Jira', url: '', mode: 'jira-jql', disabled: true, disabledReason: 'no-jira-site' } },
  ];

  it('builds one element per row, index-aligned, with the selected class', () => {
    const { fragment, rowEls } = buildInlineAnswerRows(rows, { classNames: CN, selectedIndex: 1, onActivate: () => {} });
    expect(rowEls).toHaveLength(3);
    expect(fragment.childNodes).toHaveLength(3);
    expect(rowEls[1].classList.contains('sel')).toBe(true);
    expect(rowEls[0].classList.contains('sel')).toBe(false);
    expect(rowEls[0].dataset.index).toBe('0');
  });

  it('renders history titles as text (no HTML injection)', () => {
    const evil: InlineAnswerRow[] = [{ kind: 'history', result: historyResult({ title: '<b>x</b>' }) }];
    const { rowEls } = buildInlineAnswerRows(evil, { classNames: CN, selectedIndex: -1, onActivate: () => {} });
    expect(rowEls[0].querySelector('b')).toBeNull();
    expect(rowEls[0].textContent).toContain('<b>x</b>');
  });

  it('marks disabled chips and shows a settings hint', () => {
    const { rowEls } = buildInlineAnswerRows(rows, { classNames: CN, selectedIndex: -1, onActivate: () => {} });
    expect(rowEls[2].classList.contains('disabled')).toBe(true);
    expect(rowEls[2].getAttribute('aria-disabled')).toBe('true');
    expect(rowEls[2].textContent).toContain('Jira site URL');
  });

  it('invokes onActivate with the row and modifier keys on click', () => {
    const onActivate = vi.fn();
    const { rowEls } = buildInlineAnswerRows(rows, { classNames: CN, selectedIndex: 0, onActivate });
    rowEls[1].dispatchEvent(new MouseEvent('click', { shiftKey: true }));
    expect(onActivate).toHaveBeenCalledWith(rows[1], 1, { shift: true, ctrlOrMeta: false });
  });

  it('chip rows are labelled "Search <Engine> ›"', () => {
    const { rowEls } = buildInlineAnswerRows(rows, { classNames: CN, selectedIndex: -1, onActivate: () => {} });
    expect(rowEls[1].querySelector('.title')?.textContent).toBe('Search Google ›');
  });
});

describe('applyInlineRowSelection', () => {
  it('moves the selected class and aria-selected to the new index', () => {
    const rows: InlineAnswerRow[] = [
      { kind: 'chip', chip: { key: 'google', displayName: 'Google', url: 'u', mode: 'static-engine' } },
      { kind: 'chip', chip: { key: 'github', displayName: 'GitHub', url: 'u', mode: 'static-engine' } },
    ];
    const { rowEls } = buildInlineAnswerRows(rows, { classNames: CN, selectedIndex: 0, onActivate: () => {} });
    applyInlineRowSelection(rowEls, 1, 'sel');
    expect(rowEls[0].classList.contains('sel')).toBe(false);
    expect(rowEls[0].getAttribute('aria-selected')).toBeNull();
    expect(rowEls[1].classList.contains('sel')).toBe(true);
    expect(rowEls[1].getAttribute('aria-selected')).toBe('true');
  });
});
