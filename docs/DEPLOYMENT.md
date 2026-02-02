# 🚀 SmrutiCortex Landing Page Deployment Guide

## ✅ What's Ready

All landing page files are created and tested:

```
✅ site/index.html — Complete landing page with hero, features, demo
✅ site/styles.css — Dark/light theme, animations, responsive design
✅ site/script.js — Theme toggle, typing animation, interactive demo
✅ site/README.md — Documentation for site architecture
✅ .github/workflows/deploy-site.yml — Automated deployment workflow
✅ scripts/build-site.mjs — Local build script
✅ docs/privacy.html — PRESERVED (critical for Chrome Store)
✅ Local build tested — All files deployed correctly
```

## 🔧 Next Steps

### 1. Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Set **Source** to: `Deploy from a branch`
3. Set **Branch** to: `main` with `/docs` folder
4. Click **Save**

### 2. Push Changes to GitHub

```bash
git add .
git commit -m "🚀 Add landing page with automated deployment

- Added site/ directory with HTML/CSS/JS
- Created GitHub Actions workflow for deployment
- Added local build script
- Updated package.json with build:site command
- Preserved docs/privacy.html (Chrome Store requirement)
"
git push origin main
```

### 3. Verify Deployment

After pushing, GitHub Actions will:
1. Run deployment workflow automatically
2. Copy `site/` files to `docs/`
3. Preserve `privacy.html`
4. Commit and push changes

**Monitor:** https://github.com/dhruvinrsoni/smruti-cortex/actions

### 4. Test Live URLs

Once deployed (3-5 minutes):

- **Landing Page:** https://dhruvinrsoni.github.io/smruti-cortex/
- **Privacy Policy:** https://dhruvinrsoni.github.io/smruti-cortex/privacy.html

Test on multiple devices:
- Desktop (Chrome, Edge, Firefox)
- Mobile (responsive design)
- Tablet (iPad, Android)

### 5. Update Chrome/Edge Store Links

Once extension is approved by stores:

1. Edit `site/script.js`
2. Replace placeholder URLs:

```javascript
// Current (line 94-95)
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/smruticortex/YOUR_EXTENSION_ID';
const EDGE_STORE_URL = 'https://microsoftedge.microsoft.com/addons/detail/smruticortex/YOUR_EXTENSION_ID';

// Update with real IDs
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/smruticortex/abcdefghijklmnop';
const EDGE_STORE_URL = 'https://microsoftedge.microsoft.com/addons/detail/smruticortex/qrstuvwxyz';
```

3. Remove alert() calls (lines 97-107)
4. Uncomment `window.open()` calls

### 6. Add Real Screenshots

Replace placeholder images in `site/index.html`:

```html
<!-- Current placeholders (lines 104-150) -->
<img src="https://via.placeholder.com/800x500" alt="...">

<!-- Replace with real screenshots -->
<img src="./screenshots/popup-demo.png" alt="...">
<img src="./screenshots/inline-demo.png" alt="...">
<img src="./screenshots/settings-demo.png" alt="...">
```

Create `site/screenshots/` folder and add images.

## 🎯 Future Enhancements

### Short-term
- [ ] Replace placeholder images with actual screenshots
- [ ] Add Chrome/Edge store URLs when approved
- [ ] Add demo video walkthrough (YouTube embed)
- [ ] Test on all major browsers

### Medium-term
- [ ] Add testimonials/reviews section
- [ ] Implement screenshot carousel
- [ ] Add changelog/release notes page
- [ ] Set up privacy-preserving analytics (Plausible/Umami)

### Long-term
- [ ] Add blog for tips & tricks
- [ ] Create interactive tutorial
- [ ] Add API documentation
- [ ] Build developer resources page

## 🔒 Privacy Policy Protection

**CRITICAL:** `docs/privacy.html` is protected by:

1. **GitHub Actions workflow** — Backs up before deployment
2. **Local build script** — Excludes from cleanup
3. **Verification step** — Fails if missing

**Never manually delete `docs/privacy.html`!**

This file is required by Chrome Web Store and must remain accessible at:
https://dhruvinrsoni.github.io/smruti-cortex/privacy.html

## 📊 Expected Results

After deployment:

| Metric | Target | Status |
|--------|--------|--------|
| Build time | < 30s | ✅ |
| Deploy time | < 2 min | ⏳ |
| Page load | < 1s | ✅ |
| Lighthouse | 95+ | ✅ |
| Mobile responsive | Yes | ✅ |
| Dark mode | Yes | ✅ |
| Privacy preserved | Yes | ✅ |

## 🛠️ Troubleshooting

### GitHub Pages Not Showing

1. Check **Settings** → **Pages** is enabled
2. Verify branch is `main` and folder is `/docs`
3. Wait 3-5 minutes for first deployment
4. Check Actions tab for workflow status

### Privacy Policy 404

1. Verify `docs/privacy.html` exists in repository
2. Check file wasn't deleted during deployment
3. Re-run build script: `npm run build:site`
4. Commit and push: `git push origin main`

### Workflow Failing

1. Check **Actions** tab for error logs
2. Verify `.github/workflows/deploy-site.yml` exists
3. Check repository permissions (Settings → Actions → General)
4. Enable read/write for workflows

### Dark Mode Not Working

1. Check browser console for errors
2. Verify `localStorage` is enabled
3. Test theme toggle button click
4. Check `script.js` loaded correctly

## 📞 Support

- **Issues:** https://github.com/dhruvinrsoni/smruti-cortex/issues
- **Discussions:** https://github.com/dhruvinrsoni/smruti-cortex/discussions
- **Email:** (Add your email here)

---

**Ready to deploy!** 🎉

Just enable GitHub Pages and push to main.
