// helpers.ts — Browser abstraction layer for Chrome, Firefox, Edge, Safari

declare const browser: typeof chrome | undefined;

/**
 * Supported browser types
 */
export type BrowserType = 'chrome' | 'firefox' | 'edge' | 'safari' | 'opera' | 'brave' | 'unknown';

/**
 * Detect the current browser
 */
export function detectBrowser(): BrowserType {
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Order matters - check more specific browsers first
    if (userAgent.includes('brave')) {return 'brave';}
    if (userAgent.includes('edg/') || userAgent.includes('edge/')) {return 'edge';}
    if (userAgent.includes('opr/') || userAgent.includes('opera')) {return 'opera';}
    if (userAgent.includes('firefox')) {return 'firefox';}
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {return 'safari';}
    if (userAgent.includes('chrome')) {return 'chrome';}
    
    return 'unknown';
}

/**
 * Check if running in Firefox (uses different APIs in some cases)
 */
export function isFirefox(): boolean {
    return typeof browser !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');
}

/**
 * Check if running in Chromium-based browser (Chrome, Edge, Brave, Opera)
 */
export function isChromium(): boolean {
    return typeof chrome !== 'undefined' && !isFirefox();
}

export const browserAPI = (() => {
    if (typeof chrome !== 'undefined') {
        // MV3 Chrome, Edge, Brave, Opera
        return chrome;
    }
    if (typeof browser !== 'undefined') {
        // Firefox, Safari (WebExtension polyfill)
        return browser;
    }
    throw new Error('No supported browser API found.');
})();

/**
 * Get browser compatibility info
 */
export function getBrowserCompatibility(): { 
    browser: BrowserType; 
    supportsServiceWorker: boolean;
    supportsIndexedDB: boolean;
    supportsOmnibox: boolean;
    manifestVersion: number;
} {
    const browserType = detectBrowser();
    
    return {
        browser: browserType,
        supportsServiceWorker: 'serviceWorker' in navigator,
        supportsIndexedDB: 'indexedDB' in window,
        supportsOmnibox: typeof chrome !== 'undefined' && !!chrome.omnibox,
        manifestVersion: chrome?.runtime?.getManifest?.()?.manifest_version || 3,
    };
}

// Promisified wrappers for async APIs
// eslint-disable-next-line @typescript-eslint/ban-types
export function promisify<T>(apiCall: Function, ...args: any[]): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
        try {
            apiCall(...args, (result: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                const err = browserAPI.runtime.lastError;
                if (err) {reject(err);}
                else {resolve(result);}
            });
        } catch (e) {
            reject(e);
        }
    });
}