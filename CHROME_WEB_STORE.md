# Chrome & Edge Web Store Submission Guide

Complete checklist and content for publishing SmrutiCortex to Chrome and Edge extension stores.

> **Note:** Chrome and Edge use the same Manifest V3 format. One package works for both stores!

---

## 🔗 Store Links

- **Chrome Web Store (canonical):** https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi
- **Edge Add-ons:** use the same package; if you have a dedicated Edge listing URL replace the link above with the Edge URL here.


---

## 📋 Pre-Submission Checklist

- [ ] Build production zip: `npm run package` → `release/smruti-cortex-vX.Y.Z.zip`
- [ ] Test in clean Chrome profile
- [ ] Verify all features work (AI search, semantic, keyword telemetry badges, command palette, advanced browser commands)
- [ ] Check privacy compliance
- [ ] Prepare store assets (screenshots from `docs/screenshots/`)
- [ ] Review store listing content below

---

## 🎯 Store Listing Content

### Extension Name
**SmrutiCortex**

### Short Description (132 chars max)
Never lose a page again. Instant history search with smart ranking. Optional local AI. 100% private. Zero cloud.

### Detailed Description (16,000 chars max)

**SmrutiCortex** — Your private, lightning-fast browser memory search engine.

You read an article last week. You remember it was useful. You can't find it. SmrutiCortex fixes this.

SmrutiCortex indexes everything you visit and retrieves any page in milliseconds — by title, URL, or keywords. Think "Everything" search for Windows, but for your browser.

**HOW IS THIS DIFFERENT FROM Ctrl+H?**

Chrome's built-in history (Ctrl+H) reloads a whole page, only searches by title/URL, and shows results chronologically. SmrutiCortex is:
• **Instant** — results appear as you type, no page reload
• **Multi-signal** — searches across title, URL, metadata, and bookmarks simultaneously
• **Smart-ranked** — results scored by relevance (recency, frequency, match quality), not just date
• **Optional AI** — local synonym expansion and semantic search via Ollama

**KEY FEATURES:**

⚡ **Ultra-Fast Search** — Results appear as you type (< 50ms)
🎯 **Vivek Search Ranking** — Graduated multi-parameter scoring (exact > prefix > substring)
🎯 **Strict Matching** — Only shows results containing your search terms (configurable)
🎲 **Diverse Results** — Filters duplicate URLs automatically for variety (configurable)
⭐ **Bookmark Search** — Search bookmarks alongside history with ★ indicator
🔍 **Query Expansion** — Find related terms with synonym matching
🌙 **Dark Mode** — Auto, light, or dark theme to match your system
📥 **Export / Import** — Transfer your index between browsers or machines
🔐 **100% Private** — All data stays local in IndexedDB
🛡️ **Self-Healing** — Auto-recovery from errors with retry logic
🔧 **Privacy Controls** — Favicon toggle, sensitive-site blacklist
💾 **Data Management** — Storage quota monitoring, one-click rebuild
⌨️ **Keyboard-First** — Ctrl+Shift+S instant access, full arrow key navigation
🎨 **Clean UI** — Minimal, distraction-free interface
🎛️ **Command Palette** — Prefix-based modes: / commands, > power, @ tabs, # bookmarks, ?? web search
🔧 **Advanced Browser Commands** — ~45 opt-in tab, window, tab group, and browsing data commands
🌐 **Web Search** — Search Google, YouTube, GitHub, GCP, Jira, Confluence from the overlay
🤖 **AI Search** — Local keyword expansion via Ollama. 100% private, zero cloud
🔄 **Dual-Phase Search** — Keyword results appear instantly; AI expansion runs in parallel
🏷️ **Search Telemetry** — Every result shows how it was found: Keyword Match, AI Recalled, or AI Expanded
🌐 **Cross-Browser** — Works on Chrome, Edge, and Firefox

**PRIVACY GUARANTEE:**

• All data stored locally on your device
• No cloud sync, no external servers
• No analytics, no tracking
• Optional favicon loading (configurable)
• Sensitive-site blacklist (banks, password managers)
• Open source — inspect the code anytime
• You can delete all data anytime

