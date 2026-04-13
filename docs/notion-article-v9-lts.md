# SmrutiCortex: From Idea to LTS — The Full Journey

*A developer's retrospective on building a privacy-first browser history search extension*

---

## 1. The Spark

Browser history search is broken. Every browser ships with a history page that can barely find what you're looking for. You type a keyword, get a chronological dump of URLs, and pray you recognize the right one. And if you want something smarter? The alternatives ship your browsing data to the cloud.

I wanted something different: a search engine that lives entirely on your machine, searches your history as fast as you can type, and never sends a single byte to any server. That's how SmrutiCortex was born.

The name is Sanskrit — *Smruti* (memory) + *Cortex* (brain). A memory cortex for your browser.

---

## 2. The Build

**Stack decisions were deliberate:**
- **TypeScript** — Type safety from day one. No runtime type errors, no guessing.
- **Chrome Manifest V3** — Future-proof from the start, even though MV3 was painful (ephemeral service workers, no persistent background pages).
- **esbuild** — Blazing fast builds (~5s dev, ~10s prod). Webpack would have been 10x slower.
- **Vitest** — Fast, ESM-native test runner that plays well with TypeScript and mocking Chrome APIs.

**Architecture choices that shaped everything:**
- **9 independent scorers** — Each scoring dimension (title, URL, recency, visit count, etc.) is an isolated module. Change one without touching the rest. The search engine composes them.
- **Service worker** — Chrome MV3's biggest constraint. Ephemeral by design, so every state must be recoverable. IndexedDB for persistence, `chrome.storage.local` for settings, and a self-healing resilience module for graceful recovery.
- **Shadow DOM overlay** — The quick-search overlay (Ctrl+Shift+S) injects into any webpage without breaking its styles. Closed Shadow DOM means total CSS isolation.

**The search algorithm — "Vivek Search":**
A graduated multi-token scoring system with intent-priority ranking. Not a simple substring match — it classifies matches into 4 tiers (EXACT, PREFIX, SUBSTRING, NONE), applies post-score boosters for strong multi-field matches, and ranks by coverage intent. The result: the page you're looking for is almost always in the top 3.

---

## 3. The AI Chapter

Adding local AI was a leap of faith. I integrated Ollama — a local LLM runtime — to bring synonym expansion and semantic search to browser history. All on-device, zero cloud.

**How it works:**
- Type "machine learning" and AI expands to also search "ML", "deep learning", "neural networks"
- Embeddings stored locally in IndexedDB for fast retrieval
- Circuit breaker pattern prevents overloading a slow Ollama instance
- Graceful degradation: if Ollama is off, search works fine without it

**Why local-only AI matters:**
Your browsing history is deeply personal. It reveals your interests, your work, your health concerns, your finances. No AI provider should see that data. With Ollama, the model runs on your CPU/GPU. The data never leaves your machine.

---

## 4. The UI Evolution

Building UI inside a Chrome extension popup is an exercise in constraint. The popup has a fixed maximum height of ~600px. Every pixel counts.

**The journey:**
- **Popup** — Clean search box, instant results, tabbed settings modal. Fought CSS battles for vertical space optimization.
- **Quick-search overlay** — Shadow DOM-powered overlay on any webpage. Ctrl+Shift+S opens it. Added drag-to-resize handles with persisted dimensions.
- **Command palette** — The crown jewel. Type `/` for commands, `>` for power commands, `@` to switch tabs (including recently closed tabs), `#` to search bookmarks, `??` for web search, `?` for help. Your keyboard becomes a remote control for the browser.
- **Toggle chip bar** — Quick-toggle settings (AI, bookmarks, duplicates) without opening the settings modal.
- **Theme support** — Dark, light, and auto (follows system preference).

The CSS battles were real. Making a resizable popup that works across Chrome's constraints, supporting both split and unified scrolling, ensuring the search bar stays fixed while results scroll — each took multiple iterations.

---

## 5. The Quality Journey

From zero tests to 1,233 unit tests + 45 E2E tests. This is the part I'm most proud of.

**The numbers:**
- 1,233 unit tests across 46 Vitest test files
- 45 end-to-end tests across 7 Playwright spec files
- 90%+ line coverage maintained throughout
- 7 CI workflows (build, lint, security, E2E, quality report, etc.)
- Pre-commit hooks that run full build + test suite before every commit

**Why it matters:**
Every test is a guardrail. When you have 60+ settings, 9 scorers, 45+ browser commands, and a command palette with multiple modes — you need confidence that a change in one place doesn't break something in another. The test suite gave me the confidence to refactor fearlessly.

**Chrome API mocking:**
The hardest part of testing a Chrome extension is that `chrome.*` APIs don't exist in Node.js. We built a shared test utility library (`src/__test-utils__/`) with composable Chrome API mocks, Logger mocks, Settings mocks, data factories, and lifecycle helpers. Any new test can set up a realistic Chrome environment in 3 lines.

---

## 6. The Permission Economy

Publishing a Chrome extension teaches you hard lessons about permissions. Chrome Web Store reviewers scrutinize every permission you declare. You need to justify each one — not just why you declared it, but exactly which API call uses it, what user action triggers it, and why the feature cannot work without it.

