# Workflow Analytics Script

Fast, zero-maintenance PowerShell script for analyzing GitHub Actions workflow runs.

## Quick Start

```powershell
# Option 1: If gh CLI is already authenticated
cd C:\root\github\dhruvinrsoni\SmrutiCortex
.\scripts\Collect-WorkflowAnalytics.ps1

# Option 2: Set token manually
$env:GITHUB_TOKEN = "ghp_yourtoken"
.\scripts\Collect-WorkflowAnalytics.ps1

# Option 3: Authenticate via gh CLI once
gh auth login
.\scripts\Collect-WorkflowAnalytics.ps1
```

## Features

✅ **Self-Healing:** Auto-detects prerequisites, provides install commands if missing  
✅ **Zero Config:** Works in any SmrutiCortex clone, auto-detects repo  
✅ **Smart:** Uses `gh` CLI and GitHub API for reliability  
✅ **Multi-Format:** Table, JSON, CSV, or HTML output  
✅ **Fast:** Analyzes 1000+ workflow runs in seconds  
✅ **Comprehensive:** Metrics, artifacts, triggers, durations, success rates

## Usage Examples

### Default (Last 30 Days, Table Output)
```powershell
.\scripts\Collect-WorkflowAnalytics.ps1
```

### Last 90 Days
```powershell
.\scripts\Collect-WorkflowAnalytics.ps1 -Days 90
```

### Export to CSV
```powershell
.\scripts\Collect-WorkflowAnalytics.ps1 -OutputFormat csv -ExportPath analytics.csv
```

### Export to HTML Report
```powershell
.\scripts\Collect-WorkflowAnalytics.ps1 -Days 90 -OutputFormat html
# Opens in browser: workflow-analytics-YYYYMMDD-HHMMSS.html
```

### Export to JSON (for programmatic analysis)
```powershell
.\scripts\Collect-WorkflowAnalytics.ps1 -OutputFormat json -ExportPath data.json
```

## What It Collects

### Workflow Metrics
- Total runs per workflow
- Success/failure/cancelled counts
- Success rate percentage
- Average, median, max duration
- Trigger breakdown (push, PR, manual, etc.)

### Artifact Statistics
- Artifact names produced by workflows
- Count of artifacts per type
- Average size per artifact type

### Overall Summary
- Total runs across all workflows
- Overall success rate
- Number of workflows
- Analysis time period

## Prerequisites

The script will check and guide you if anything is missing:

1. **PowerShell 7+** (recommended, works with 5.1+)
   - Install: `winget install Microsoft.PowerShell`

2. **GitHub CLI**
   - Install: `winget install GitHub.cli`
   - Or: `choco install gh`
   - Or: https://cli.github.com/

3. **GitHub Authentication**
   - Option A: `gh auth login`
   - Option B: `$env:GITHUB_TOKEN = "ghp_xxx"`

4. **Git Repository**
   - Run from SmrutiCortex folder

## Output Examples

### Console Table Output
```
╔════════════════════════════════════════════════════════════════╗
║                      📊 SUMMARY                                ║
╚════════════════════════════════════════════════════════════════╝

  Analysis Period:      30 days
  Total Workflow Runs:  142
  Total Workflows:      4
  Overall Success Rate: 94.4%

╔════════════════════════════════════════════════════════════════╗
║                  📋 WORKFLOW METRICS                           ║
╚════════════════════════════════════════════════════════════════╝

WorkflowName          Runs Success Failure SuccessRate AvgDurationSec
------------          ---- ------- ------- ----------- --------------
CI                      48      45       3       93.8%            247
Docker Build & Verify   38      37       1       97.4%            312
Build & Release         52      52       0        100%            189
Deploy Landing Page      4       4       0        100%             67
```

### HTML Report
Beautiful, responsive HTML report with:
- Summary cards
- Sortable tables
- Color-coded success/failure
- Human-readable durations
- Embedded CSS (no external dependencies)

### JSON Export
Complete data structure for automation:
```json
{
  "GeneratedAt": "2026-02-13T...",
  "ScriptVersion": "1.0.0",
  "Summary": { ... },
  "WorkflowMetrics": [ ... ],
  "ArtifactStats": { ... }
}
```

## Advanced Usage

### Run as Scheduled Task (Weekly Report)
```powershell
# Create scheduled task (run weekly)
$action = New-ScheduledTaskAction -Execute "pwsh.exe" `
  -Argument "-File C:\path\to\Collect-WorkflowAnalytics.ps1 -Days 7 -OutputFormat html -ExportPath C:\Reports\weekly-$(Get-Date -Format yyyyMMdd).html"

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am

Register-ScheduledTask -TaskName "SmrutiCortex-WeeklyAnalytics" `
  -Action $action -Trigger $trigger -Description "Weekly workflow analytics"
```

### Integrate with CI (GitHub Actions)
```yaml
- name: Generate Analytics
  run: |
    pwsh ./scripts/Collect-WorkflowAnalytics.ps1 -Days 30 -OutputFormat json -ExportPath analytics.json
- name: Upload Analytics
  uses: actions/upload-artifact@v4
  with:
    name: workflow-analytics
    path: analytics.json
```

### Compare Two Time Periods
```powershell
# Last 30 days
.\scripts\Collect-WorkflowAnalytics.ps1 -Days 30 -OutputFormat json -ExportPath last-month.json

# Previous 30 days (manual date range in script if needed)
# Then compare JSON files programmatically
```

## Troubleshooting

### "GitHub CLI not authenticated"
```powershell
# Authenticate once
gh auth login

# Or set token
$env:GITHUB_TOKEN = "ghp_yourtoken"
```

### "Not in a git repository"
```powershell
# Navigate to repo first
cd C:\root\github\dhruvinrsoni\SmrutiCortex
.\scripts\Collect-WorkflowAnalytics.ps1
```

### API Rate Limits
- GitHub API: 5000 requests/hour (authenticated)
- Script uses ~10-50 requests per run
- Rate limit info: `gh api rate_limit`

### Slow Performance
- Reduce sample size (edit script: `$sampleSize = 20`)
- Reduce days: `-Days 7`
- Skip artifact analysis (comment out in script)

## Maintenance

**Zero maintenance required.** Script is self-healing:
- Auto-detects missing prerequisites
- Provides install commands
- Handles API errors gracefully
- Works across Windows/Linux/macOS

## FAQ

**Q: How often should I run this?**  
A: Weekly or monthly for trend analysis. Run ad-hoc after major changes.

**Q: Can I run this in CI?**  
A: Yes! Use `GITHUB_TOKEN` secret. See "Advanced Usage" above.

**Q: What's the performance cost?**  
A: ~10-50 GitHub API requests. Takes 5-30 seconds depending on history.

**Q: Can I exclude certain workflows?**  
A: Yes, filter `$metrics` array in script before output.

**Q: Can I track custom metrics?**  
A: Yes! Modify `Measure-WorkflowMetrics` function to add calculations.

## Related Documentation

- [Workflows Overview](../docs/WORKFLOWS.md) - Detailed workflow documentation
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [GitHub CLI Manual](https://cli.github.com/manual/)

---

**Version:** 1.0.0  
**Last Updated:** February 13, 2026  
**Maintainer:** SmrutiCortex DevOps
