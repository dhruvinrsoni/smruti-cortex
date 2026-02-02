# Chrome & Edge Web Store Submission Guide

Complete checklist and content for publishing SmrutiCortex to Chrome and Edge extension stores.

> **Note:** Chrome and Edge use the same Manifest V3 format. One package works for both stores!

---

## 📋 Pre-Submission Checklist

- [ ] Build production zip: `npm run package`
- [ ] Test in clean Chrome profile
- [ ] Verify all features work
- [ ] Check privacy compliance
- [ ] Prepare store assets (screenshots, icons)
- [ ] Review store listing content below

---

## 🎯 Store Listing Content

### Extension Name
**SmrutiCortex**

### Short Description (132 chars max)
Ultra-fast browser history search. Find any page instantly. 100% local, privacy-first, no cloud sync.

### Detailed Description (16,000 chars max)

**SmrutiCortex** — Your private, lightning-fast browser memory search engine.

Tired of losing important pages in your browser history? SmrutiCortex indexes everything you visit and retrieves any URL in milliseconds. Think "Everything" search for Windows, but for your browser.

**KEY FEATURES:**

⚡ **Ultra-Fast Search** — Results appear as you type (< 50ms)
🎯 **Smart Ranking** — Recent + frequent results with literal substring boost
🎯 **Strict Matching** — Only shows results containing your search terms (default ON, configurable)
🎲 **Diverse Results** — Filters duplicate URLs automatically for variety (default ON, configurable)
⭐ **Bookmark Search** — Search bookmarks alongside history with ★ indicator (v6.0)
🔍 **Query Expansion** — Find related terms with synonym matching (v6.0)
🖼️ **Favicon Caching** — Local cache for fast icon loading (v6.0)
📊 **Performance Monitor** — Real-time search metrics and timing (v6.0)
🔧 **Advanced Diagnostics** — Export system info for bug reports (v6.0)
🔐 **100% Private** — All data stays local in IndexedDB
🛡️ **Self-Healing** — Auto-recovery from errors with retry logic
🔧 **Privacy Controls** — Favicon toggle, sensitive-site blacklist
💾 **Data Management** — Storage quota monitoring, one-click rebuild
⌨️ **Keyboard-First** — Ctrl+Shift+S instant access, full arrow key navigation
🎨 **Clean UI** — Minimal, distraction-free interface
🤖 **AI Search** — Optional local keyword expansion (Ollama)
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

**Screenshot Ideas:**
1. **Main search interface** — Show search input with results
2. **Fast search demo** — Animated GIF of typing and instant results
3. **Keyboard shortcuts** — Overlay showing Ctrl+Shift+S in action
4. **Privacy emphasis** — Visual showing local-only storage

**Tools:** Use Chrome DevTools screenshots or Snagit/Greenshot

### Promo Images (Optional but recommended)
- **Small tile:** 440x280px
- **Marquee:** 1400x560px

---

## 📜 Privacy Policy (Required)

### Privacy Policy Content

**SmrutiCortex Privacy Policy**

**Last Updated:** January 1, 2026

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
- Send any data to external servers
- Use cloud storage or sync
- Transmit browsing history anywhere
- Include analytics or tracking
- Use third-party services

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
- `scripting`: Extract page metadata (optional)
- `tabs`: Open search results
- `activeTab`: Access current page for search
- `alarms`: Background indexing updates
- `commands`: Keyboard shortcuts

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
| `history` | Required to read and index browser history for search functionality |
| `bookmarks` | Required to index bookmarks for unified search (v6.0) |
| `storage` | Store settings and indexed data locally for fast search |
| `scripting` | Extract page metadata (title, keywords) to improve search relevance |
| `tabs` | Open search results in current/new/background tabs |
| `activeTab` | Access currently active tab for inline search overlay |
| `alarms` | Schedule background jobs to keep search index up-to-date |
| `commands` | Register keyboard shortcuts (Ctrl+Shift+S) |
| `<all_urls>` | Extract metadata from any page user visits (local processing only) |

---

## 📦 Upload Checklist

### Before Upload:
1. Build production package: `npm run package`
2. Verify zip file: `release/smruti-cortex-v6.0.0.zip`
3. Test in Chrome/Edge incognito mode
4. Prepare 128x128 store icon PNG
5. Create 3-5 screenshots (1280x800px)
6. Write promotional copy (optional)

### Chrome Upload Steps:
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devcenter/dashboard)
2. Click "New Item"
3. Upload `release/smruti-cortex-v3.0.0.zip`
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
4. Upload `release/smruti-cortex-v6.0.0.zip` (same as Chrome!)
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

**Last Updated:** February 3, 2026

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
- Extension settings and preferences

#### 3. Where Data is Stored

All data is stored exclusively in:

- Browser IndexedDB (local database on your device)
- Chrome Storage Local API (settings only)

**No cloud storage or external servers are used.**

#### 4. Data Transmission

SmrutiCortex does **NOT**:

- Send any data to external servers
- Use cloud storage or sync services
- Transmit browsing history anywhere
- Include analytics or tracking tools
- Use third-party services (except optional local AI)

##### Optional Features:

- **Favicon Loading:** When enabled, fetches site icons via Google Favicon API (can be disabled in Settings)
- **Local AI (Ollama):** Requires user to install Ollama locally; no cloud AI calls are made

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
- **scripting:** Inject content scripts for inline overlay and optional metadata extraction
- **tabs:** Open search results in current/new/background tabs
- **activeTab:** Access current page for inline search overlay
- **alarms:** Schedule background indexing updates
- **commands:** Register keyboard shortcuts (Ctrl+Shift+S)
- **<all_urls>:** Extract metadata from pages user visits (local processing only)

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

© 2026 SmrutiCortex | MIT License