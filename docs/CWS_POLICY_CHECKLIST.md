# Chrome Web Store — Listing Compliance Checklist (1-pager)

Quick pre-submission gate. Read top-to-bottom before pasting anything into the CWS dashboard.
Goal: never get rejected for metadata again. Sources linked at the bottom.

---

## 🚫 The rule that bit us (Keyword Spam / "Spam and placement")

> **Name at most 5 platforms/brands across the ENTIRE listing — and stay UNDER 5 to be safe.**

The reviewer counts brand names across **all metadata together**, not per-field:

- Description body
- "Changes in this version" / What's New
- Summary, title, developer name, screenshots captions

### ✅ Do
- Describe the *capability* generically: "jump to results on popular search engines and developer tools."
- If you must list supported sites and the list is long → **link out** (GitHub) or show them **in a screenshot**, not in text.
- Mention any single keyword **≤ 5 times** total (aim for fewer).
- Browser compatibility line ("Works on Chrome, Edge, and Firefox") is fine — it's one factual statement, not a marketing list. Counts toward the budget, so don't add more brands on top of it.

### ❌ Don't
- Enumerate "Google, YouTube, GitHub, GCP, Jira, Confluence" (that's 6 → instant reject).
- Repeat the same brand list in two sections (Web Search feature **and** prefix-modes — pick one).
- Stuff the primary function word over and over ("search… search… search…").
- Put info unrelated to the extension's core purpose in the description.

---

## 📋 Pre-submit checklist

- [ ] **Brand/platform count ≤ 4** across description **+** "Changes in this version" combined. Count them by hand.
- [ ] No brand list repeated in two places.
- [ ] No single keyword appears > 5 times.
- [ ] Description describes *what it does*, not a keyword soup. Clear, well-written prose.
- [ ] Long lists of supported sites → moved to a GitHub link or a screenshot.
- [ ] **Permissions**: every `manifest.json` permission has a Section 4 justification in the submission doc (`npm run store check` enforces this).
- [ ] **Single purpose**: the listing describes ONE narrow purpose (history search), no grab-bag of unrelated features pitched as separate products.
- [ ] **Privacy**: data-usage disclosures match what the code actually does; "no tracking / all local" claims are true.
- [ ] **No affiliation implied**: don't imply Google/any brand endorses or partners with the extension.
- [ ] **Icon/screenshots/title**: descriptive, not misleading, no excessive text overlay or unrelated imagery.
- [ ] Run `npm run store check` — passes.

---

## 🩹 If rejected for metadata

1. Read the violation ID + the exact quoted text. The quoted words ARE the problem.
2. Count platforms across **all** fields, not just the description.
3. Generalize + link out. Re-count. Get under 5.
4. Fix the submission doc fence **and** the "Changes in this version" guidance (both feed the live listing).
5. Re-paste the **entire** description (replace, don't patch) so the live listing can't keep stale brand lines.
6. Resubmit. Appeal only if you genuinely believe it's compliant — and lead with "honest mistake, here's the fix."

---

## 🔗 References
- Program Policies — Spam & placement: https://developer.chrome.com/docs/webstore/program-policies/spam
- Keyword spam FAQ: https://developer.chrome.com/docs/webstore/program-policies/spam-faq#keyword-spam
- Best practices for listings: https://developer.chrome.com/docs/webstore/best-practices
- Our deep playbook: `.github/skills/store-policy/SKILL.md`
- Permission discipline: `CLAUDE.md` → "Manifest Permission Discipline"