**HOW IT WORKS:**

1. Install extension
2. Browse normally — SmrutiCortex indexes your history automatically
3. Press Ctrl+Shift+S (or click icon) to search
4. Type anything — title, URL, keywords
5. Hit Enter to open

**KEYBOARD SHORTCUTS:**

• Ctrl+Shift+S: Open search
• Enter: Open result
• Ctrl+Enter: Open in new tab
• Shift+Enter: Open in background tab
• Arrow keys: Navigate results
• Esc: Clear search
• Type "sc " in address bar for quick access

**AI FEATURES (optional — requires local Ollama):**

• **Keyword Expansion** — AI suggests synonyms to broaden your search
• **Semantic Search** — Find pages by meaning, not just keywords, using local embeddings
• **Search Badges** — Every result shows its source: Keyword [LEXICAL], AI Cache [ENGRAM], or AI Live [NEURAL]
• **Background Embeddings** — Processes your index in the background with pause/resume controls
• **Circuit Breaker** — Auto-pauses on failure, retries after 60s. Always falls back to keyword search.
• **Memory Guard** — AI pauses if memory exceeds 512MB, keeping your browser fast

**TECHNICAL DETAILS:**

• Manifest V3 (future-proof)
• IndexedDB for fast local storage
• Modular scoring algorithms for intelligent ranking
• Service worker background processing
• TypeScript codebase for reliability

**OPEN SOURCE:**
View code, report issues, contribute: github.com/dhruvinrsoni/smruti-cortex

---

### Category
**Productivity**

### Language
**English**

### Store Tags
**Primary Tag:** History Search
**Secondary Tags:** Browser History, Quick Search, Privacy, Local Search, Keyboard Navigation, Developer Tools

---

## 🖼️ Store Assets Required

### Icons (Required)
- ✅ 16x16px — `src/assets/icon-16.png`
- ✅ 48x48px — `src/assets/icon-48.png`
- ✅ 128x128px — `src/assets/icon-128.png` (for store listing)

**Note:** PNG icons are available and ready for submission.

### Screenshots (Required — 1-5 images)
**Recommended size:** 1280x800px or 640x400px

**Available screenshots** (in `docs/screenshots/`):
1. **AI Search — 'jira'** — `SmrutiCortex latest quick-search 'jira'...015040.png` — AI cache badge + yellow keyword + green AI-cache highlights (most impressive, use first)
2. **Popup search — 'git smruti'** — `SmrutiCortex popup 'git smruti'...124029.png` — yellow keyword highlights, Best Match results
3. **Quick-search overlay — 'git smruti'** — `SmrutiCortex latest quick-serach 'git smruti'...123923.png` — inline overlay with LEXICAL/NEURAL badges
4. **Settings — AI Tab** — `SmrutiCortex Settings AI Tab enable ai search...204945.png` — Ollama config, semantic search, embeddings, AI cache
5. **Data Tab — Health & Indexing** — `SmrutiCortex Settings Data tab Data Management...124703.png` — "● Healthy · 867 items indexed", storage bar

### Promo Images (Optional but recommended)
- **Small tile:** 440x280px
- **Marquee:** 1400x560px

---

## 📜 Privacy Policy (Required)

### Privacy Policy Content

**SmrutiCortex Privacy Policy**

**Last Updated:** March 3, 2026

**1. Data Collection**

SmrutiCortex does NOT collect, transmit, or store any personal data externally. All data processing happens locally on your device.

**2. What Data is Stored Locally**

The extension stores the following data in your browser's local IndexedDB:
- Browser history URLs (obtained via Chrome History API)
- Page titles
- Visit timestamps
- Optional metadata (keywords, descriptions) extracted from pages you visit

**3. Where Data is Stored**

All data is stored exclusively in:
- Browser IndexedDB (local database)
- Chrome Storage Local API (settings)

**4. Data Transmission**

SmrutiCortex does NOT:
- Send any data to external servers or the internet
- Use cloud storage or cloud sync
- Transmit browsing history, URLs, or page titles anywhere
- Include analytics, telemetry, or tracking
- Connect to any internet service without explicit user action

