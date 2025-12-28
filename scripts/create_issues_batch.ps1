# create_issues_batch.ps1
# Batch create roadmap issues (idempotent). Appends links to GENERAL_TODO.md.
# Run from repo root with gh CLI authenticated.

$repo = "dhruvinrsoni/smruti-cortex"
$todoFile = "GENERAL_TODO.md"
$milestone = "v4.0"

function Issue-Exists($title) {
  $matches = gh issue list --repo $repo --limit 100 --json title --jq ".[] | select(.title==\"$title\")" 2>$null
  return ($matches -ne $null -and $matches -ne "")
}

function Create-Issue($title, $body, $labels) {
  if (Issue-Exists $title) {
    Write-Host "Issue already exists: $title"
    # fetch URL
    $issue = gh issue list --repo $repo --limit 100 --json number,title,url --jq ".[] | select(.title==\"$title\") | {number: .number, url: .url}" | Select-Object -First 1
    return $issue.url
  }
  $tmp = [System.IO.Path]::Combine($env:TEMP, ([System.Guid]::NewGuid().ToString() + ".md"))
  $body | Out-File -FilePath $tmp -Encoding utf8
  $labelArgs = @()
  foreach ($l in $labels) { $labelArgs += @("--label", $l) }
  $cmd = @("issue","create","--repo",$repo,"--title",$title,"--body-file",$tmp,"--milestone",$milestone) + $labelArgs
  $out = gh @cmd 2>&1
  Remove-Item $tmp -ErrorAction SilentlyContinue
  $url = ($out | Select-String -Pattern 'https://github.com/.+' | Select-Object -First 1).Matches.Value
  if (-not $url) {
    # fallback: search by title
    $url = (gh issue list --repo $repo --search "$title" --limit 10 --json number,title,url --jq '.[] | select(.title=="'"$title"'" ) | .url' 2>$null) | Select-Object -First 1
  }
  return $url
}

