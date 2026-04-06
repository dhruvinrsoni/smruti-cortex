/**
 * Unit tests for toolbar-toggles.ts
 */
import { describe, it, expect } from 'vitest';
import {
  TOOLBAR_TOGGLE_DEFS,
  DEFAULT_TOOLBAR_TOGGLES,
  getToggleDef,
  getCycleState,
  getNextCycleValue,
  type ToolbarToggleDef,
} from '../toolbar-toggles';

describe('toolbar-toggles', () => {
  it('TOOLBAR_TOGGLE_DEFS has unique keys and expected shape', () => {
    const keys = TOOLBAR_TOGGLE_DEFS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of TOOLBAR_TOGGLE_DEFS) {
      expect(def).toMatchObject({
        key: expect.any(String),
        type: expect.stringMatching(/boolean|cycle/),
        icon: expect.any(String),
        label: expect.any(String),
        tooltipOn: expect.any(String),
        tooltipOff: expect.any(String),
      });
      if (def.type === 'cycle') {
        expect(def.cycleValues?.length).toBeGreaterThan(0);
      }
    }
  });

  it('DEFAULT_TOOLBAR_TOGGLES references real keys', () => {
    const keySet = new Set(TOOLBAR_TOGGLE_DEFS.map(d => String(d.key)));
    for (const k of DEFAULT_TOOLBAR_TOGGLES) {
      expect(keySet.has(k)).toBe(true);
    }
  });

  it('getToggleDef returns definition or undefined', () => {
    expect(getToggleDef('ollamaEnabled')).toBeDefined();
    expect(getToggleDef('ollamaEnabled')?.label).toBe('AI');
    expect(getToggleDef('nonexistent')).toBeUndefined();
  });

  it('getCycleState returns match or first value for cycle toggles', () => {
    const display = TOOLBAR_TOGGLE_DEFS.find(d => d.key === 'displayMode') as ToolbarToggleDef;
    expect(getCycleState(display, 'cards')?.value).toBe('cards');
    expect(getCycleState(display, 'unknown')?.value).toBe('list');
    const bool = TOOLBAR_TOGGLE_DEFS.find(d => d.key === 'ollamaEnabled') as ToolbarToggleDef;
    expect(getCycleState(bool, true)).toBeUndefined();
  });

  it('getNextCycleValue rotates through cycle values', () => {
    const display = TOOLBAR_TOGGLE_DEFS.find(d => d.key === 'displayMode') as ToolbarToggleDef;
    const cycles = display.cycleValues;
    expect(cycles?.length).toBeGreaterThanOrEqual(2);
    if (!cycles || cycles.length < 2) { throw new Error('displayMode cycleValues missing'); }
    const first = cycles[0].value;
    const second = cycles[1].value;
    expect(getNextCycleValue(display, first)).toBe(second);
    expect(getNextCycleValue(display, second)).toBe(first);
  });

  it('getNextCycleValue returns stringified current when no cycle values', () => {
    const fake: ToolbarToggleDef = {
      key: 'ollamaEnabled',
      type: 'boolean',
      icon: '',
      label: '',
      tooltipOn: '',
      tooltipOff: '',
    };
    expect(getNextCycleValue(fake, true)).toBe('true');
  });

  it('getNextCycleValue handles empty cycleValues array', () => {
    const fake: ToolbarToggleDef = {
      key: 'displayMode',
      type: 'cycle',
      icon: '',
      label: '',
      tooltipOn: '',
      tooltipOff: '',
      cycleValues: [],
    };
    expect(getNextCycleValue(fake, 'list')).toBe('list');
  });
});
