# Frequently Asked Questions (FAQ)

Common questions about SmrutiCortex answered.

---

## 🔒 Privacy & Security

### Is my browsing data uploaded anywhere?

**No.** SmrutiCortex is 100% local-first. All your browsing history, search data, and metadata stay on your device. Nothing is ever sent to external servers.

### What permissions does SmrutiCortex need and why?

| Permission | Why It's Needed |
|------------|-----------------|
| `history` | Read browser history to build the search index |
| `storage` | Store settings and indexed data locally |
| `tabs` | Open search results in new tabs |
| `activeTab` | Access current tab for inline overlay |
| `scripting` | Inject content scripts for metadata extraction |

### Can my employer see what I search in SmrutiCortex?

No. SmrutiCortex works entirely locally and doesn't transmit any data. However, your browser history itself may be visible to IT admins on managed devices.

---

## 🔍 Search & Results

### Why doesn't search show a specific page I visited?

Possible reasons:
1. **Page was visited before installation** - Only pages visited after installing are fully indexed
2. **Incognito mode** - Incognito browsing isn't captured in browser history
3. **Recent visit** - Give it a moment for real-time indexing
4. **Query mismatch** - Try different keywords from the page title or URL

### Why does initial indexing take time?

On first run, SmrutiCortex imports your browser history, which may contain thousands of entries. This is a one-time operation. After that, indexing happens in real-time and is instant.

### How can I improve search results?

- Use specific keywords that appear in the page title or URL
- Use multiple words for better matching
- Recent and frequently visited pages rank higher
- Type exact phrases from URLs for literal substring boost (50% score increase)

### Why am I seeing duplicate results?

SmrutiCortex now filters duplicate URLs by default. If you see the same page with different query parameters (like `?pvs=12` vs `?pvs=25`), go to **Settings → "Show duplicate URLs"** to toggle this behavior. Default is OFF (diversity ON) for better variety.

### Why don't I see results that don't contain my search term?

SmrutiCortex uses **strict matching** by default - only results containing your search terms are shown. This ensures relevant results without random suggestions. To see non-matching results, toggle **Settings → "Show non-matching results"** to ON.

### How does literal substring matching work?

If your search term appears exactly in a URL or title (case-insensitive), that result gets a 50% score boost. For example, searching "war" will rank URLs containing "war" higher than pages that only match via tokenization.

---

## 🎨 User Interface

### Why are there two UIs (overlay vs popup)?

**Performance optimization.** 

- **Inline Overlay** (`Ctrl+Shift+S`): Ultra-fast (< 50ms) because it's a content script that's always ready
- **Extension Popup**: Works on special pages (chrome://, new tab) where content scripts can't run

Both use the same search engine — just pick your preference!

### Can I change the keyboard shortcut?

Yes! In Chrome:
1. Go to `chrome://extensions/shortcuts`
2. Find SmrutiCortex
3. Click the pencil icon next to the shortcut
4. Press your preferred key combination

---

## 🔧 Technical

### Does SmrutiCortex slow down my browser?

No. SmrutiCortex is designed for minimal overhead:
- Background indexing is lightweight
- Content scripts are optimized
- Search is performed locally and is extremely fast

### How much storage does it use?

Typically **5-50 MB** depending on your browsing history size. The index is compact and efficient.

### Does it work in Incognito mode?

No. Incognito browsing isn't recorded in browser history, so SmrutiCortex can't index it. This is a privacy feature of your browser.

### Why Manifest V3?

Manifest V3 is Chrome's modern extension architecture with:
- Better security
- Improved performance
- Required for Chrome Web Store after 2024

---

## 🚀 Features

### What features are planned for the future?

See our [roadmap](../GENERAL_TODO.md) for planned features including:
- AI-powered semantic search (v4+)
- Cross-device sync (premium feature)
- Advanced filters (date range, site-specific)
- Export/import functionality

### Can I search by date range?

Not yet, but it's on the roadmap! Currently, recent pages naturally rank higher due to recency scoring.

### Can I export my search history?

Not in the current version. This feature is planned for a future release.

---

## 🐛 Issues & Support

### How do I report a bug?

1. Enable debug mode in settings
2. Reproduce the issue
3. Open DevTools (`F12`) → Console
4. Copy any error messages
5. [Open an issue](https://github.com/dhruvinrsoni/SmrutiCortex/issues) with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Console logs
   - Browser version

### The extension isn't working after an update

Try these steps:
1. Go to `chrome://extensions`
2. Find SmrutiCortex
3. Click the refresh/reload button
4. If that doesn't work, remove and reinstall

### Where can I get help?

- 📖 [Documentation](./HOW_TO.md)
- 🐛 [GitHub Issues](https://github.com/dhruvinrsoni/SmrutiCortex/issues)
- 💬 [Discussions](https://github.com/dhruvinrsoni/SmrutiCortex/discussions)

---

## 📜 About

### What does "SmrutiCortex" mean?

**Smruti (स्मृति)** — Sanskrit for "memory," "recollection," "remembered knowledge"

**Cortex** — The brain's memory and intelligence center

Together: *"The Memory Cortex for your Browser"*

### Is SmrutiCortex open source?

Yes! SmrutiCortex is open source under the MIT license. Contributions are welcome!

### Who created SmrutiCortex?

Created by [Dhruvin Soni](https://github.com/dhruvinrsoni), inspired by the "Everything" search tool for Windows, reimagined for the browser.

---

*Have a question not answered here? [Open an issue](https://github.com/dhruvinrsoni/SmrutiCortex/issues) and we'll add it!*

*Last updated: December 2025 | SmrutiCortex v4.0*
