// onboarding.ts — First-run privacy explanation

import { browserAPI } from '../core/helpers';
import { Logger } from '../core/logger';

const logger = Logger.forComponent('Onboarding');

const ONBOARDING_KEY = 'onboarding_completed';

/**
 * Check if user has completed onboarding
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const result = await browserAPI.storage.local.get([ONBOARDING_KEY]);
    return result[ONBOARDING_KEY] === true;
  } catch (error) {
    logger.error('hasCompletedOnboarding', 'Failed to check onboarding status:', error);
    return false; // Default to showing onboarding on error
  }
}

/**
 * Mark onboarding as completed
 */
export async function setOnboardingCompleted(): Promise<void> {
  try {
    await browserAPI.storage.local.set({ [ONBOARDING_KEY]: true });
    logger.info('setOnboardingCompleted', 'Onboarding marked as completed');
  } catch (error) {
    logger.error('setOnboardingCompleted', 'Failed to save onboarding status:', error);
  }
}

// === PAGE LOGIC (runs when onboarding.html is loaded) ===
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    logger.info('DOMContentLoaded', 'Onboarding page loaded');
    
    const acceptBtn = document.getElementById('accept-btn');
    const faqLink = document.getElementById('faq-link');
    const settingsLink = document.getElementById('settings-link');
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        logger.info('acceptBtn.click', 'User accepted onboarding');
        await setOnboardingCompleted();
        
        // Close this tab and open popup
        try {
          const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await browserAPI.action.openPopup();
            // Wait a bit for popup to open, then close onboarding tab
            setTimeout(async () => {
              await browserAPI.tabs.remove(tab.id!);
            }, 300);
          }
        } catch (error) {
          logger.error('acceptBtn.click', 'Failed to close tab:', error);
          // Fallback: just close the tab
          window.close();
        }
      });
    }
    
    if (faqLink) {
      faqLink.addEventListener('click', (e) => {
        e.preventDefault();
        browserAPI.tabs.create({ url: 'https://github.com/dhruvinrsoni/smruti-cortex#faq' });
      });
    }
    
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        // Open popup and show settings (we'll implement settings modal later)
        browserAPI.action.openPopup();
      });
    }
  });
}
