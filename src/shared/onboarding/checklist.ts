// checklist.ts — Silo A: the learn-by-doing onboarding checklist card (popup only).
//
// Independently toggleable: initChecklist no-ops unless BOTH onboardingEnabled and
// onboardingChecklistEnabled are true. "Dismissed" is stored separately from
// milestone progress, so closing the card never loses progress. Remove this silo by
// deleting this file, its one initChecklist() call in popup.ts, the milestone marks,
// the #onboarding-checklist mount node, and the onboardingChecklistEnabled flag.

import { Logger, errorMeta } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import {
  CHECKLIST_STEPS,
  getMilestones,
  allComplete,
  completedCount,
  type MilestoneState,
} from './milestones';

const log = Logger.forComponent('OnboardingChecklist');
const DISMISS_KEY = 'onboardingChecklistDismissed';

function isChecklistEnabled(): boolean {
  return (
    SettingsManager.getSetting('onboardingEnabled') !== false &&
    SettingsManager.getSetting('onboardingChecklistEnabled') !== false
  );
}

async function isDismissed(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(DISMISS_KEY);
    return r[DISMISS_KEY] === true;
  } catch {
    return false;
  }
}

async function setDismissed(): Promise<void> {
  try {
    await chrome.storage.local.set({ [DISMISS_KEY]: true });
  } catch {
    // non-critical
  }
}

function render(container: HTMLElement, state: MilestoneState, onDismiss: () => void): void {
  container.replaceChildren();

  const card = document.createElement('div');
  card.className = 'onboarding-checklist';

  const head = document.createElement('div');
  head.className = 'onboarding-checklist__head';
  const title = document.createElement('span');
  title.className = 'onboarding-checklist__title';
  title.textContent = `Getting started (${completedCount(state)}/${CHECKLIST_STEPS.length})`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'onboarding-checklist__close';
  close.title = 'Dismiss';
  close.setAttribute('aria-label', 'Dismiss the getting-started checklist');
  close.textContent = '✕';
  close.addEventListener('click', onDismiss);
  head.append(title, close);
  card.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'onboarding-checklist__list';
  for (const step of CHECKLIST_STEPS) {
    const done = state[step.id] === true;
    const li = document.createElement('li');
    li.className = done ? 'onboarding-checklist__item is-done' : 'onboarding-checklist__item';
    const mark = document.createElement('span');
    mark.className = 'onboarding-checklist__mark';
    mark.textContent = done ? '✓' : '○';
    const label = document.createElement('span');
    label.className = 'onboarding-checklist__label';
    label.textContent = step.label;
    label.title = step.hint;
    li.append(mark, label);
    list.appendChild(li);
  }
  card.appendChild(list);
  container.appendChild(card);
}

/**
 * Render the checklist into `container` when appropriate. Safe no-op (and clears the
 * container) when the silo is off, the card was dismissed, or every step is done.
 *
 * @returns true if the checklist was rendered.
 */
export async function initChecklist(container: HTMLElement | null): Promise<boolean> {
  if (!container) { return false; }
  if (!isChecklistEnabled()) {
    container.replaceChildren();
    return false;
  }
  try {
    if (await isDismissed()) {
      container.replaceChildren();
      return false;
    }
    const state = await getMilestones();
    if (allComplete(state)) {
      container.replaceChildren();
      return false;
    }
    render(container, state, () => {
      void setDismissed();
      container.replaceChildren();
    });
    return true;
  } catch (err) {
    log.warn('initChecklist', 'Failed to render onboarding checklist', errorMeta(err));
    return false;
  }
}
