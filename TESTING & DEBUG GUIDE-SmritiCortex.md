# TESTING & DEBUG GUIDE — SmritiCortex

This document is the single place for developers and maintainers to build, load, test, and debug SmritiCortex locally. It includes steps for common issues and verification checks.

---

## Prerequisites
- Node.js (LTS recommended: 18.x or later)
- npm (comes with Node)
- Chrome or Edge (Chromium) for MV3 testing
- Optional: Firefox (some MV3 features may need adjustments)
- Recommended: Visual Studio Code (or similar)

---

## Local dev workflow summary
1. Clone repository
2. `npm install`
3. `npm run build:dev` (or `npm run build` for production)
4. Load unpacked extension into Chrome via `chrome://extensions`
5. Use extension and follow debug checklist

---

## npm scripts (what they do)
- `npm run build` — production build (minified) to `dist/`
- `npm run build:dev` — development build (non-minified) with source maps
- `npm run clean` — remove `dist/` artifacts
- `npm run lint` — run ESLint
- `npm run test` — run unit tests (if available)

> Full `package.json` with these scripts is provided in root.

---

## Building the extension
```bash
# from repo root
npm install
npm run build