SmrutiCortex v8.0.0 — Release Notes
=====================================

Release tag: v8.0.0

Overview
--------
Major feature release with comprehensive performance optimizations and UX improvements based on user feedback from Chrome Web Store.

**Key Theme**: "Show, Don't Search" - Making history instantly accessible with smart defaults.

Highlights
----------

### 🎯 **Default Recent History Display** (User-Requested Feature)
- **Show results immediately on popup open** - no search needed!
- Displays 50 most recent browsing entries by default (configurable)
- Works seamlessly with sorting options (recent, most-visited, alphabetical, etc.)
- Matches Chrome's native history/bookmarks UX pattern
- Clearing search input returns to recent history view
- **User Impact**: Instant access to recent pages without typing - perfect for quick navigation

### ⚡ **Performance Optimizations**

**Phase 1: Bundle & Search Optimization**
- **LRU search cache**: Repeated queries are now instant (100 entries, 5-min TTL)
- **Tree shaking & dead code elimination**: Smaller bundle sizes, faster loads
- **Database pagination**: Efficient cursor-based batching for large history datasets
- **Memory leak fixes**: Proper cleanup in content scripts (overlay disposal on page unload)

**Phase 2: AI/ML Improvements**
- **AI keyword expansion cache**: 5-minute TTL reduces LLM calls by ~80%
- **Batch embedding generation**: Process 10 items in parallel (3x faster)
- **Model warm-up**: Pre-load AI models on service worker init (eliminates first-query delay)

**Phase 3: CI/CD & Monitoring**
- **Performance monitoring workflow**: Bundle size tracking, regression detection
- **Security scanning workflow**: npm audit, secret detection, manifest validation
- **Staging deployment workflow**: Automated builds from develop branch

**Phase 4: Testing Infrastructure**
- **Performance benchmark script**: Automated bundle size and search latency tests
- **GitHub Actions integration**: Zero-management-overhead workflows (no tokens needed)

### 🐛 **Bug Fixes**
- Fixed Ctrl+A and native text shortcuts in search input (Ctrl+C, Ctrl+V, Ctrl+Backspace now work)
- Fixed stopPropagation blocking browser shortcuts in overlay search box
- Fixed ESLint warnings in database.ts (unused generator, unused variables)

### 🏗️ **Architecture Improvements**
- New `getRecentIndexedItems()` function in database layer with lastVisit index
- New `GET_RECENT_HISTORY` message handler in messaging layer
- Enhanced popup initialization to load recent history asynchronously
- New `defaultResultCount` setting (default: 50, range: 1-200)

Bundle Sizes (Production Build)
--------------------------------
```
service-worker:     76.70 KB  (includes AI, caching, warm-up)
extractor:           1.76 KB  (metadata extraction)
quick-search:       28.81 KB  (inline overlay)
popup:              40.11 KB  (extension popup)
────────────────────────────────────────────────
Total:             ~147 KB   (minified, optimized)
```

Performance Metrics
-------------------
- **Popup open → input focus**: <50ms (overlay) / 200-800ms (popup)
- **Search cache hit**: <5ms (instant repeat searches)
- **AI cache hit**: <10ms (vs 1-3s cold LLM call)
- **Memory footprint**: Stable (no leaks in content scripts)
- **Bundle size reduction**: ~8% smaller (tree shaking + dead code elimination)

Breaking Changes
----------------
- None - fully backward compatible

Migration Notes
---------------
- No migration steps required
- New settings will use defaults automatically
- Existing users will see recent history on next popup open

New Settings
------------
- **defaultResultCount**: Number of recent results shown on popup open (default: 50, range: 1-200)

User Feedback Addressed
------------------------
This release directly addresses user feedback from Chrome Web Store:
> "Would be great to see some results by default when opening the extension, like how Chrome's history works"

Contributors
------------
- dhruvinrsoni

Technical Details
-----------------
**Git Workflow**: Developed in `develop` branch with atomic thematic commits:
1. `perf(db): implement batch collection helper and fix lint warnings`
2. `perf(search): add LRU search cache and integrate cache in search engine`
3. `perf(ai): add AI expansion cache, batch embedding generation, and model warm-up`
4. `fix(content): cleanup overlay memory leaks and allow native text shortcuts`
5. `ci: add performance, security, and staging workflows`
6. `feat(popup): show recent history by default on popup open`
7. `chore: bump version to 8.0.0`

For detailed commit history, see: [GitHub Releases](https://github.com/dhruvinrsoni/smruti-cortex/releases)

Known Issues
------------
- None at this time

Next Steps (v9.0.0 Planning)
-----------------------------
- Enhanced AI-powered query suggestions
- Favicon caching for offline performance
- Theme customization (light/dark/auto)
- Export/import history index

---
Released: February 2026