$items = @(
  @{ title = "Default to Local-only processing"; labels = @("priority/high","area/privacy"); body = @'
Ensure all processing is local by default; no external calls or telemetry unless explicitly opted-in.

Acceptance criteria:
- Audit code paths for external network calls.
- Settings page shows a clear toggle and description.
- Unit tests cover settings enforcement.
'@ },
  @{ title = "Explain extension permissions in Options page"; labels = @("priority/high","area/privacy"); body = @'
Add a permissions section in the Options page that enumerates requested Chrome permissions and why they are needed.

Acceptance criteria:
- Permissions page added to options.
- Each permission has short rationale text.
- Link from onboarding and store listing.
'@ },
  @{ title = "Sensitive-site blacklist for extractor"; labels = @("priority/high","area/privacy"); body = @'
Add a sensitive-site blacklist feature to disable the content extractor on matching domains (banks, payment portals, password managers).

Acceptance criteria:
- Global blacklist toggle and custom domain list in settings.
- Extractor respects blacklist immediately.
- Tests for domain matching logic.
'@ },
  @{ title = "Disable metadata extraction toggle"; labels = @("priority/high","area/privacy"); body = @'
Add a single toggle to completely disable metadata extraction (for users who prefer no extraction).

Acceptance criteria:
- Toggle in settings with clear description.
- Extraction code reads setting and no longer indexes new visits when disabled.
- E2E test for toggle behavior.
'@ },
  @{ title = "Unit tests for mergeMetadata logic"; labels = @("priority/high","area/tests"); body = @'
Add unit tests for the mergeMetadata function to ensure metadata merging correctness (titles, favicons, snippets, timestamps).

Acceptance criteria:
- Tests cover deduplication, null/empty fields, and priority rules.
- Coverage added for edge cases.
'@ },
  @{ title = "Build index rebuild flow (full history import)"; labels = @("priority/high","area/indexing"); body = @'
Implement a rebuild flow to re-index browser history from scratch.

Acceptance criteria:
- UI button to trigger full reindex.
- Background job performs import while showing progress.
- Tests or manual verification steps documented.
'@ },
  @{ title = "Background resilience: service worker restart recovery"; labels = @("priority/high","area/background"); body = @'
Improve service worker resilience: on restart, ensure no data loss and resume indexing tasks gracefully.

Acceptance criteria:
- SW restart detection and state reconciliation.
- No duplicate records or missed visits after restart.
- Unit or integration tests for resume logic.
'@ },
  @{ title = "Handle IndexedDB quota gracefully"; labels = @("priority/high","area/storage"); body = @'
Detect IndexedDB quota issues and provide graceful fallback and user messaging.

Acceptance criteria:
- Detect quota/exceeded errors and show user-facing guidance.
- Implement purge/compaction strategy options.
- Tests or documented repro steps.
'@ },
  @{ title = "Add onboarding 3-step flow for new users"; labels = @("priority/medium","area/ux"); body = @'
Design a short onboarding flow (3 steps) for new users to explain features and privacy.

Acceptance criteria:
- Three-step modal covering core functionality, privacy, and shortcuts.
- Skip/Replay options available.
- Link to full developer docs and settings.
'@ },
  @{ title = "Pinned results / favorites"; labels = @("priority/medium","area/ux"); body = @'
Allow users to pin or favorite results for fast access.

Acceptance criteria:
- UI to pin/unpin results.
- Persist pins in IndexedDB.
- Keyboard shortcut to view pinned list.
'@ },
  @{ title = "Favicon caching for faster rendering"; labels = @("priority/medium","area/ux"); body = @'
Cache favicons locally to reduce load and speed up result rendering.

Acceptance criteria:
- Cache with eviction policy.
- Use cached favicon in results list.
- Tests or perf measurement showing improvement.
'@ },
  @{ title = "Add preview snippet or metadata snippet"; labels = @("priority/medium","area/ux"); body = @'
Show a preview snippet for each result (if available) to improve discoverability.

Acceptance criteria:
- Snippet extraction and highlighting available.
- Toggle in settings to enable/disable.
- Performance checked for long lists.
'@ },
  @{ title = "Document scorer plugin interface"; labels = @("priority/medium","area/docs"); body = @'
Document the scorer plugin interface so new scorers can be added as plugins.

Acceptance criteria:
- API docs added under /src/background/search/scorers
- Example plugin added (skeleton).
- Tests for plugin loading.
'@ },
  @{ title = "Add AI embedding scorer (opt-in)"; labels = @("priority/medium","area/ai"); body = @'
Add an optional AI-based scorer using embeddings (opt-in with explicit consent).

Acceptance criteria:
- Scorer implemented behind settings toggle and API key gating.
- Privacy implications documented.
- Tests and integration steps included.
'@ },
  @{ title = "Store embeddings only with user consent"; labels = @("priority/medium","area/privacy"); body = @'
Ensure embeddings and any external model interactions store or transmit data only with explicit user consent.

Acceptance criteria:
- Settings to opt-in/out.
- Clear explanations in onboarding and settings.
- Code gated by consent checks.
'@ },
  @{ title = "Add API key management in settings"; labels = @("priority/medium","area/settings"); body = @'
Add a secure place in settings for users to enter and manage API keys (for optional AI features).

Acceptance criteria:
- Encrypted local storage or secure handling guidance.
- UI to add/remove keys.
- Input validation and docs.
'@ },
  @{ title = "Create promo screenshots for Chrome/Edge store"; labels = @("priority/low","area/marketing"); body = @'
Create promotional screenshots and images for the Chrome/Edge store submission.

Acceptance criteria:
- Provide 1280x800 and 640x400 screenshots.
- Include captions and highlight features.
'@ },
  @{ title = "Write Store Description + Release Notes"; labels = @("priority/low","area/marketing"); body = @'
Write an effective store description, release notes, and privacy text.

Acceptance criteria:
- Draft store description ready for upload.
- Release notes written (v3.0).
- Privacy summary short text for store listing.
'@ },
  @{ title = "Add GitHub Action to auto-zip builds"; labels = @("priority/low","area/ci"); body = @'
Add a GitHub Action job to run on tag push that builds and creates the store-ready zip automatically.

Acceptance criteria:
- Workflow triggers on tag push (v*).
- Artifacts uploaded to release or store.
- Secrets configuration documented.
'@ },
  @{ title = "Prepare automated release upload"; labels = @("priority/low","area/ci"); body = @'
Prepare steps or code to upload built zip to Chrome Web Store (requires API keys/service account).

Acceptance criteria:
- Document steps for Web Store API upload.
- Optional Action job scaffold included.
'@ }
)

Write-Host "Creating $($items.Count) issues..."

foreach ($it in $items) {
  try {
    Write-Host "\nProcessing: $($it.title)" -ForegroundColor Cyan
    $url = Create-Issue $it.title $it.body $it.labels
    if ($url) {
      Write-Host "Created/Found: $url" -ForegroundColor Green
      $line = "- [ ] [$($it.title)]($url)  Labels: $($it.labels -join ', ')"
      Add-Content -Path $todoFile -Value $line
      Start-Sleep -Milliseconds 300
    } else {
      Write-Warning "No URL returned for: $($it.title)"
    }
  } catch {
    Write-Warning "Error creating issue: $($_.Exception.Message)"
  }
}

Write-Host "\nAll done. Please review GENERAL_TODO.md and commit changes."