SmrutiCortex v9.0.0 declares 12 permissions:

**9 required permissions** — granted at install:
- `history`, `bookmarks`, `storage`, `tabs`, `alarms`, `scripting`, `activeTab`, `sessions`, `windows`

**3 optional permissions** — never granted at install, only requested when the user explicitly opts in:
- `tabGroups`, `browsingData`, `topSites`

The optional permissions follow Chrome's recommended pattern for progressive permission escalation. They power "Advanced Browser Commands" — 45+ tab group, browsing data, and power-user commands in the command palette. The user has to manually toggle the setting ON, which triggers `chrome.permissions.request()`. If they deny, the feature stays off. Every API call is gated behind `chrome.permissions.contains()`.

The lesson: don't shy away from permissions you need. Justify them properly. State what user action triggers the API, what it does for the user, and why the feature breaks without it. Reviewers respect directness. They reject vagueness.

---

## 7. The LTS Decision

After months of active development, I made a deliberate decision: stop. Not because there's nothing left to build, but because the extension is feature-complete, stable, and ready for long-term use.

**The stabilization roadmap:**
1. **Bug hunting** — Fixed unhandled promise rejections, listener leaks, Chrome runtime.lastError warnings, CSP violations
2. **Dead code removal** — Pruned unused exports, duplicate test files, unnecessary dependencies
3. **Silent catch elimination** — Replaced 60+ `.catch(() => {})` with meaningful logging
4. **Build guardrails** — Two-layer defense against Chrome MV3 naming restrictions
5. **Documentation sync** — CLAUDE.md, CHANGELOG.md, maintenance SKILL.md all accurate
6. **v9.0.0 release** — The LTS milestone

---

## 8. The License Story

SmrutiCortex started as Apache-2.0 (fully open source). As the project matured — especially the search algorithm, scoring system, and AI integration — I reconsidered.

**The decision: BSL-1.1 (Business Source License)**
- The code is **source-available** — anyone can read, study, and learn from it
- Free for **non-commercial, personal, educational, or evaluation** use
- On **April 1, 2030**, it automatically converts to Apache-2.0
- This protects the intellectual property while keeping the code inspectable

Why not stay fully open? Because someone could fork the repo, wrap it with a nicer UI, and sell it — profiting from years of careful algorithm design without contributing back. BSL-1.1 prevents that while still letting individuals use and learn from the code freely.

---

## 9. By the Numbers

| Metric | Value |
|--------|-------|
| Unit tests | 1,233 |
| Test files | 46 |
| E2E tests | 45 |
| Playwright specs | 7 |
| CI workflows | 7 |
| Search scorers | 9 |
| Settings | 60+ |
| Command palette commands | 45+ |
| Prefix modes | 6 |
| Required permissions | 9 |
| Optional permissions | 3 |
| Telemetry sent | Zero |
| Cloud dependencies | Zero |
| Data that leaves your device | None |
| License | BSL-1.1 → Apache-2.0 (2030) |

---

## 10. Closing — "Antah Asti Prarambha"

*In the end, there is a beginning.*

SmrutiCortex v9.0.0 marks the close of active development. The code is stable. The extension is published. The test suite is comprehensive. The documentation is complete.

But the door stays open. The search algorithm can be refined. New scorers can be added. The AI integration can deepen. When the time is right, the next chapter will begin.

For now, I'm proud of what this project represents: a fully functional, privacy-first, well-tested Chrome extension built with care, tested with rigor, and released with intention.

If you're a developer reading this — the codebase is there to learn from. 1,233 tests, clean architecture, isolated scorers, a self-healing service worker, Shadow DOM overlays, command palette infrastructure. It's all documented.

Thank you for following this journey.

— *Dhruvin Rupesh Soni*

---

---

# LinkedIn Post

**SmrutiCortex v9.0.0 — LTS Release**

After months of building, testing, and refining, I'm closing the active development chapter of SmrutiCortex — my privacy-first browser history search extension.

The numbers tell the story:
- 1,233 unit tests + 45 E2E tests
- 9 independent search scorers
- 45+ browser commands via command palette
- 60+ configurable settings
- 12 Chrome permissions — each justified line-by-line for Chrome Web Store review
- Zero telemetry. Zero cloud. 100% local.

What started as frustration with browser history search became a deep dive into Chrome MV3 architecture, search algorithm design, local AI integration with Ollama, and building production-grade software with comprehensive test coverage.

Key decisions that shaped the project:
→ TypeScript + esbuild for speed and safety
→ Shadow DOM overlay for CSS-isolated quick search
→ BSL-1.1 license (converts to Apache-2.0 in 2030)
→ Local-only AI — your browsing data never leaves your machine
→ Optional permissions pattern — 3 permissions only requested when the user opts in

"Antah Asti Prarambha" — In the end, there is a beginning. The code is stable, the extension is published, and the door stays open for what comes next.

Full journey article: [link to Notion article]

#ChromeExtension #TypeScript #Privacy #OpenSource #SoftwareEngineering #AI #BrowserHistory
