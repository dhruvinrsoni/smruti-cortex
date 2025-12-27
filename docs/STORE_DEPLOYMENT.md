# Store Deployment Guide

Step-by-step guide for publishing SmrutiCortex to Chrome Web Store and Microsoft Edge Add-ons.

---

## 📋 Prerequisites

Before submitting, ensure you have:

- [ ] **Developer accounts** set up (see below)
- [ ] **Production build** tested and working
- [ ] **All documentation** updated
- [ ] **Manifest version** bumped appropriately
- [ ] **Screenshots** prepared (1280x800 or 640x400)
- [ ] **Promotional images** ready

---

## 🔧 Pre-Submission Checklist

### Code Quality

- [ ] `npm run lint` passes with no errors
- [ ] `npm run test` all tests pass
- [ ] `npm run build:prod` succeeds
- [ ] Extension loads without errors
- [ ] All features work correctly

### Manifest Review

Verify `manifest.json` has:

```json
{
  "name": "SmrutiCortex",
  "version": "X.Y.Z",           // ← Update appropriately
  "manifest_version": 3,
  "description": "Ultra-fast, intelligent browser history search engine",
  "permissions": ["history", "storage", "tabs", "activeTab", "scripting"],
  // ... rest of manifest
}
```

### Privacy Policy

Both stores require a privacy policy. Create one that covers:

- What data is collected (none, it's local)
- How data is stored (IndexedDB, local only)
- What permissions are used and why
- Contact information

---

## 📦 Creating the Package

### Build and Package

```bash
# Clean previous builds
npm run clean

# Production build
npm run build:prod

# Create zip for submission
npm run package
```

This creates `smruti-cortex-vX.X.X.zip` in the project root.

### Verify Package Contents

Unzip and check that it contains:

```
dist/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── background/
│   └── service-worker.js
├── content_scripts/
│   ├── extractor.js
│   └── quick-search.js
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🌐 Chrome Web Store

### 1. Create Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with Google account
3. Pay one-time $5 registration fee
4. Accept developer agreement

### 2. Create New Item

1. Click **"New Item"**
2. Upload `smruti-cortex-vX.X.X.zip`
3. Fill in store listing details

### 3. Store Listing Details

**Product Details:**

| Field | Value |
|-------|-------|
| Name | SmrutiCortex |
| Summary | Ultra-fast, intelligent browser history search |
| Category | Productivity |
| Language | English |

**Description:**
```
SmrutiCortex is an ultra-fast, Everything-like search engine for your browser history.

🚀 FEATURES:
• Lightning-fast search as you type
• Intelligent ranking using multiple scoring algorithms  
• Two UIs: Ultra-fast inline overlay (< 50ms) and extension popup
• Real-time indexing of new visits
• Keyboard-first design with full navigation support
• Privacy-focused: 100% local, no data sent anywhere

⌨️ SHORTCUTS:
• Ctrl+Shift+S: Instant inline overlay on any page
• Arrow keys: Navigate results
• Enter: Open result
• Ctrl+Enter: Open in new tab
• M: Copy markdown link

🔒 PRIVACY:
All data stays on your device. Nothing is ever uploaded.

🧠 ETYMOLOGY:
Smruti (स्मृति) = Sanskrit for "memory"
Cortex = The brain's intelligence center

Made for power users who remember everything... except where they put it.
```

### 4. Visual Assets

**Required:**
- Icon: 128x128 PNG
- Screenshot: At least one (1280x800 or 640x400)

**Recommended:**
- 3-5 screenshots showing key features
- Small promo tile: 440x280 PNG
- Marquee promo: 1400x560 PNG

**Screenshot Ideas:**
1. Popup with search results
2. Inline overlay on a webpage
3. Keyboard shortcuts in action
4. Settings/debug options

### 5. Privacy Tab

- **Single purpose description**: "Search and navigate browser history"
- **Permission justifications**:
  | Permission | Justification |
  |------------|---------------|
  | history | Read browser history to build search index |
  | storage | Store indexed data and settings locally |
  | tabs | Open search results in new tabs |
  | activeTab | Access current tab for inline overlay |
  | scripting | Inject content scripts for metadata extraction |

- **Data use certification**: Certify that you don't sell data, don't use for unrelated purposes, etc.

### 6. Submit for Review

1. Review all sections are complete
2. Click **"Submit for review"**
3. Wait 1-3 business days for initial review
4. Address any feedback if rejected

---

## 🔷 Microsoft Edge Add-ons

### 1. Create Developer Account

1. Go to [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. Sign in with Microsoft account
3. Register as a developer (free)
4. Verify your identity

### 2. Submit Extension

1. Click **"Create new extension"**
2. Upload `smruti-cortex-vX.X.X.zip`
3. Fill in extension details

### 3. Extension Details

**Properties:**
- Name: SmrutiCortex
- Short description: Ultra-fast browser history search
- Category: Productivity
- Support email: your-email@example.com

**Description:** Same as Chrome Web Store

### 4. Store Listing Assets

Similar requirements to Chrome:
- Icon: 128x128 PNG
- Screenshots: 1280x800 recommended
- Privacy policy URL

### 5. Submit

1. Complete all required fields
2. Submit for certification
3. Review takes 5-7 business days typically

---

## 🔄 Update Process

### For New Versions

1. **Update version** in `package.json` and `manifest.json`
2. **Update CHANGELOG** if you have one
3. **Build and package**:
   ```bash
   npm run clean
   npm run build:prod
   npm run package
   ```
4. **Test the package** by loading unpacked
5. **Submit update** through respective dashboards

### Chrome Web Store Update

1. Go to Developer Dashboard
2. Find SmrutiCortex
3. Click "Package" tab
4. Upload new zip
5. Update version notes
6. Submit for review

### Edge Add-ons Update

1. Go to Partner Center
2. Find SmrutiCortex
3. Click "Extension overview"
4. Upload new package
5. Submit for certification

---

## 📝 Version Numbering

Follow semantic versioning:

```
MAJOR.MINOR.PATCH

Examples:
2.0.0 → 2.0.1  # Bug fix
2.0.1 → 2.1.0  # New feature
2.1.0 → 3.0.0  # Breaking change
```

**Update in:**
- `package.json` → `version`
- `manifest.json` → `version`

---

## 🚨 Common Rejection Reasons

### Chrome Web Store

| Reason | Solution |
|--------|----------|
| Missing privacy policy | Add privacy policy URL in dashboard |
| Unclear permission use | Add detailed justification for each permission |
| Insufficient description | Expand description with features and use cases |
| Low quality screenshots | Use high-res screenshots showing actual functionality |
| Code obfuscation | Use readable source maps in production |

### Edge Add-ons

| Reason | Solution |
|--------|----------|
| Missing support email | Add valid contact email |
| Icon issues | Ensure all icon sizes are present and valid |
| Manifest issues | Validate manifest.json |
| Policy violations | Review Edge's content policies |

---

## 📊 Post-Publish

### Monitoring

- **Reviews**: Respond to user reviews promptly
- **Ratings**: Monitor for issues affecting ratings
- **Analytics**: Use built-in store analytics
- **Crash reports**: Monitor for runtime errors

### Support

- Link to GitHub Issues for bug reports
- Link to Discussions for questions
- Consider a simple FAQ for common issues

---

## 📁 Files Reference

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (update version here) |
| `package.json` | npm metadata (update version here) |
| `scripts/package.mjs` | Creates store-ready zip |
| `dist/` | Built extension files |

---

*Last updated: December 2025 | SmrutiCortex v2.0*
