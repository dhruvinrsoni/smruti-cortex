# SmrutiCortex Landing Page

**Live URL:** https://dhruvinrsoni.github.io/smruti-cortex/

This directory contains the source files for the SmrutiCortex landing page. The site is built with vanilla HTML/CSS/JS for zero-maintenance deployment.

## 🏗️ Architecture

```
site/               ← Source files (edit here)
  ├── index.html    ← Landing page structure
  ├── styles.css    ← Styling & animations
  └── script.js     ← Interactivity & theme toggle

docs/               ← Deployment target (GitHub Pages)
  ├── privacy.html  ← CRITICAL: Never delete this file
  ├── index.html    ← Auto-deployed from site/
  ├── styles.css    ← Auto-deployed from site/
  └── script.js     ← Auto-deployed from site/
```

## 🚀 Deployment

### Automated (Recommended)

Every push to `main` that changes files in `site/` triggers automatic deployment:

```bash
git add site/
git commit -m "Update landing page"
git push origin main
```

GitHub Actions will:
1. Backup `docs/privacy.html` 🔒
2. Clean `docs/` directory
3. Copy `site/*` to `docs/`
4. Restore `privacy.html`
5. Commit and push changes

**Workflow:** `.github/workflows/deploy-site.yml`

### Manual Build

Test locally before pushing:

```bash
npm run build:site
```

This copies `site/` → `docs/` while preserving `privacy.html`.

Open `docs/index.html` in browser to preview.

## 🎨 Features

- **Dark/Light Theme Toggle** — Persists via localStorage
- **Typing Animation** — Live search demo in hero section
- **Interactive Demo Tabs** — Show popup, inline overlay, settings
- **Smooth Animations** — Fade-in effects on scroll
- **Responsive Design** — Mobile-first with 768px breakpoint
- **SEO Optimized** — Meta tags, Open Graph, structured data
- **Zero Build Step** — Pure HTML/CSS/JS for instant updates

## 🔒 Privacy Policy Protection

**CRITICAL:** The file `docs/privacy.html` is required by Chrome Web Store and must NEVER be deleted.

All deployment scripts (automated & manual) are designed to preserve this file:
- GitHub Actions workflow backs up before deployment
- `build-site.mjs` excludes from cleanup
- Verification step fails if privacy.html is missing

**Privacy URL:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html

## 📝 Editing Guide

### Update Content

1. Edit `site/index.html` for structure/content
2. Edit `site/styles.css` for styling
3. Edit `site/script.js` for functionality

### Test Changes

```bash
# Build locally
npm run build:site

# Open in browser
open docs/index.html  # macOS
start docs/index.html # Windows
```

### Deploy

```bash
git add site/
git commit -m "✨ Update landing page"
git push
```

GitHub Actions handles the rest automatically.

## 🎯 Future Enhancements

- [ ] Add real Chrome/Edge store URLs (currently shows "Coming Soon")
- [ ] Replace placeholder images with actual screenshots
- [ ] Add demo video walkthrough
- [ ] Implement screenshot carousel/slideshow
- [ ] Add testimonials section
- [ ] Integrate analytics (privacy-preserving)
- [ ] Add blog/changelog section

## 🛠️ Tech Stack

- **HTML5** — Semantic markup
- **CSS3** — Custom properties, animations, grid/flexbox
- **Vanilla JS** — No frameworks, zero dependencies
- **GitHub Pages** — Static site hosting from `docs/`
- **GitHub Actions** — Automated CI/CD pipeline

## 📊 Performance

- **First Contentful Paint:** < 1s
- **Time to Interactive:** < 2s
- **Lighthouse Score:** 95+ (all categories)
- **Size:** < 50KB total (HTML+CSS+JS)

## 🔗 Links

- **Live Site:** https://dhruvinrsoni.github.io/smruti-cortex/
- **Privacy Policy:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html
- **GitHub Repo:** https://github.com/dhruvinrsoni/smruti-cortex
- **Chrome Store:** https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi
- **Edge Store:** https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi

---

**Made with ❤️ by dhruvinrsoni**
