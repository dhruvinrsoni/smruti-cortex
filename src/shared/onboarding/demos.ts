// demos.ts — Silo D: small looping demos embedded on the welcome page.
//
// Pure DOM builders (no settings, no chrome) so they're trivially testable; the
// welcome page gates them on onboardingDemosEnabled. Animation is CSS-driven
// (keyframes live in welcome.css) and respects prefers-reduced-motion.

export interface DemoDefinition {
  id: string;
  title: string;
  /** Text shown "in the search box" with a blinking caret. */
  typed: string;
  /** One-line plain-language explanation of the action. */
  caption: string;
}

export const DEMO_DEFINITIONS: DemoDefinition[] = [
  { id: 'overlay', title: 'Search instantly', typed: 'react hooks', caption: 'Press Ctrl+Shift+S, type, hit Enter.' },
  { id: 'commands', title: 'Run a command', typed: '/ dark mode', caption: 'Type / to flip settings and run quick actions.' },
  { id: 'websearch', title: 'Search the web', typed: '?? g typescript enums', caption: 'Type ?? then your query — g for Google, gh for GitHub…' },
];

/** Build one demo card. Pure — returns a detached element. */
export function buildDemoElement(def: DemoDefinition): HTMLElement {
  const card = document.createElement('div');
  card.className = 'w-demo';
  card.dataset.demoId = def.id;

  const title = document.createElement('p');
  title.className = 'w-demo__title';
  title.textContent = def.title;

  const stage = document.createElement('div');
  stage.className = 'w-demo__stage';
  const typed = document.createElement('span');
  typed.textContent = def.typed;
  const caret = document.createElement('span');
  caret.className = 'w-demo__caret';
  caret.textContent = '▋';
  stage.append(typed, caret);

  const caption = document.createElement('p');
  caption.className = 'w-demo__caption';
  caption.textContent = def.caption;

  card.append(title, stage, caption);
  return card;
}

/**
 * Mount the demo grid into `container`. Idempotent (replaces any prior grid).
 *
 * @param opts.enabled - when false, tears the grid down and returns false (the
 *   onboardingDemosEnabled gate is applied by the caller).
 * @returns true if demos were mounted.
 */
export function mountDemos(
  container: HTMLElement | null,
  opts: { enabled?: boolean; defs?: DemoDefinition[] } = {},
): boolean {
  if (!container) { return false; }
  container.querySelector('.w-demos')?.remove(); // idempotent re-mount / teardown
  if (opts.enabled === false) { return false; }

  const grid = document.createElement('div');
  grid.className = 'w-demos';
  for (const def of opts.defs ?? DEMO_DEFINITIONS) {
    grid.appendChild(buildDemoElement(def));
  }
  container.appendChild(grid);
  return true;
}
