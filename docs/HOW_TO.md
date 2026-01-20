# How to Use SmrutiCortex

A complete guide to installing, using, and getting the most out of SmrutiCortex.

---

## 📦 Installation

### Chrome

1. **Download the extension**
   - Clone the repository or download the latest release zip
   ```bash
   git clone https://github.com/dhruvinrsoni/SmrutiCortex.git
   cd SmrutiCortex
   npm install
   npm run build
   ```

2. **Load in Chrome**
   - Open `chrome://extensions` in your browser
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **Load unpacked**
   - Select the `dist/` folder from the project
   - The 🧠 SmrutiCortex icon appears in your toolbar

### Edge

1. **Build the extension** (same as above)
   ```bash
   npm install
   npm run build
   ```

2. **Load in Edge**
   - Open `edge://extensions` in your browser
   - Enable **Developer mode** (toggle in left sidebar)
   - Click **Load unpacked**
   - Select the `dist/` folder
   - Pin the extension to your toolbar for easy access

---

## 🚀 Getting Started

### First-Time Setup

When you install SmrutiCortex:

1. **Initial Indexing** - The extension automatically imports your recent browser history
2. **Continuous Updates** - New pages you visit are indexed in real-time
3. **Metadata Enrichment** - Page titles, descriptions, and keywords are captured

> 💡 **Tip:** Initial indexing may take a few seconds depending on your history size. Subsequent searches are instant.

---

## 🔍 Using SmrutiCortex

### Method 1: Ultra-Fast Inline Overlay (Recommended)

**Fastest way to search!** Works on any regular webpage.

1. Press **`Ctrl+Shift+S`** (or `Cmd+Shift+S` on Mac)
2. A sleek overlay appears in the center of your screen
3. Start typing your search query
4. Results appear instantly as you type
5. Press **Enter** to open the selected result

### Method 2: Extension Popup

Works everywhere, including special browser pages.

1. Click the **🧠 SmrutiCortex icon** in your toolbar
2. Type your search query
3. Navigate results with arrow keys
4. Press **Enter** to open

### Method 3: Omnibox (Address Bar)

Search directly from the browser's address bar.

1. Type **`sc `** (note the space after "sc") in the address bar
2. Continue typing your search query
3. Select from the dropdown suggestions
4. Press **Enter** to navigate

---

## ⌨️ Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Open inline search overlay |

### Search Navigation

| Shortcut | Action |
|----------|--------|
| `↓` Arrow Down | Select next result |
| `↑` Arrow Up | Select previous result |
| `Enter` | Open selected result |
| `Ctrl+Enter` | Open in new tab |
| `Shift+Enter` | Open in background tab |
| `→` Arrow Right | Open in new tab |
| `Ctrl+C` / `Cmd+C` | Copy as rich HTML link (paste into Word, Outlook, Teams) |
| `Ctrl+M` / `Cmd+M` | Copy as markdown link |
| `Escape` | Close overlay / Clear search |

### Popup-Specific

| Shortcut | Action |
|----------|--------|
| `M` (with result selected) | Copy markdown link |

---

## 🧠 How Indexing Works

SmrutiCortex maintains a local index of your browsing history:

1. **History Import** - On first run, imports recent browser history
2. **Real-Time Updates** - New page visits are indexed immediately
3. **Metadata Extraction** - Content scripts capture:
   - Page title
   - Meta description
   - Meta keywords
   - URL structure
4. **Tokenization** - Text is broken into searchable tokens
5. **Scoring** - Multiple algorithms rank results by relevance

### What Gets Indexed

| Data | Source | Purpose |
|------|--------|---------|
| URL | Browser history | Search matching |
| Title | Page content | Search matching |
| Visit count | Browser history | Relevance scoring |
| Last visit | Browser history | Recency scoring |
| Meta tags | Page content | Enhanced matching |

### What's NOT Collected

- ❌ Page content/body text
- ❌ Form data or passwords
- ❌ Any data sent to external servers

> 🔒 **Privacy First:** All data stays local on your device. Nothing is uploaded anywhere.

---

## 🔧 Settings & Configuration

### Accessing Settings

1. Click the 🧠 icon in your toolbar
2. Click the ⚙️ gear icon in the popup header
3. Or open popup → press the settings button

### Available Settings

| Setting | Description |
|---------|-------------|
| **Debug Mode** | Enable verbose console logging |
| **Log Level** | Control logging detail (ERROR, INFO, DEBUG, TRACE) |
| **Show non-matching results** | Include results without search term matches (default OFF = strict matching) |
| **Show duplicate URLs** | Display same URLs with different query params (default OFF = diversity ON) |
| **Load Favicons** | Fetch site icons from Google (disable for privacy) |
| **AI Search** | Enable local AI keyword expansion via Ollama |

---

## 🎯 Search Quality Controls

SmrutiCortex v4.0+ includes intelligent filtering for better results:

### Strict Matching Mode (Default: ON)
By default, only results **containing your search terms** are shown. This eliminates irrelevant suggestions.

**Example:** Searching "war" only shows pages with "war" in the title/URL.

**To see all results:** Settings → Toggle "Show non-matching results" to ON

### Diversity Filter (Default: ON)
Automatically filters duplicate URLs with different query parameters for better variety.

**Example:** A Notion page visited with `?pvs=12`, `?pvs=25`, and `?pvs=30` shows only once (highest scoring version).

**To see all variants:** Settings → Toggle "Show duplicate URLs" to ON

### Literal Substring Boost
Results with your **exact search term** (case-insensitive) get a **50% score boost**.

**Example:** Searching "war" ranks `google.com/search?q=war` higher than pages matching only via tokenization.

---

## 🔄 Resetting the Index

If you need to clear and rebuild the index:

1. Open Chrome DevTools (`F12`)
2. Go to **Application** tab
3. In the sidebar, expand **IndexedDB**
4. Find **SmrutiCortexDB**
5. Right-click → **Delete database**
6. Reload the extension

The index will rebuild automatically on next use.

---

## 💡 Power User Tips

### 1. Use Specific Keywords
More specific queries = better results. Type **exact phrases from URLs** for literal substring boost.
```
"github actions" → finds CI/CD pages
"react hooks" → finds React documentation
"war" → URLs containing "war" rank 50% higher
```

### 2. Control Result Quality
- **Strict matching ON** (default): Only relevant results containing your search terms
- **Diversity filter ON** (default): No duplicate URLs with different query params
- Adjust in Settings if you need more/fewer results

### 3. Leverage Modifier Keys
- `Ctrl+Enter` → Open without leaving current tab
- `Shift+Enter` → Background tab for batch opening

### 4. Copy Links
- Press `Ctrl+C` to copy as rich HTML link — perfect for Word, Outlook, Teams!
- Press `Ctrl+M` to copy as markdown link `[Title](URL)` — perfect for documentation!

### 5. Use the Omnibox for Quick Access
Type `sc github` in the address bar for ultra-fast search

### 6. Pin the Extension
Right-click the extension icon → **Pin** for one-click access

---

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

---

## ❓ Frequently Asked Questions

See [FAQ.md](./FAQ.md) for answers to common questions.

---

*Last updated: December 2025 | SmrutiCortex v4.0*
