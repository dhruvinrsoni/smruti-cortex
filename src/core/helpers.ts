// helpers.ts — Browser abstraction layer for Chrome, Firefox, Edge, Safari

declare const browser: any;

export const browserAPI = (() => {
    if (typeof chrome !== "undefined") {
        // MV3 Chrome, Edge, Brave, Opera
        return chrome;
    }
    if (typeof browser !== "undefined") {
        // Firefox, Safari (WebExtension polyfill)
        return browser;
    }
    throw new Error("No supported browser API found.");
})();

// Promisified wrappers for async APIs
export function promisify<T>(apiCall: Function, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
        try {
            apiCall(...args, (result: any) => {
                const err = browserAPI.runtime.lastError;
                if (err) reject(err);
                else resolve(result);
            });
        } catch (e) {
            reject(e);
        }
    });
}