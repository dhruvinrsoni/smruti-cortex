import { describe, it, expect } from 'vitest';
import { mountDemos, buildDemoElement, DEMO_DEFINITIONS } from '../demos';

describe('onboarding demos (Silo D)', () => {
  it('buildDemoElement renders title, typed text, caret and caption', () => {
    const el = buildDemoElement({ id: 'x', title: 'Title', typed: 'hello', caption: 'Cap' });
    expect(el.classList.contains('w-demo')).toBe(true);
    expect(el.dataset.demoId).toBe('x');
    expect(el.querySelector('.w-demo__title')?.textContent).toBe('Title');
    expect(el.querySelector('.w-demo__stage')?.textContent).toContain('hello');
    expect(el.querySelector('.w-demo__caption')?.textContent).toBe('Cap');
    expect(el.querySelector('.w-demo__caret')).not.toBeNull();
  });

  it('mountDemos injects one card per definition by default', () => {
    const container = document.createElement('div');
    expect(mountDemos(container)).toBe(true);
    expect(container.querySelectorAll('.w-demo').length).toBe(DEMO_DEFINITIONS.length);
  });

  it('mountDemos renders custom definitions when provided', () => {
    const container = document.createElement('div');
    mountDemos(container, { defs: [{ id: 'only', title: 'T', typed: 'q', caption: 'c' }] });
    expect(container.querySelectorAll('.w-demo').length).toBe(1);
  });

  it('is a no-op and tears down the grid when enabled is false', () => {
    const container = document.createElement('div');
    mountDemos(container);
    expect(mountDemos(container, { enabled: false })).toBe(false);
    expect(container.querySelector('.w-demos')).toBeNull();
  });

  it('is idempotent — re-mounting does not duplicate the grid', () => {
    const container = document.createElement('div');
    mountDemos(container);
    mountDemos(container);
    expect(container.querySelectorAll('.w-demos').length).toBe(1);
  });

  it('returns false for a null container', () => {
    expect(mountDemos(null)).toBe(false);
  });
});
