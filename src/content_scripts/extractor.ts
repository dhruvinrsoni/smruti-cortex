// extractor.ts
// Runs in page context as a content script. Extracts metadata and posts it to background.

declare const browser: any;

import { browserAPI } from "../core/helpers"; // if you compile this into bundle; otherwise use chrome/browser direct

// Only run in top-level frames
if ((window as any).top !== window) {
  // skip if inside iframe
  // eslint-disable-next-line no-undef
  // console.log('[SmritiCortex] extractor: iframe - skipping');
} else {
  (function runExtractor() {
    try {
      const url = location.href;
      const title = document.title || "";
      const canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      const canonical = canonicalEl?.href || null;

      function getMeta(name: string) {
        const el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
        return el?.content ?? null;
      }

      function getMetaProperty(prop: string) {
        const el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
        return el?.content ?? null;
      }

      const metaDescription = getMeta("description") || getMetaProperty("og:description") || "";
      const metaKeywordsRaw = getMeta("keywords") || "";
      const metaKeywords = metaKeywordsRaw ? metaKeywordsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

      const ogTitle = getMetaProperty("og:title") || "";
      const ogImage = getMetaProperty("og:image") || "";

      // Build meta payload
      const payload = {
        url,
        title: ogTitle || title,
        canonical,
        metaDescription,
        metaKeywords,
        ogImage
      };

      // send to background
      // Use browser runtime if available; otherwise chrome
      const runtime = (typeof browser !== "undefined") ? browser.runtime : (typeof chrome !== "undefined" ? chrome.runtime : null);

      if (runtime && runtime.sendMessage) {
        runtime.sendMessage({ type: "METADATA_CAPTURE", payload }, (resp) => {
          // optional callback; ignore errors
        });
      }
    } catch (err) {
      // swallow errors inside page
    }
  })();
}