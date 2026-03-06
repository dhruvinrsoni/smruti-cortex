# Chrome Web Store Submission Guide

> One-time setup reference. Copy-paste fields below do not change between versions.

---

## Pre-Submission Checklist

- [ ] Build production package: `npm run package`
- [ ] Test in a clean Chrome profile (incognito or fresh profile)
- [ ] Verify all features work: search, AI badges, keyboard shortcuts
- [ ] Privacy policy URL is live: `https://dhruvinrsoni.github.io/smruti-cortex/privacy.html`
- [ ] Screenshots ready (see `CHROME_WEB_STORE.md` for the list)

---

## Step 1: Upload Package

1. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devcenter/dashboard)
2. Open the SmrutiCortex listing → click **Edit** or **Upload new version**
3. Upload the zip from `release/` (built by `npm run package`)

---

## Step 2: Permissions Justification

Copy and paste this into the "Permissions justification" field:

```
PERMISSIONS JUSTIFICATION:

Required Permissions (Core Features):
• history: Read browser history for indexing and search
• bookmarks: Read bookmarks for unified search alongside history
• storage: Store settings and search index locally on device
• tabs: Query active tab and send messages to content scripts for the inline search overlay
• alarms: Keep service worker alive and schedule background indexing updates

Optional Host Permissions:
• <all_urls>: OPTIONAL — for enhanced metadata extraction only. NOT requested on install. Users must explicitly enable "Enhanced Metadata" in Settings to grant this. The extension works fully without it. OFF by default. Requires explicit user consent.

Privacy & Security:
All data processing happens locally in IndexedDB on the user's device. No data is transmitted to external servers. All AI features (keyword expansion, semantic search) connect exclusively to Ollama — an open-source AI application the user installs and runs locally on their own device (default: http://localhost:11434). No internet connection is made for AI. No analytics. No tracking. Open source: https://github.com/dhruvinrsoni/smruti-cortex
```

---

## Step 3: Single Purpose Justification

If Chrome asks for single purpose justification, paste this:

```
SINGLE PURPOSE:

SmrutiCortex has ONE purpose: Search your browser history instantly.

Core Functionality:
1. Index browser history in local IndexedDB
2. Search indexed history via keyboard shortcut (Ctrl+Shift+S) or extension popup
3. Display results with smart ranking (recency, frequency, exact match)
4. Open results in tabs

All features serve this single purpose:
• Bookmark search — extends search to bookmarks (same search interface)
• Inline overlay — alternative UI for the same search functionality
• Metadata extraction (optional) — improves search relevance by indexing page keywords locally
• AI search (optional) — enhances queries with synonym expansion via local Ollama; never cloud

Everything serves ONE goal: Find pages in your history faster.
```

---

## Step 4: Privacy Policy URL

```
https://dhruvinrsoni.github.io/smruti-cortex/privacy.html
```

Fallback (if Pages is down):
```
https://github.com/dhruvinrsoni/smruti-cortex/blob/main/CHROME_WEB_STORE.md#-hardcore-backup-full-privacy-policy
```

---

## Step 5: Screenshots

Use screenshots from `docs/screenshots/`. Recommended order (most impressive first):

1. AI Search in action — green keyword highlights + semantic synonym results
2. Popup search with 'git smruti' keywords
3. Quick search overlay in action
4. Settings — AI Tab (Ollama config, semantic search)
5. Settings — General Tab (35+ settings)

Size: 1280x800px or 640x400px.

---

## Step 6: Submit

1. Fill all fields
2. Verify privacy policy URL is accessible
3. Click **Submit for review**
4. Review time: 1–3 days (updates) / 3–7 days (new submissions)

---

## Key Facts (for any Chrome reviewer questions)

| Question | Answer |
|----------|--------|
| Broad host permissions? | `<all_urls>` is optional — not granted on install |
| AI connects to internet? | No — connects only to local Ollama on user's device (`localhost`) |
| Analytics/tracking? | None |
| Data leaves the device? | Only domain names for favicons (user-configurable, off by default) |
| Open source? | Yes — https://github.com/dhruvinrsoni/smruti-cortex |

---

**Store listing:** [Chrome Web Store](https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi)