Optional AI features (keyword expansion, semantic search) connect **only** to Ollama — an open-source AI application the user installs and runs locally on their own device. By default this is `http://localhost:11434`. No internet connection is involved. SmrutiCortex sends only search keywords to Ollama — not URLs or history.

**5. Data Retention**

Data is stored indefinitely until you:
- Manually clear extension data (via Settings)
- Uninstall the extension (automatic cleanup)
- Clear browser data

**6. User Control**

You have full control to:
- Delete all extension data anytime
- Disable metadata extraction
- Uninstall the extension (removes all data)

**7. Permissions Used**

- `history`: Read browser history for indexing
- `bookmarks`: Read bookmarks for search integration
- `storage`: Save settings and indexed data locally
- `tabs`: Query active tab and send messages to content scripts
- `alarms`: Keep service worker alive for background indexing
- `scripting`: Re-inject the quick-search overlay into already-open tabs after an extension update so the keyboard shortcut keeps working without a page reload. Used ONLY for our own content script (`content_scripts/quick-search.js`), never to run arbitrary code. No user data is read, collected, or sent.
- `activeTab`: Grants temporary host permission for the current tab ONLY when the user presses the keyboard shortcut. Required by `chrome.scripting` to re-inject the content script after an extension update. No background access — strictly user-initiated.

**8. Open Source**

SmrutiCortex is open source. Review the code:
https://github.com/dhruvinrsoni/smruti-cortex

**9. Changes to Policy**

Updates will be posted at: https://github.com/dhruvinrsoni/smruti-cortex/blob/main/CHROME_WEB_STORE.md

**10. Contact**

Questions? Open an issue: https://github.com/dhruvinrsoni/smruti-cortex/issues

---

### Privacy Policy URL (for store)
Host this policy at: `https://github.com/dhruvinrsoni/smruti-cortex/blob/main/CHROME_WEB_STORE.md#privacy-policy-content`

Or create a GitHub Pages site: `https://dhruvinrsoni.github.io/smruti-cortex/privacy`

---

## 🔒 Permissions Justification

Chrome requires explaining why each permission is needed:

| Permission | Justification |
|------------|---------------|
| `history` | **Required** to read and index browser history for search functionality |
| `bookmarks` | **Required** to index bookmarks for unified search (v6.0) |
| `storage` | **Required** to store settings and indexed data locally for fast search |
| `tabs` | **Required** to query active tab and send messages to content scripts for inline overlay |
| `alarms` | **Required** to keep service worker alive and schedule background indexing updates |
| `scripting` | **Required** for zero-downtime extension updates. After Chrome/Edge auto-updates the extension, manifest-declared content scripts in already-open tabs become stale — the keyboard shortcut stops working until the user manually reloads every tab. The `scripting` permission lets us re-inject our own content script (`content_scripts/quick-search.js`) into those tabs so the shortcut keeps working instantly. We ONLY inject our own bundled file, NEVER run arbitrary code, and NEVER read or collect any page content. |
| `activeTab` | **Required** as a companion to `scripting`. Grants temporary host permission for the current tab ONLY when the user presses the keyboard shortcut (Ctrl+Shift+S). This allows `chrome.scripting.executeScript` to inject into the active tab without requiring broad host permissions. No background access — strictly user-initiated. |
| `sessions` | **Required** for the command palette `@` tabs mode. Retrieves recently closed tabs so users can find and reopen them. Read-only — no session data is modified or stored. |
| `windows` | **Required** for the command palette `@` tabs mode and advanced browser commands. Queries window state to list tabs across all windows, merge windows, and move tabs between windows. Read-only queries except when user explicitly triggers a command. |
| `<all_urls>` (optional) | **Optional permission** - Users can optionally grant this to enable metadata extraction (page titles, keywords) for improved search relevance. This feature is OFF by default and must be enabled in Settings. The extension works fully without this permission. |

### Optional API permissions — Advanced Browser Commands (reviewer note)

