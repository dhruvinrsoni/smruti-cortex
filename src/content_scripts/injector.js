// injector.js
// Helper that background can call via chrome.scripting.executeScript to inject the metadata extractor code.
// This is a small wrapper — the real extractor is compiled & stored in extension assets, but this shows approach.

(function () {
  // Avoid injecting twice
  if (window.__smriti_cortex_injected) return;
  window.__smriti_cortex_injected = true;

  try {
    (function run() {
      const url = location.href;
      const title = document.title || "";
      const canonicalEl = document.querySelector('link[rel="canonical"]');
      const canonical = canonicalEl ? canonicalEl.href : null;
      function getMeta(n) {
        const el = document.querySelector(`meta[name="${n}"]`);
        return el ? el.content : null;
      }
      function getMetaProp(p) {
        const el = document.querySelector(`meta[property="${p}"]`);
        return el ? el.content : null;
      }

      const metaDescription = getMeta("description") || getMetaProp("og:description") || "";
      const metaKeywordsRaw = getMeta("keywords") || "";
      const metaKeywords = metaKeywordsRaw ? metaKeywordsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
      const ogTitle = getMetaProp("og:title") || "";

      const payload = {
        url,
        title: ogTitle || title,
        canonical,
        metaDescription,
        metaKeywords
      };

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ type: "METADATA_CAPTURE", payload });
        } catch (e) {}
      } else if (typeof browser !== "undefined" && browser.runtime) {
        try {
          browser.runtime.sendMessage({ type: "METADATA_CAPTURE", payload });
        } catch (e) {}
      }
    })();
  } catch (err) {}
})();