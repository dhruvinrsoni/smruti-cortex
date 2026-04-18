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

// Deeply nested no-op proxy — safe for any property access or call chain.
// Used as a fallback in test/non-extension environments so that
// browserAPI.runtime.onConnect.addListener(...) never throws.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNoOpProxy(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(function() {} as any, {
        get: () => makeNoOpProxy(),
        apply: () => undefined,
    });
}

export const browserAPI = (() => {
    // Always use a dynamic proxy that reads from `globalThis.chrome` or
    // `globalThis.browser` on property access. This avoids capturing a
    // snapshot of the `chrome` object at module-eval time which makes
    // tests brittle when they `vi.stubGlobal('chrome', ...)` during a
    // single test run. The proxy forwards functions with the correct
    // receiver so calls like `chrome.tabs.query()` continue to work.
    const handler = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(_target: any, prop: string) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const real = (globalThis as any).chrome ?? (globalThis as any).browser;
            if (real && prop in real) {
                const val = real[prop];
                if (typeof val === 'function') {
                    return val.bind(real);
                }
                return val;
            }
            // Return a deep no-op proxy so nested access like
            // .runtime.onConnect.addListener never throws.
            return makeNoOpProxy();
        }
    };
    return new Proxy({}, handler) as typeof chrome;
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
export function promisify<T>(apiCall: (...args: any[]) => void, ...args: any[]): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
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