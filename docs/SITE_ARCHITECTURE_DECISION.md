# Documentation vs Site Folder Analysis

## Current Architecture

```
SmrutiCortex/
├── site/               # Source files (editable)
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── privacy.html
│   └── screenshots/
└── docs/              # Deployment target (GitHub Pages)
    ├── index.html     (copied from site/)
    ├── styles.css     (copied from site/)
    ├── script.js      (copied from site/)
    ├── privacy.html   (preserved, never deleted)
    └── screenshots/   (copied from site/)
```

**Workflow:** Edit files in `site/` → Deploy workflow copies to `docs/` → GitHub Pages serves from `docs/`

---

## Question: Should we keep code in `docs/` folder only?

Your consideration: Maintaining two folders might be redundant. Why not work directly in `docs/`?

---

## Option Analysis

### Option 1: Current (site/ → docs/) ✅ RECOMMENDED

#### Pros
1. **Clear Separation of Concerns**
   - `site/` = editable source
   - `docs/` = deployment target (treat as build artifact)
   - Mentally aligns with "src → dist" pattern

2. **Git History Clarity**
   - Changes to `site/` are intentional edits
   - Changes to `docs/` are automated deployments
   - Easy to see "what changed" vs "what was deployed"

3. **Prevents Accidental Edits**
   - Developers won't accidentally edit deployed files
   - Clear: "edit site/, never touch docs/"

4. **Deployment Flexibility**
   - Can add build steps (minification, optimization, preprocessing)
   - Can generate additional files (screenshots index, sitemap)
   - Can have different content in source vs deployed (dev notes, TODOs)

5. **Rollback Safety**
   - Can revert `docs/` without affecting `site/` source
   - Can test changes locally in `site/` before deploying

6. **Build Process Extensibility**
   - Already uses `scripts/generate-screenshots-index.mjs`
   - Can add SASS/SCSS compilation
   - Can add image optimization
   - Can add HTML/CSS/JS minification
   - Can add asset fingerprinting

#### Cons
1. **Folder Duplication**
   - Similar files exist in two places
   - Slightly more disk space (~few KB)

2. **Deploy Step Required**
   - Must run workflow to see changes live
   - Can't edit docs/ directly for quick fixes

#### Current Implementation Details
- Privacy policy has failsafe backup (prevents Chrome Web Store URL breakage)
- Screenshot index generation is optional (non-fatal)
- Deploy is path-filtered (only runs when `site/**` changes)
- Commit message includes `[skip ci]` to prevent loop

---

### Option 2: Direct Work in docs/ ❌ NOT RECOMMENDED

**Architecture:**
```
SmrutiCortex/
└── docs/              # Both source AND deployment
    ├── index.html     (edit directly, commit, push)
    ├── styles.css
    ├── script.js
    └── privacy.html
```

#### Pros
1. **Simplicity**
   - Only one folder to maintain
   - Edit and commit directly
   - No deploy workflow needed

2. **Faster Iteration**
   - Changes go live immediately on push
   - No intermediate workflow step

#### Cons
1. **No Separation of Concerns**
   - Source and deployment mixed
   - Harder to distinguish intentional changes from artifacts

2. **No Build Pipeline**
   - Can't add preprocessing (SASS, minification)
   - Can't generate files (screenshot index)
   - Can't optimize assets

3. **Git History Noise**
   - Every tiny edit creates a deployment commit
   - Hard to track "what changed" in source

4. **No Safety Net**
   - Accidental edits go live immediately
   - Can't test locally before deploying
   - Privacy policy backup mechanism would be lost

5. **Workflow Limitations**
   - Can't preserve/backup critical files (privacy.html)
   - Can't clean directory before deploy
   - Can't verify deployment integrity

6. **GitHub Pages Constraints**
   - Must use `/docs` for GitHub Pages (no choice)
   - Can't use root `/` unless we rename project structure
   - Confusing: "docs" suggests documentation, not website source

---

### Option 3: Hybrid (site/ with docs/ symlink) ⚠️ COMPLEX

**Architecture:**
```
SmrutiCortex/
├── site/              # Editable source
└── docs/ → site/      # Symlink to site/
```

#### Pros
- Maintains single source of truth
- GitHub Pages still sees `docs/`

#### Cons
- **Git doesn't handle symlinks well** (especially on Windows)
- Confusing for contributors
- GitHub Pages may not follow symlinks
- Breaks cross-platform compatibility
- Adds complexity for minimal benefit

---

### Option 4: Use Root / for GitHub Pages ⚠️ PROJECT RESTRUCTURE

**Architecture:**
```
SmrutiCortex/          # Root serves as GitHub Pages
├── index.html         (website)
├── styles.css
├── script.js
├── privacy.html
├── src/               (extension code)
├── dist/              (extension build)
└── scripts/
```

#### Pros
- No docs/ or site/ folder
- Clean root directory

#### Cons
- **Mixes website with extension codebase**
- Root directory becomes cluttered
- GitHub Pages settings default to `/docs` branch for good reason
- Violates project organization principles
- READMEs, LICENSE, package.json visible to website
- Terrible separation of concerns

---

## Detailed Recommendation: Keep Current Architecture ✅

### Why site/ → docs/ is BEST

