## Contributing

Thank you for your interest in contributing to SmrutiCortex.

Current status: Contributions are temporarily closed. The project is distributed under the Apache License 2.0 and the maintainers reserve full control over the repository and the release process at this time.

Planned process when contributions are re-opened:

- We will accept external contributions via pull requests.
- Contributors will be asked to sign a Contributor License Agreement (CLA) or agree to a Developer Certificate of Origin (DCO) to clarify copyright and licensing of contributions.
- All accepted contributions will be included under the project's `LICENSE` (Apache-2.0) unless otherwise specified in writing.

For now, please open issues for feature requests or bug reports at: https://github.com/dhruvinrsoni/smruti-cortex/issues

If you are a potential contributor and would like early access to contribute under a different arrangement, contact the maintainers via GitHub Issues.

— The SmrutiCortex team

---

## Filing a Ranking Bug

When the extension's "Report" button (in the popup footer or the
quick-search overlay) opens a GitHub issue for you, it uses a dedicated
issue silo so general bug reports stay readable.

What to know:

- **Choose a masking level** in the chooser modal that matches your
  comfort with sharing data. "Partial (recommended)" redacts non-matching
  words and company-specific domain parts while keeping the query
  readable for reproduction. "Strictest" hashes everything except numbers
  and scorer breakdowns.
- **Paste your clipboard** into the GitHub issue form's "Debug Data"
  textarea. The button auto-copies the full report when you click it.
- **One report at a time.** A 5-reports-per-24h floodgate guards against
  accidental floods. If you hit it, the toast tells you when the next
  slot frees up. The cap is per-user, stored locally in your browser.
- **Duplicates are flagged automatically.** If your report shares the
  same query, sort mode, and minor version as an open issue, an action
  comments with `Possible duplicate of #N` and adds a `duplicate?` label.
  The maintainer confirms or strips it manually — feel free to add new
  repro details if you think your case is genuinely different.
- **Filing by hand is fine** if the button is unavailable. Use the
  [Ranking Report issue form](https://github.com/dhruvinrsoni/smruti-cortex/issues/new?template=ranking-report.yml)
  directly; the workflows will pick it up just like an auto-filed report.

The maintainer-side flow (label list, triage URL, kill-switch
how-to, workflow descriptions) lives in
[`.github/skills/maintenance/SKILL.md`](.github/skills/maintenance/SKILL.md)
under "Issue Triage — Ranking Reports".
