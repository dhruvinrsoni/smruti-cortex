/**
 * tour.ts — In-extension feature tour with spotlight UX.
 * Highlights one element at a time with a dimmed backdrop and tooltip.
 * Works in both popup (normal DOM) and quick-search (Shadow DOM).
 */

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: 'top' | 'bottom';
}

export const POPUP_TOUR_STEPS: TourStep[] = [
  {
    target: '#search-input',
    title: 'Search',
    description: 'Type anything — title, URL, or keywords. Results appear instantly as you type.',
    position: 'bottom',
  },
  {
    target: '#sort-by',
    title: 'Sort Results',
    description: 'Switch between Best Match, Most Recent, Most Visited, or Alphabetical sorting.',
    position: 'bottom',
  },
  {
    target: '#ai-status-bar',
    title: 'AI Status',
    description: 'When Ollama AI is enabled in Settings, a status bar appears here showing search sources: Keyword [LEXICAL], AI Cache [ENGRAM], or AI Live [NEURAL].',
    position: 'bottom',
  },
  {
    target: '#settings-button',
    title: 'Settings',
    description: 'Theme, search options, AI config, privacy controls, and more. Open Settings → "Feature Tour & Help" for the full online guide.',
    position: 'bottom',
  },
  {
    target: '#search-input',
    title: 'Command Palette',
    description: 'Type / for commands, > for admin, @ to switch tabs, # to search bookmarks, ?? to search the web. Your keyboard is the remote control for the entire browser.',
    position: 'bottom',
  },
  {
    target: '.footer',
    title: 'Keyboard Shortcuts',
    description: 'Enter opens in new tab. Ctrl+Shift+S opens quick-search overlay. Type "sc " in the address bar for omnibox access.',
    position: 'top',
  },
];

const TOUR_STORAGE_KEY = 'tourCompleted';

export async function isTourCompleted(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(TOUR_STORAGE_KEY);
    return result[TOUR_STORAGE_KEY] === true;
  } catch {
    return true;
  }
}

export async function markTourCompleted(): Promise<void> {
  try {
    await chrome.storage.local.set({ [TOUR_STORAGE_KEY]: true });
  } catch { /* non-critical */ }
}

/**
 * Run the tour in a given root element (document or ShadowRoot).
 * Resolves when the tour finishes or is skipped.
 */
export function runTour(
  steps: TourStep[],
  root: Document | ShadowRoot,
  resolveTarget?: (selector: string) => Element | null,
): Promise<void> {
  return new Promise((resolve) => {
    if (steps.length === 0) { resolve(); return; }

    let currentStep = 0;

    // Create backdrop + tooltip container
    const backdrop = document.createElement('div');
    backdrop.className = 'tour-backdrop';
    backdrop.setAttribute('style', `
      position: fixed; inset: 0; z-index: 99998;
      background: rgba(0,0,0,0.55);
      transition: opacity 0.2s;
    `);

    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.setAttribute('style', `
      position: fixed; z-index: 99999;
      background: #1e293b; color: #f1f5f9;
      border-radius: 10px; padding: 16px 20px;
      max-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 13px; line-height: 1.5;
    `);

    const highlight = document.createElement('div');
    highlight.className = 'tour-highlight';
    highlight.setAttribute('style', `
      position: fixed; z-index: 99998;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
      pointer-events: none;
      transition: all 0.3s ease;
    `);

    const getTarget = (selector: string): Element | null => {
      if (resolveTarget) {return resolveTarget(selector);}
      return root.querySelector(selector);
    };

    function showStep(idx: number) {
      const step = steps[idx];
      const el = getTarget(step.target);

      if (!el) {
        // Target not found — skip step
        if (idx < steps.length - 1) { showStep(idx + 1); }
        else { cleanup(); }
        return;
      }

      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      const pad = 6;

      if (isVisible) {
        highlight.style.top = `${rect.top - pad}px`;
        highlight.style.left = `${rect.left - pad}px`;
        highlight.style.width = `${rect.width + pad * 2}px`;
        highlight.style.height = `${rect.height + pad * 2}px`;
        highlight.style.display = 'block';
      } else {
        // Element exists but is hidden — hide spotlight, show tooltip centered
        highlight.style.display = 'none';
      }

      // Build tooltip content
      const stepNum = `${idx + 1}/${steps.length}`;
      tooltip.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:14px;">${step.title}</strong>
          <span style="font-size:11px; opacity:0.6;">${stepNum}</span>
        </div>
        <div style="margin-bottom:14px; opacity:0.9;">${step.description}</div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="tour-btn tour-skip" style="
            background:none; border:1px solid rgba(255,255,255,0.2); color:#94a3b8;
            padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;
          ">Skip</button>
          ${idx > 0 ? `<button class="tour-btn tour-prev" style="
            background:none; border:1px solid rgba(255,255,255,0.3); color:#e2e8f0;
            padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;
          ">Back</button>` : ''}
          <button class="tour-btn tour-next" style="
            background:#3b82f6; border:none; color:white;
            padding:5px 16px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500;
          ">${idx === steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      `;

      // Position tooltip
      const tooltipHeight = 160;
      if (!isVisible) {
        // Center tooltip when target is hidden
        tooltip.style.top = `${Math.max(40, (window.innerHeight - tooltipHeight) / 2)}px`;
        tooltip.style.left = `${Math.max(8, (window.innerWidth - 320) / 2)}px`;
      } else if (step.position === 'bottom' || rect.top < tooltipHeight + 20) {
        tooltip.style.top = `${rect.bottom + pad + 10}px`;
        tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
      } else {
        tooltip.style.top = `${rect.top - pad - tooltipHeight}px`;
        tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
      }

      // Attach click handlers
      const skipBtn = tooltip.querySelector('.tour-skip');
      const prevBtn = tooltip.querySelector('.tour-prev');
      const nextBtn = tooltip.querySelector('.tour-next');

      skipBtn?.addEventListener('click', cleanup);
      prevBtn?.addEventListener('click', () => { currentStep--; showStep(currentStep); });
      nextBtn?.addEventListener('click', () => {
        if (currentStep < steps.length - 1) { currentStep++; showStep(currentStep); }
        else { cleanup(); }
      });
    }

    function cleanup() {
      backdrop.remove();
      tooltip.remove();
      highlight.remove();
      markTourCompleted().catch(() => {});
      resolve();
    }

    // Handle Escape to skip
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        document.removeEventListener('keydown', onKeydown, true);
      }
    }
    document.addEventListener('keydown', onKeydown, true);

    // Append to body (or shadow root)
    const appendTarget = root === document ? document.body : (root as ShadowRoot);
    appendTarget.appendChild(backdrop);
    appendTarget.appendChild(highlight);
    appendTarget.appendChild(tooltip);

    showStep(0);
  });
}
