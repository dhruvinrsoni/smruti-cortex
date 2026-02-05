# SmrutiCortex v7.0.0 Chrome Web Store Submission Guide

## 📦 Package Ready
- **File**: `release/smruti-cortex-v7.0.0.zip`
- **Size**: 7.76 MB
- **Version**: 7.0.0

---

## ✅ Pre-Submission Checklist

### 1. Permissions Compliance (FIXED from v6.0 rejection)
The v6.0 submission was rejected for: *"Requesting but not using the following permission(s): scripting"*

**v7.0.0 FIXED permissions** (only 5, all actively used):
| Permission | API Usage | Why Needed |
|------------|-----------|------------|
| `history` | `chrome.history.search()`, `chrome.history.onVisited` | Core feature: index and search browser history |
| `bookmarks` | `chrome.bookmarks.getTree()`, `chrome.bookmarks.getRecent()` | Core feature: search bookmarks |
| `storage` | `chrome.storage.local.*`, `chrome.storage.sync.*` | Store settings and indexed data |
| `tabs` | `chrome.tabs.query()`, `chrome.tabs.sendMessage()` | Open results, communicate with content scripts |
| `alarms` | `chrome.alarms.create()`, `chrome.alarms.onAlarm` | Keep service worker alive, scheduled tasks |

**Removed permissions** (were causing rejection):
- ❌ `scripting` - Removed (was for dynamic injection, now using declarative manifest)
- ❌ `activeTab` - Removed (only needed with scripting API)
- ❌ `commands` - Not a permission (just manifest key)

### 2. Content Scripts
Content scripts are now **declaratively injected** via manifest.json (no scripting API needed):
```json
"content_scripts": [{
  "matches": ["http://*/*", "https://*/*"],
  "js": ["content_scripts/quick-search.js"],
  "run_at": "document_start"
}]
```

### 3. Single Purpose
SmrutiCortex has ONE purpose: **Search your browser history instantly.**

---

## 📝 Submission Steps

### Step 1: Go to Chrome Developer Dashboard
1. Open https://chrome.google.com/webstore/devconsole
2. Sign in with your developer account

### Step 2: Upload Package
1. Click "Items" in the left sidebar
2. Find SmrutiCortex (existing item) or click "New Item"
3. Click "Package" tab
4. Upload `release/smruti-cortex-v7.0.0.zip`

### Step 3: Fill Store Listing

**Title:** SmrutiCortex

**Summary (132 chars max):**
```
Ultra-fast browser history search. Find any page in your memory instantly. Privacy-first, 100% local.
```

**Description:**
```
🧠 SmrutiCortex — Your Browser's Memory Search Engine

Ultra-fast, privacy-first browser history search. Find any page you've visited in milliseconds.

✨ KEY FEATURES:
• ⚡ Instant Search — Results < 50ms as you type
• ⌨️ Keyboard-First — Ctrl+Shift+S global shortcut
• ⭐ Bookmark Search — Search bookmarks with ★ indicator
• 🎯 Smart Ranking — Recency + frequency + keyword scoring
• 🔒 100% Private — All data stays on YOUR device
• 🤖 AI Search — Optional local AI via Ollama (no cloud)

🔐 PRIVACY FIRST:
• Zero telemetry, zero tracking
• All data in local IndexedDB
• No cloud sync, no external servers
• Open source — audit anytime

⌨️ KEYBOARD SHORTCUTS:
• Ctrl+Shift+S — Open search
• Enter — Open result
• Ctrl+Enter — Open in new tab
• Ctrl+C — Copy as HTML link
• Ctrl+M — Copy as markdown

🚀 HOW IT WORKS:
1. Install extension
2. Press Ctrl+Shift+S or click icon
3. Type your search
4. Hit Enter to open

Like "Everything" for Windows, but for your browser history.

📖 Open Source: github.com/dhruvinrsoni/smruti-cortex
```

### Step 4: Permissions Justification
If asked to justify permissions, use this:

```
Permission Justification:

1. history: Core functionality. SmrutiCortex indexes browser history to provide instant search. Uses chrome.history.search() and chrome.history.onVisited to access and monitor history entries.

2. bookmarks: Core functionality. Enables unified search across history AND bookmarks. Uses chrome.bookmarks.getTree() to index bookmarks for search.

3. storage: Required for settings persistence. Uses chrome.storage.local to store user preferences (log level, AI settings, display options) and cached search data.

4. tabs: Required to open search results in tabs and communicate with content scripts. Uses chrome.tabs.query() to find active tab, chrome.tabs.sendMessage() for overlay communication.

5. alarms: Required to keep service worker responsive. Uses chrome.alarms.create() for periodic keepalive pings to prevent cold start delays on keyboard shortcuts.

NO scripting permission needed - content scripts are declaratively injected via manifest.json content_scripts section.
```

### Step 5: Privacy Policy
**Privacy Policy URL:** `https://dhruvinrsoni.github.io/smruti-cortex/docs/privacy.html`

Or use the in-repo file: `docs/privacy.html`

### Step 6: Submit for Review
1. Click "Submit for Review"
2. Expected review time: 1-3 business days

---

## 🔍 What Changed in v7.0.0

### Bug Fixes
1. **Quick Search Opening** — Fixed timeout handling for content script messaging
2. **Bookmark Flooding** — Bookmarks now only show on exact word match (not partial)
3. **Popup Whitespace** — Increased results height from 280px to 340px

### Permission Fixes (CWS Compliance)
- Removed `scripting` permission (was causing rejection)
- Removed `activeTab` permission (not needed without scripting)
- Content scripts now use declarative injection via manifest

### Version Updates
- Package version: 7.0.0
- Manifest version: 7.0.0

---

## ⚠️ Common Rejection Reasons (Avoided)

| Issue | Status | Solution |
|-------|--------|----------|
| Unused permissions | ✅ FIXED | Removed scripting, activeTab |
| Missing privacy policy | ✅ OK | Have hosted privacy policy |
| Unclear single purpose | ✅ OK | Clear: browser history search |
| Missing justification | ✅ OK | Each permission justified above |

---

## 📁 Files Ready

```
release/
└── smruti-cortex-v7.0.0.zip  (7.76 MB) ✅ READY
```

**Good luck with the submission! 🚀**
