---
name: store-policy
description: Chrome Web Store program-policy compliance for listing metadata (description, "Changes in this version", summary, title, screenshots) and single-purpose/affiliation rules. Load BEFORE editing any store-facing copy or preparing a CWS submission.
---

# Chrome Web Store Policy Compliance

Load this skill whenever you touch **store-facing metadata** — the description, summary,
title, "Changes in this version" text, screenshots/captions, developer name, or any
`docs/store-submissions/*.md` file. This is the counterpart to the **Manifest Permission
Discipline** in `CLAUDE.md` (which covers permissions). This skill covers **metadata & content**.

One-page operator checklist: `docs/CWS_POLICY_CHECKLIST.md`. This skill is the detailed "why".

---

## History: why this skill exists

- **v9.2.0** — shipped the `idle` permission with no Section 4 justification → reject. Fixed by the permission-parity gate.
- **v9.5.0** — rejected for **Keyword Spam / "Spam and placement"**. The listing enumerated six platforms across its metadata: **Google, YouTube, GitHub, GCP, Jira, Confluence**. CWS rule: **no more than 5 platforms/brands named across the whole listing.** Fixed by generalizing the Web Search copy and removing the Jira mention from "Changes in this version."

Both were honest mistakes that a checklist prevents. Don't relearn them.

---

## The keyword-spam rules (the ones that reject us)

The reviewer counts brand/platform names and keyword frequency **across ALL listing
metadata combined** — description + "Changes in this version" + summary + title + screenshot
captions. Not per-field.

1. **Platform/brand lists: ≤ 5 total, and stay under 5.** Listing 6 supported sites is an
   instant reject. For longer lists, **link out** (GitHub) or put them **in a screenshot** —
   never enumerate in text.
2. **Keyword frequency: a single word ≤ 5 times** (aim lower). Don't repeat the primary
   function word ("search… search… search…") to game ranking.
3. **No irrelevant content.** Everything in the description must relate to the extension's
   core purpose. No tangential filler (team stats, industry background, SEO bait).
4. **Don't duplicate the same brand list in two sections.** We had Google/YouTube/GitHub in
   both the "Web Search" feature line AND the prefix-modes line. Pick one, generalize the other.

### The safe pattern (what we ship now)

- Web Search feature: *"Jump straight to the results page on popular search engines and
  developer tools, right from the palette."* — **zero brand names.**
- Prefix mode: *"`??` — Web search (jump to results on popular engines and developer tools)."*
- Browser compatibility: *"Works on Chrome, Edge, and Firefox."* — one factual line, 3 brands.
  This is accepted (it's a compatibility statement, not a marketing list) but it **counts toward
  the budget**, so don't pile more brands on top.
- Full engine list (Google, YouTube, GitHub, GCP, Jira, Confluence) lives in the **code**
  (`src/shared/web-search.ts`), the **GitHub README**, and **screenshots** — never the listing text.

---

## Other policies to keep clear of (broader than keyword spam)

| Policy area | The trap | Our stance |
|---|---|---|
| **Single purpose** | Pitching unrelated features as if the extension does many things. | One purpose: instant local browser-history search. Palette/web-search/AI are *facets* of that, framed as such. |
| **Permissions / least privilege** | Permission in manifest with no justification, or broader scope than needed. | Enforced by `npm run store check` + pre-commit perm-parity gate. See `CLAUDE.md`. |
| **User data / privacy** | Claiming "no tracking" while sending data out; missing data-usage disclosures. | True: all data local in IndexedDB, zero telemetry. Disclosures must match code. |
| **Affiliation / impersonation** | Implying Google/any brand endorses or partners with us. | Never imply endorsement. Brands are referenced only as search targets/compatibility. |
| **Misleading metadata** | Title/icon/screenshots that misrepresent function; excessive text on images. | Descriptive, accurate, minimal overlay text. |
| **Deceptive install/behavior** | Surprise behavior, injected ads, redirect on install. | None. Onboarding welcome page is opt-in-friendly and disclosed. |

---

## Workflow: editing listing copy

1. **Before editing**, read `docs/CWS_POLICY_CHECKLIST.md`.
2. Edit the **description fence** in the latest `docs/store-submissions/vX.Y.Z-chrome-web-store.md`
   (the verbatim-paste source of truth).
3. **Also** fix the "Changes in this version" guidance block in the same doc — it feeds a
   separate CWS field that the reviewer counts.
4. **Count brand/platform names by hand** across description + "Changes in this version".
   Target ≤ 4. If a list is long, link out or use a screenshot.
5. When updating the live listing, **re-paste the entire description** (replace, don't patch) so
   stale brand-laden lines can't survive in the live listing.
6. Run `npm run store check` (permission parity + listing freshness) before resubmitting.

---

## Quick self-audit grep

Before any submission, scan the submission doc for clustered brand names:

```
rg -i "google|youtube|github|gcp|jira|confluence|gitlab|slack|notion|chrome|edge|firefox" docs/store-submissions/v<current>-chrome-web-store.md
```

If more than ~4 distinct platform names appear in the description + "Changes in this version"
combined → generalize and link out before shipping.

---

## References
- Spam & placement: https://developer.chrome.com/docs/webstore/program-policies/spam
- Keyword spam FAQ: https://developer.chrome.com/docs/webstore/program-policies/spam-faq#keyword-spam
- Program policies (index): https://developer.chrome.com/docs/webstore/program-policies
- Best practices: https://developer.chrome.com/docs/webstore/best-practices