1. **Industry Standard Pattern**
   - Follows "source → build" convention
   - Similar to: `src → dist`, `pages → public`, `app → build`
   - Familiar to developers

2. **Future-Proof Extensibility**
   - Easy to add build tools later
   - Can add preprocessing without breaking workflow
   - Can add multiple deployment targets (staging/prod)

3. **Clear Mental Model**
   - "Edit source in site/"
   - "Deployment happens in docs/"
   - "Never manually edit docs/"

4. **Existing Infrastructure**
   - Deploy workflow already sophisticated (privacy backup, verification)
   - Screenshot generator already integrated
   - Path filtering prevents unnecessary runs

5. **Minimal Maintenance Cost**
   - Workflow is stable and self-healing
   - No manual intervention needed
   - Disk space cost negligible (~10KB)

---

## Alternative: Optimize Current Architecture

Instead of consolidating folders, **enhance** the current setup:

### Enhancement 1: Add Build Steps
Add minification and optimization:

```yaml
# In deploy-site.yml
- name: Optimize assets
  run: |
    # Minify HTML
    npx html-minifier-terser site/index.html -o docs/index.html --collapse-whitespace
    
    # Minify CSS
    npx clean-css-cli site/styles.css -o docs/styles.css
    
    # Minify JS (terser is fast)
    npx terser site/script.js -o docs/script.js -c -m
    
    # Optimize images
    npx imagemin site/screenshots/*.{jpg,png} --out-dir=docs/screenshots
```

**Benefit:** Deployed site is faster, source remains readable.

### Enhancement 2: Add Staging Environment
Deploy to a staging branch first:

```yaml
# New workflow: deploy-site-staging.yml
on:
  push:
    branches: [develop]
    paths: ['site/**']

# Deploys site/ → gh-pages-staging branch
# View at: https://dhruvinrsoni.github.io/smruti-cortex-staging/
```

**Benefit:** Test site changes before production.

### Enhancement 3: Local Preview Server
Add npm script for local development:

```json
{
  "scripts": {
    "site:dev": "npx live-server site/ --port=8080 --no-browser",
    "site:preview": "npx live-server docs/ --port=8081 --no-browser"
  }
}
```

**Benefit:** See changes locally before deploying.

---

## Decision Matrix

| Criteria | site/ → docs/ | Direct docs/ | Root / Pages |
|----------|---------------|--------------|--------------|
| Separation of Concerns | ✅ Excellent | ❌ Poor | ❌ Terrible |
| Extensibility | ✅ High | ❌ Limited | ❌ None |
| Build Pipeline Support | ✅ Yes | ❌ No | ❌ No |
| Git History Clarity | ✅ Clear | ⚠️ Mixed | ❌ Cluttered |
| Maintenance | ✅ Low | ✅ Lower | ❌ High |
| Safety (rollback, testing) | ✅ High | ❌ Low | ❌ Very Low |
| Industry Standard | ✅ Yes | ⚠️ Uncommon | ❌ Anti-pattern |
| Disk Space | ⚠️ +10KB | ✅ Minimal | ✅ Minimal |
| Setup Complexity | ✅ Done | ✅ Simple | ❌ Complex |

---

## Final Recommendation

**KEEP the current `site/ → docs/` architecture.**

### Rationale
1. The current setup is already implemented and working
2. Deploy workflow is sophisticated and reliable
3. Provides clear separation that scales well
4. Follows industry best practices
5. Enables future enhancements (minification, optimization)
6. Privacy policy failsafe is critical and working
7. Disk space cost (<10KB) is negligible
8. You have one less place to accidentally break production

### What You Gain
- **Build pipeline ready:** Add minification, optimization, preprocessing anytime
- **Staging environment:** Easy to add a staging deploy
- **Rollback safety:** Can revert docs/ without losing source
- **Clear git history:** Source changes vs deployments are distinct
- **Developer safety:** Can't accidentally edit deployed files

### What You "Lose"
- ~10KB of disk space (two copies of small HTML/CSS/JS files)
- One extra folder in repository structure

**Trade-off:** Minimal cost for significant architectural benefits.

---

## Action Items

**Keep current architecture** and optionally add enhancements:

1. ✅ **No change needed** - current setup is optimal
2. 🔧 **Optional:** Add minification to deploy workflow (5 lines)
3. 🔧 **Optional:** Add local dev server npm script (1 line)
4. 🔧 **Optional:** Add staging environment workflow (copy of deploy-site.yml)
5. 📝 **Document:** Add "Local Development" section to site/ README

**Estimated maintenance:** 0 hours/month (current), +30 minutes if all enhancements added.

---

## Comparison with Other Projects

### Popular GitHub Pages Patterns

**Jekyll (most common):**
```
_site/ → gh-pages branch
```

**Docusaurus:**
```
docs/ → build/ → gh-pages
```

**Next.js:**
```
pages/ → out/ → gh-pages
```

**Vue/React:**
```
src/ → dist/ → gh-pages
```

**SmrutiCortex:**
```
site/ → docs/ (in-repo, main branch)
```

**Observation:** All major frameworks use source → build pattern. SmrutiCortex's approach is standard.

---

**Conclusion:** The current `site/ → docs/` architecture is the right choice and should be maintained.

---

**Last Updated:** February 13, 2026
