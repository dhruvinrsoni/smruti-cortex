# Chrome Web Store Submission Guide

Complete checklist and content for publishing SmrutiCortex to Chrome/Edge extension stores.

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
🎯 **Smart Ranking** — Recent + frequent results first
🔐 **100% Private** — All data stays local in IndexedDB
⌨️ **Keyboard-First** — Ctrl+Shift+S instant access, full arrow key navigation
🎨 **Clean UI** — Minimal, distraction-free interface
🔧 **Zero Config** — Works out of the box

**PRIVACY GUARANTEE:**

• All data stored locally on your device
• No cloud sync, no external servers
• No analytics, no tracking
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

---

## 🖼️ Store Assets Required

### Icons (Required)
- ✅ 16x16px — `src/assets/icon16.svg`
- ✅ 48x48px — `src/assets/icon48.svg`
- ✅ 128x128px — `src/assets/icon128.svg` (for store listing)

**Note:** Currently using SVG placeholders. Replace with proper PNG icons before submission.

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

**Last Updated:** December 28, 2025

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
2. Verify zip file: `release/smruti-cortex-v3.0.0.zip`
3. Test in Chrome incognito mode
4. Prepare 128x128 store icon PNG
5. Create 3-5 screenshots (1280x800px)
6. Write promotional copy (optional)

### Upload Steps:
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

Same content works for Edge store with minor adjustments:

1. Go to [Microsoft Partner Center](https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview)
2. Upload same zip file
3. Use same descriptions
4. Edge review is typically faster (1-2 days)

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
