# SmrutiCortex Landing Page

**Live URL:** <https://dhruvinrsoni.github.io/smruti-cortex/>

This directory (`docs/`) is the **single source of truth** for the SmrutiCortex landing page. Edit files here directly — GitHub Pages serves this folder from the `main` branch automatically. No build step, no sync workflow needed.

## 🏗️ Structure

```
docs/
  ├── index.html              ← Landing page
  ├── styles.css              ← Styling & animations
  ├── script.js               ← Interactivity & theme toggle
  ├── tour.html               ← Feature tour page
  ├── tour.js                 ← Tour interactivity
  ├── tour.css                ← Tour styling
  ├── demo.html               ← Interactive demo
  ├── demo.js                 ← Demo functionality
  ├── demo.css                ← Demo styling
  ├── privacy.html            ← CRITICAL: Chrome Web Store URL — never delete
  ├── assets/                 ← Icons
  └── screenshots/            ← Extension screenshots
```

## 🚀 Deployment

GitHub Pages serves `docs/` from `main` directly. To publish changes:

```bash
git add docs/
git commit -m "Update landing page"
git push origin main
```

That's it. No workflow, no build step.

## 🔒 Privacy Policy Protection

`docs/privacy.html` is linked from Chrome Web Store and **must never be deleted**.

Protection mechanisms:
- `.github/CODEOWNERS` requires repo owner review for any PR that touches `docs/privacy.html`

**Privacy URL:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html

## 📝 Editing Guide

1. Edit files directly in `docs/`
2. Preview by opening `docs/index.html` in a browser
3. Push to `main` to deploy

## 🎨 Features

- **Dark/Light Theme Toggle** — Persists via localStorage
- **Typing Animation** — Live search demo in hero section
- **Interactive Demo** — `demo.html` with live walkthrough
- **Feature Tour** — `tour.html` with step-by-step guide
- **Smooth Animations** — Fade-in effects on scroll
- **Responsive Design** — Mobile-first with 768px breakpoint
- **SEO Optimized** — Meta tags, Open Graph, structured data
- **Zero Build Step** — Pure HTML/CSS/JS for instant updates

## 🛠️ Tech Stack

- **HTML5** — Semantic markup
- **CSS3** — Custom properties, animations, grid/flexbox
- **Vanilla JS** — No frameworks, zero dependencies
- **GitHub Pages** — Static site hosting from `docs/`

## 🔗 Links

- **Live Site:** https://dhruvinrsoni.github.io/smruti-cortex/
- **Privacy Policy:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html
- **GitHub Repo:** https://github.com/dhruvinrsoni/smruti-cortex
- **Chrome Store:** https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi

---

**Made with ❤️ by dhruvinrsoni**
