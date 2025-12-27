# Troubleshooting Guide

Solutions for common SmrutiCortex issues.

---

## 🔍 Quick Diagnosis

Before diving into specific issues, try these quick fixes:

1. **Reload the extension**: `chrome://extensions` → SmrutiCortex → 🔄 Reload
2. **Check for errors**: Open DevTools (`F12`) → Console tab
3. **Verify permissions**: `chrome://extensions` → SmrutiCortex → Details → Site access

---

## ❌ Common Issues

### 1. Inline Overlay Not Appearing

**Symptoms:** Pressing `Ctrl+Shift+S` does nothing on a webpage.

**Possible Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Special page** | Content scripts can't run on `chrome://`, `edge://`, or `about:` pages. Use the toolbar popup instead. |
| **Shortcut conflict** | Another extension may use the same shortcut. Check `chrome://extensions/shortcuts` |
| **Content script not loaded** | Refresh the page (`F5`) or reload the extension |
| **Extension disabled** | Verify extension is enabled in `chrome://extensions` |

**Debug steps:**
```javascript
// Open DevTools Console on the page and check:
console.log(window.__SMRUTI_QUICK_SEARCH_LOADED__);
// Should return true if content script loaded
```

---

### 2. Popup Not Opening

**Symptoms:** Clicking the toolbar icon does nothing.

**Possible Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Extension error** | Check `chrome://extensions` for error badges |
| **Build issue** | Run `npm run build` and reload extension |
| **Manifest error** | Check DevTools → Console for manifest errors |

**Debug steps:**
1. Go to `chrome://extensions`
2. Find SmrutiCortex
3. Click "Errors" if shown
4. Click "Service worker" to inspect background script

---

### 3. Keyboard Shortcut Not Working

**Symptoms:** `Ctrl+Shift+S` doesn't trigger anything.

**Solutions:**

1. **Check shortcut assignment:**
   - Go to `chrome://extensions/shortcuts`
   - Find SmrutiCortex
   - Verify shortcut is set

2. **Reassign if needed:**
   - Click the pencil icon
   - Press your desired key combination
   - Make sure it's not conflicting with browser shortcuts

3. **Try on a regular webpage:**
   - Shortcuts may not work on `chrome://` pages
   - Test on any normal website like google.com

---

### 4. No Search Results

**Symptoms:** Typing in search shows "No results found".

**Possible Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Empty index** | Wait for initial indexing to complete |
| **Query too specific** | Try broader search terms |
| **IndexedDB issue** | Clear and rebuild index (see below) |
| **Service worker sleeping** | First search may be slow; try again |

**Check indexing status:**
1. Open DevTools (`F12`)
2. Go to Application → IndexedDB → SmrutiCortexDB
3. Click on "items" store
4. Check if data exists

---

### 5. Service Worker Not Loading

**Symptoms:** Extension doesn't respond, no background activity.

**Debug steps:**

1. **Check service worker status:**
   - Go to `chrome://extensions`
   - Find SmrutiCortex
   - Look for "Service worker" link
   - Click to inspect

2. **Common errors:**
   ```
   // Error: Cannot find module
   → Run `npm run build` to regenerate bundles
   
   // Error: Uncaught SyntaxError
   → Check for TypeScript compilation errors
   
   // Error: Extension context invalidated
   → Reload the extension
   ```

3. **Force restart:**
   - `chrome://extensions` → Disable → Enable

---

### 6. IndexedDB Issues

**Symptoms:** Errors mentioning IndexedDB, database, or storage.

**Solution - Clear and Rebuild:**

1. Open DevTools (`F12`)
2. Go to **Application** tab
3. Expand **IndexedDB** in sidebar
4. Find **SmrutiCortexDB**
5. Right-click → **Delete database**
6. Reload the extension
7. Index will rebuild automatically

**If that doesn't work:**

```javascript
// Run in DevTools Console:
indexedDB.deleteDatabase('SmrutiCortexDB');
// Then reload extension
```

---

### 7. Content Script Not Injecting

**Symptoms:** Metadata not being captured, overlay not available on some sites.

**Possible Causes:**

| Cause | Solution |
|-------|----------|
| **CSP restrictions** | Some sites block content scripts. This is expected. |
| **Extension permissions** | Check site access in extension details |
| **HTTPS-only sites** | Ensure you're on HTTPS |

**Check injection:**
```javascript
// In page's DevTools Console:
console.log(document.getElementById('smruti-cortex-overlay'));
// Should show the overlay element if injected
```

---

### 8. Performance Issues / Slow Search

**Symptoms:** Search takes noticeably long, UI feels sluggish.

**Solutions:**

1. **Large history:** If you have 100,000+ history items, searches may take longer
2. **Debug mode:** Disable debug logging for better performance
3. **Background tabs:** Close unused tabs to free memory
4. **Rebuild index:** Sometimes helps optimize the database

**Performance check:**
```javascript
// Enable debug mode and watch console for timing logs:
// [DEBUG] Search completed in Xms
```

---

## 🔧 Debug Mode

### Enabling Debug Logging

1. Open the popup
2. Click the settings icon (⚙️)
3. Select **DEBUG** or **TRACE** log level
4. Open DevTools Console to see logs

### Log Levels

| Level | Shows |
|-------|-------|
| ERROR | Only critical errors |
| INFO | Errors + important events |
| DEBUG | Info + detailed debugging |
| TRACE | Everything (very verbose) |

### Key Debug Messages

```
[INFO] Service worker ready
→ Background script loaded successfully

[DEBUG] Database opened successfully
→ IndexedDB initialized

[DEBUG] Indexed X items from history
→ Initial indexing complete

[DEBUG] Search: "query" → X results in Yms
→ Search performance
```

---

## 📋 Collecting Debug Information

When reporting bugs, include:

1. **Browser version:** `chrome://version`
2. **Extension version:** `chrome://extensions` → SmrutiCortex → Details
3. **Console errors:** DevTools → Console → Copy errors
4. **Steps to reproduce:** Exact actions that cause the issue
5. **Expected vs actual:** What should happen vs what happened

---

## 🔄 Reset & Recovery

### Soft Reset (Keeps Data)
1. `chrome://extensions`
2. Find SmrutiCortex
3. Click reload button (🔄)

### Hard Reset (Clear Everything)
1. `chrome://extensions`
2. Remove SmrutiCortex
3. Clear IndexedDB: DevTools → Application → IndexedDB → Delete
4. Reinstall extension

### Rebuild Index Only
1. DevTools → Application → IndexedDB
2. Delete SmrutiCortexDB
3. Reload extension
4. Index rebuilds automatically

---

## 📞 Still Need Help?

If none of these solutions work:

1. **Enable debug mode** and capture console output
2. **Open an issue** on [GitHub](https://github.com/dhruvinrsoni/SmrutiCortex/issues)
3. **Include:**
   - Browser and version
   - Extension version
   - Error messages
   - Steps to reproduce

---

*Last updated: December 2025 | SmrutiCortex v2.0*
