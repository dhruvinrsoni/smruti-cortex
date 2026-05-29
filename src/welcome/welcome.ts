// welcome.ts — esbuild entrypoint for the welcome / onboarding page.
//
// Thin imperative shell: reads settings, renders the (testable) content model from
// welcome-content.ts into the DOM, and wires the two CTAs. All copy lives in
// welcome-content.ts; all reference data lives in shared/onboarding/cheatsheet.ts.

import { Logger, errorMeta } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { getWelcomePageModel, type WelcomePageModel } from './welcome-content';
import type { CheatsheetSection } from '../shared/onboarding/cheatsheet';
import { mountDemos } from '../shared/onboarding/demos';

const log = Logger.forComponent('Welcome');

/** Storage flag read by popup.ts on open to replay the spotlight tour. */
const REPLAY_TOUR_KEY = 'replayTourOnNextOpen';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string; html?: never } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) { node.className = opts.className; }
  if (opts.text != null) { node.textContent = opts.text; }
  return node;
}

function renderCheatsheet(section: CheatsheetSection): HTMLElement {
  const card = el('section', { className: 'w-card' });
  card.appendChild(el('h2', { className: 'w-card__heading', text: section.title }));
  const sheet = el('div', { className: 'w-sheet' });
  for (const entry of section.entries) {
    const row = el('div', { className: entry.enabled === false ? 'w-row w-row--off' : 'w-row' });
    row.appendChild(el('span', { className: 'w-keys', text: entry.keys }));
    const label = el('span', { className: 'w-label', text: entry.label });
    if (entry.advanced) { label.appendChild(el('span', { className: 'w-badge', text: 'advanced' })); }
    if (entry.enabled === false) { label.appendChild(el('span', { className: 'w-badge', text: 'off' })); }
    row.appendChild(label);
    sheet.appendChild(row);
  }
  card.appendChild(sheet);
  return card;
}

function render(model: WelcomePageModel): void {
  const root = document.getElementById('welcome-root');
  if (!root) { return; }
  root.replaceChildren();

  // Hero
  const hero = el('header', { className: 'w-hero' });
  hero.appendChild(el('div', { className: 'w-hero__emoji', text: model.hero.emoji }));
  hero.appendChild(el('h1', { className: 'w-hero__title', text: model.hero.title }));
  hero.appendChild(el('p', { className: 'w-hero__tagline', text: model.hero.tagline }));
  hero.appendChild(el('p', { className: 'w-hero__blurb', text: model.hero.blurb }));

  // CTAs
  const cta = el('div', { className: 'w-cta' });
  const tryBtn = el('button', { className: 'w-btn w-btn--primary', text: 'Try it now' });
  tryBtn.id = 'w-try';
  const tourBtn = el('button', { className: 'w-btn', text: 'Replay the 30-second tour' });
  tourBtn.id = 'w-replay-tour';
  cta.append(tryBtn, tourBtn);
  const hint = el('p', { className: 'w-cta__hint' });
  hint.id = 'w-cta-hint';
  hero.append(cta, hint);
  root.appendChild(hero);

  // The one big tip
  const tip = el('section', { className: 'w-card w-bigtip' });
  tip.appendChild(el('h2', { className: 'w-card__heading', text: model.bigTip.heading }));
  tip.appendChild(el('div', { className: 'w-bigtip__keys', text: model.bigTip.keys }));
  tip.appendChild(el('p', { className: 'w-bigtip__text', text: model.bigTip.text }));
  root.appendChild(tip);

  // Three ways to open
  const ways = el('section', { className: 'w-card' });
  ways.appendChild(el('h2', { className: 'w-card__heading', text: model.openWays.heading }));
  const waysList = el('ol', { className: 'w-list' });
  for (const w of model.openWays.ways) { waysList.appendChild(el('li', { text: w })); }
  ways.appendChild(waysList);
  root.appendChild(ways);

  // Cheatsheet sections
  for (const section of model.cheatsheet) { root.appendChild(renderCheatsheet(section)); }

  // Demos mount point (Silo D) — heading now; the grid is mounted in main() when enabled.
  const demos = el('section', { className: 'w-card' });
  demos.id = 'w-demos-card';
  demos.hidden = true;
  demos.appendChild(el('h2', { className: 'w-card__heading', text: 'See it in action' }));
  root.appendChild(demos);

  // Privacy
  const privacy = el('section', { className: 'w-card w-privacy' });
  privacy.appendChild(el('h2', { className: 'w-card__heading', text: model.privacy.heading }));
  const privacyList = el('ul', { className: 'w-list' });
  for (const line of model.privacy.lines) { privacyList.appendChild(el('li', { text: line })); }
  privacy.appendChild(privacyList);
  root.appendChild(privacy);

  // Footer
  const footer = el('footer', { className: 'w-footer' });
  footer.appendChild(el('p', { text: model.footer.replayNote }));
  const links = el('div', { className: 'w-footer__links' });
  const guide = el('a', { text: model.footer.onlineGuideLabel });
  guide.href = model.footer.onlineGuideUrl; guide.target = '_blank'; guide.rel = 'noopener';
  const priv = el('a', { text: model.footer.privacyLabel });
  priv.href = model.footer.privacyUrl; priv.target = '_blank'; priv.rel = 'noopener';
  links.append(guide, priv);
  footer.appendChild(links);
  root.appendChild(footer);

  root.removeAttribute('aria-busy');
}

/** Open the toolbar popup if the browser allows it; otherwise show a plain hint. */
async function openPopupOrHint(fallback: string): Promise<void> {
  const hint = document.getElementById('w-cta-hint');
  try {
    const openPopup = (chrome.action as { openPopup?: () => Promise<void> } | undefined)?.openPopup;
    if (!openPopup) { throw new Error('openPopup unavailable'); }
    await openPopup.call(chrome.action);
  } catch {
    if (hint) { hint.textContent = fallback; }
  }
}

function setReplayTourFlag(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      chrome.storage.local.set({ [REPLAY_TOUR_KEY]: true }, () => resolve());
    } catch {
      resolve();
    }
  });
}

function wireCtas(): void {
  document.getElementById('w-try')?.addEventListener('click', () => {
    void openPopupOrHint('Click the SmrutiCortex icon in your toolbar, or press Ctrl+Shift+S on any page.');
  });
  document.getElementById('w-replay-tour')?.addEventListener('click', () => {
    void (async () => {
      await setReplayTourFlag();
      await openPopupOrHint('Open the popup (toolbar icon) to see the tour — it will start automatically.');
    })();
  });
}

async function main(): Promise<void> {
  let enabledModes: string[] | undefined;
  let demosEnabled = true;
  try {
    await SettingsManager.init();
    const modes = SettingsManager.getSetting('commandPaletteModes');
    if (Array.isArray(modes)) { enabledModes = modes; }
    demosEnabled =
      SettingsManager.getSetting('onboardingEnabled') !== false &&
      SettingsManager.getSetting('onboardingDemosEnabled') !== false;
  } catch (err) {
    log.warn('main', 'Could not load settings; showing all modes as enabled', errorMeta(err));
  }
  render(getWelcomePageModel(enabledModes));
  wireCtas();

  const demosCard = document.getElementById('w-demos-card');
  if (demosCard) {
    const mounted = mountDemos(demosCard, { enabled: demosEnabled });
    demosCard.hidden = !mounted;
  }
}

void main();