**For Chrome Web Store review:** The manifest declares **`optional_permissions`**: `tabGroups`, `browsingData`, and `topSites`. These are **not** granted at install.

- **Advanced Browser Commands** is **off by default** (Settings → General).
- When the user turns it **on**, the extension calls **`chrome.permissions.request()`** for those three APIs only.
- If the user **denies** the browser prompt, the setting **stays off**; no advanced commands are exposed and those APIs are **not** used.
- This flow is **independent** of **`optional_host_permissions`** (`<all_urls>`), which is documented separately and is used only for other optional features (e.g. favicon display / metadata), not for this toggle.

**Justification:** Tab groups commands need `tabGroups`; browsing-data cleanup commands need `browsingData`; “top sites” style shortcuts need `topSites`. All are user-initiated and gated behind an explicit Settings opt-in plus the permission dialog.

### Single Purpose Justification

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
• Command palette — prefix-based modes (/, >, @, #, ??) for quick access to tabs, bookmarks, settings, and web search without leaving the search UI
• Advanced browser commands — opt-in tab/window management shortcuts (~45 commands) behind optional permissions
• Content script re-injection (scripting) — after extension auto-updates, re-injects our own quick-search overlay into open tabs so the search shortcut keeps working without manual page reloads. Only injects our own bundled file, never arbitrary code.
• Metadata extraction (optional) — improves search relevance locally
• AI search (optional) — enhances queries with synonym expansion via local Ollama

Everything serves ONE goal: Find pages in your history faster.
```

---

### 🆕 Optional Host Permissions Strategy

**Important:** To comply with Chrome Web Store policies and minimize review time, `<all_urls>` is now an **optional_host_permission** instead of a required permission.

**What this means:**
- ✅ Extension installs **without** asking for broad permissions
- ✅ Core functionality (search history, inline overlay, keyboard shortcuts) works immediately
- ✅ Users can **optionally** grant `<all_urls>` permission in Settings to enable metadata extraction
- ✅ Faster Chrome Store approval (no "Broad Host Permissions" warning)

**User Experience:**
1. Extension installs with minimal permissions (history, bookmarks, storage, tabs, alarms, scripting, activeTab)
2. Search works instantly with browser history data
3. Users can enable "Enhanced Metadata" in Settings (requires granting optional permission)
4. Once granted, extension extracts titles/keywords from visited pages for better search

**Implementation:**
- Metadata extraction feature is disabled by default
- Settings page shows "Enable Enhanced Metadata" toggle
- Clicking toggle requests optional host permission via `chrome.permissions.request()`
- If denied, extension continues working with basic history data

---

## 📦 Upload Checklist

### Before Upload:
1. Build production package: `npm run package`
2. Verify zip file: `release/smruti-cortex-vX.Y.Z.zip`
3. Test in Chrome/Edge incognito mode
4. Prepare 128x128 store icon PNG
5. Create 3-5 screenshots (1280x800px)
6. Write promotional copy (optional)

### Chrome Upload Steps:
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devcenter/dashboard)
2. Click "New Item"
3. Upload `release/smruti-cortex-vX.Y.Z.zip`
4. Fill in store listing (copy from this doc)
5. Upload icons and screenshots
6. Add privacy policy URL
7. Select category: **Productivity**
8. Set pricing: **Free**
9. Choose visibility: **Public**
10. Submit for review

### Review Timeline:
- **Initial review:** 1-3 business days
- **Appeals (if rejected):** 3-5 business days
- **Updates (existing listing):** Few hours to 1 day

---

## 🌐 Edge Add-ons Store (Microsoft)

SmrutiCortex works natively on Edge with the same package!

### Edge Upload Steps:
1. Go to [Microsoft Partner Center](https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview)
2. Sign in with Microsoft account (one-time setup)
3. Click "Create new extension"
4. Upload `release/smruti-cortex-vX.Y.Z.zip` (same as Chrome!)
5. Fill store listing (copy from Chrome content above)
6. Upload icons and screenshots (same assets work)
7. Add privacy policy URL
8. Select category: **Productivity**
9. Submit for review

### Edge vs Chrome Differences:
| Aspect | Chrome | Edge |
|--------|--------|------|
| Package | Same .zip file | Same .zip file |
| Manifest | MV3 (both) | MV3 (both) |
| Review time | 1-3 days | 1-2 days (faster) |
| Dashboard | Chrome Developer Dashboard | Microsoft Partner Center |
| Bookmarks API | ✅ Supported | ✅ Supported |
| Firefox settings | Ignored | Ignored |

### Edge-Specific Notes:
- Edge uses Chromium engine — extension works identically
- Same permissions, same APIs, same behavior
- Edge may show "Designed for Chrome" badge initially
- Review is typically faster than Chrome

---

## 🐛 Common Rejection Reasons (and how to avoid)

### 1. **Privacy Policy Missing**
✅ **Solution:** Host policy at GitHub (see above)

### 2. **Permissions Too Broad**
✅ **Solution:** Justifications provided above

### 3. **Misleading Screenshots**
✅ **Solution:** Show actual extension UI, no stock photos

### 4. **Keyword Stuffing in Description**
✅ **Solution:** Our description is clean and natural

### 5. **External Code (minified)**
✅ **Solution:** We build with source maps, readable code

---

## 📈 Post-Release

### Monitor:
- User reviews and ratings
- Support questions (GitHub issues)
- Error reports (if any)
- Update frequency: quarterly or as-needed

### Marketing (optional):
- Post on Reddit: r/chrome, r/productivity
- Product Hunt launch
- Twitter/X announcement
- Dev.to article: "Building a Chrome Extension"

---

## 📞 Support

**Before submitting:**
- Test thoroughly in clean profile
- Check all links work
- Verify icons/screenshots render correctly
- Read Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies/

**Need help?**
- Chrome Web Store Support: https://support.google.com/chrome_webstore/
- Extension Developer Group: https://groups.google.com/a/chromium.org/g/chromium-extensions

---

**Ready to publish?** Follow the checklist above and submit with confidence! 🚀
---

## 🔒 HARDCORE BACKUP: Full Privacy Policy

> **CRITICAL:** This is a permanent, hardcore backup of the complete privacy policy. Even if GitHub Pages fails, this document in the repository blob provides a fallback URL for Chrome Web Store verification.
>
> **Primary URL:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html  
> **Fallback URL:** https://github.com/dhruvinrsoni/smruti-cortex/blob/main/CHROME_WEB_STORE.md#-hardcore-backup-full-privacy-policy

### SmrutiCortex Privacy Policy

**Last Updated:** March 3, 2026

#### Privacy Guarantee

**SmrutiCortex is a 100% local, privacy-first browser extension.** All data processing happens on your device. We do not collect, transmit, or store any personal data externally.

#### 1. Data Collection

SmrutiCortex does **NOT** collect, transmit, or store any personal data externally. All data processing happens locally on your device.

#### 2. What Data is Stored Locally

The extension stores the following data in your browser's local IndexedDB:

- Browser history URLs (obtained via Chrome History API)
- Page titles
- Visit timestamps and visit counts
- Optional metadata (keywords, descriptions) extracted from pages you visit
- Optional AI embeddings (if semantic search is enabled)
- Optional AI keyword expansion cache (if AI search is enabled — up to 5,000 per-keyword entries)
- Extension settings and preferences

#### 3. Where Data is Stored

All data is stored exclusively in:

- Browser IndexedDB (local database on your device)
- Chrome Storage Local API (settings and AI keyword expansion cache)

**No cloud storage or external servers are used.**

#### 4. Data Transmission

SmrutiCortex does **NOT**:

- Send any data to external servers or the internet
- Use cloud storage or cloud sync services
- Transmit your browsing history, URLs, or page titles to any external party
- Include analytics, telemetry, or tracking of any kind
- Connect to any internet service without explicit user action

##### Optional Features That May Involve Network Connections:

- **Favicon Loading (Google Favicon API):** When enabled in Settings, fetches site icons from Google's favicon service. Only the domain name (e.g., `github.com`) is sent — no URLs, no page content, no personal data. Disabled by default.

- **AI Features — Ollama (local only):** All AI features in SmrutiCortex — keyword expansion and semantic search — communicate **exclusively** with [Ollama](https://ollama.ai), an open-source AI application that the user installs and runs entirely on their own device. This is not a cloud service.
  - Ollama runs on the user's own machine as a local process, not on any external server.
  - By default, SmrutiCortex connects to Ollama at `http://localhost:11434` — no internet connection is made.
  - SmrutiCortex sends **only individual search keywords** to Ollama for synonym expansion (e.g., the word "table" — not URLs, not page titles, not browsing history, not any personal data).
  - For semantic search, SmrutiCortex sends short page text snippets to Ollama for embedding generation — processed locally and never transmitted beyond the user's device.
  - The Ollama endpoint and model can be configured by the user in Settings → AI. SmrutiCortex connects only to whatever endpoint the user specifies; configuring a non-localhost endpoint is the user's own choice and responsibility.
  - AI features are **disabled by default**. Enabling them requires the user to separately install Ollama on their device.
  - SmrutiCortex does not install, manage, or have any control over the user's Ollama instance.

#### 5. Data Retention

Data is stored indefinitely until you:

- Manually clear extension data via Settings ("Clear & Rebuild")
- Uninstall the extension (automatic cleanup)
- Clear browser data

#### 6. User Control

You have full control to:

- Delete all extension data anytime via Settings
- Disable metadata extraction
- Disable favicon loading
- Disable AI features
- Add sensitive sites to blacklist (no indexing for banks, password managers)
- Uninstall the extension (removes all data)

#### 7. Permissions Used

The extension requires these permissions for core functionality:

- **history:** Read browser history for indexing and search
- **bookmarks:** Read bookmarks for unified search
- **storage:** Save settings and indexed data locally
- **tabs:** Query active tab and send messages to content scripts for inline overlay
- **alarms:** Keep service worker alive and schedule background indexing updates
- **scripting:** Re-inject the quick-search overlay into already-open tabs after an extension update so the keyboard shortcut keeps working without a page reload. Used ONLY for our own content script (`content_scripts/quick-search.js`), never to run arbitrary code. No user data is read, collected, or sent.
- **activeTab:** Grants temporary host permission for the current tab ONLY when the user presses the keyboard shortcut. Required by `chrome.scripting` to re-inject the content script. No background access — strictly user-initiated.
- **<all_urls>:** (Optional) Extract metadata from pages user visits (local processing only)

#### 8. Third-Party Data Sharing

**SmrutiCortex does NOT sell or transfer user data to third parties.**

No browsing history, URLs, or personal information is shared with any external service, company, or individual.

#### 9. Security

All data is stored locally using browser's secure storage APIs (IndexedDB, chrome.storage). Only you have access to your data. The extension cannot access data from other extensions or websites you haven't visited.

#### 10. Open Source

SmrutiCortex is open source. You can review the code at any time:  
https://github.com/dhruvinrsoni/smruti-cortex

#### 11. Changes to Policy

Updates to this privacy policy will be posted at:

- https://dhruvinrsoni.github.io/smruti-cortex/privacy.html (primary)
- https://github.com/dhruvinrsoni/smruti-cortex/blob/main/CHROME_WEB_STORE.md (backup)

#### 12. Contact

Questions or concerns about privacy?

- Open an issue: https://github.com/dhruvinrsoni/smruti-cortex/issues
- View documentation: https://github.com/dhruvinrsoni/smruti-cortex

#### 13. Compliance

This extension complies with:

- Chrome Web Store Developer Program Policies
- User Data Privacy requirements
- Limited Use disclosure requirements

#### Summary

**SmrutiCortex is designed for maximum privacy.** Your browsing history never leaves your device. All processing, storage, and search happens locally in your browser. You control your data 100%.

---

**SmrutiCortex** — A gift to society. Ultra-fast, privacy-first browser history search.  
No analytics. No tracking. No data collection. Just pure, local search that respects your privacy.

© 2026 SmrutiCortex | BSL-1.1 (converts to Apache-2.0 on April 1, 2030)