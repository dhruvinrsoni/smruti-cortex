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
More specific queries = better results
```
"github actions" → finds CI/CD pages
"react hooks" → finds React documentation
```

### 2. Leverage Modifier Keys
- `Ctrl+Enter` → Open without leaving current tab
- `Shift+Enter` → Background tab for batch opening

### 3. Copy Markdown Links
Press `Ctrl+M` to copy results as `[Title](URL)` format — perfect for documentation!

### 4. Use the Omnibox for Quick Access
Type `sc github` in the address bar for ultra-fast search

### 5. Pin the Extension
Right-click the extension icon → **Pin** for one-click access

---

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

---

## ❓ Frequently Asked Questions

See [FAQ.md](./FAQ.md) for answers to common questions.

---

*Last updated: December 2025 | SmrutiCortex v2.0*
