// milestones.ts — tracks a new user's first key actions for the onboarding checklist
// (Silo A). Pure state queries + thin chrome.storage.local I/O (mirrors
// recent-searches.ts). No DOM — safe to import from popup AND quick-search.

export type MilestoneId =
  | 'firstSearch'
  | 'firstResultOpen'
  | 'firstSlashCommand'
  | 'firstWebSearch'
  | 'firstOverlayOpen';

export interface ChecklistStep {
  id: MilestoneId;
  label: string;
  hint: string;
}

/** The checklist, in the order a new user naturally discovers each capability. */
export const CHECKLIST_STEPS: ChecklistStep[] = [
  { id: 'firstSearch', label: 'Run your first search', hint: 'Type anything to search your history.' },
  { id: 'firstResultOpen', label: 'Open a result', hint: 'Press Enter or click a result.' },
  { id: 'firstSlashCommand', label: 'Try a / command', hint: 'Type / to flip settings and run quick actions.' },
  { id: 'firstWebSearch', label: 'Search the web with ??', hint: 'Type ?? then your query.' },
  { id: 'firstOverlayOpen', label: 'Open the quick-search overlay', hint: 'Press Ctrl+Shift+S on any page.' },
];

export type MilestoneState = Partial<Record<MilestoneId, boolean>>;

const STORAGE_KEY = 'onboardingMilestones';

// ── Pure state queries (unit-tested directly) ──────────────────────────────

export function isComplete(state: MilestoneState, id: MilestoneId): boolean {
  return state[id] === true;
}

export function completedCount(state: MilestoneState): number {
  return CHECKLIST_STEPS.reduce((n, step) => (state[step.id] ? n + 1 : n), 0);
}

export function allComplete(state: MilestoneState): boolean {
  return CHECKLIST_STEPS.every((step) => state[step.id] === true);
}

/** Pure: returns a NEW state with `id` marked complete (no mutation). */
export function withMilestone(state: MilestoneState, id: MilestoneId): MilestoneState {
  if (state[id]) { return state; }
  return { ...state, [id]: true };
}

// ── Thin chrome.storage.local I/O ──────────────────────────────────────────

export async function getMilestones(): Promise<MilestoneState> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = result[STORAGE_KEY];
    if (state && typeof state === 'object') { return state as MilestoneState; }
    return {};
  } catch {
    return {};
  }
}

/** Mark a milestone complete. Idempotent and fire-and-forget safe. */
export async function markMilestone(id: MilestoneId): Promise<void> {
  try {
    const state = await getMilestones();
    if (state[id]) { return; }
    await chrome.storage.local.set({ [STORAGE_KEY]: withMilestone(state, id) });
  } catch {
    // Silently fail — onboarding progress is non-critical.
  }
}

export async function resetMilestones(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Silently fail.
  }
}
