#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Collects GitHub Actions workflow analytics for SmrutiCortex repository.

.DESCRIPTION
    This script automatically gathers comprehensive metrics about GitHub Actions workflow runs,
    including frequency, duration, success rates, and artifact information. Requires GitHub CLI
    (gh) to be installed and GITHUB_TOKEN environment variable to be set.

.PARAMETER Days
    Number of days of history to analyze (default: 30)

.PARAMETER OutputFormat
    Output format: table, json, csv, or html (default: table)

.PARAMETER ExportPath
    Optional path to export results (default: ./workflow-analytics-YYYYMMDD-HHMMSS.{format})

.EXAMPLE
    .\Collect-WorkflowAnalytics.ps1
    Analyzes last 30 days, displays table output

.EXAMPLE
    .\Collect-WorkflowAnalytics.ps1 -Days 90 -OutputFormat csv -ExportPath analytics.csv
    Analyzes last 90 days, exports to CSV

.EXAMPLE
    $env:GITHUB_TOKEN = "ghp_xxx"; .\Collect-WorkflowAnalytics.ps1
    Set token and run (token can also be set with `gh auth login`)

.NOTES
    Author: SmrutiCortex DevOps
    Version: 1.0.0
    Requires: GitHub CLI (gh), PowerShell 7+
    Zero maintenance, self-healing design
#>

[CmdletBinding()]
param(
    [Parameter()]
    [int]$Days = 30,
    
    [Parameter()]
    [ValidateSet('table', 'json', 'csv', 'html')]
    [string]$OutputFormat = 'table',
    
    [Parameter()]
    [string]$ExportPath = ""
)

# Script metadata
$ScriptVersion = "1.0.0"
$ScriptName = "Collect-WorkflowAnalytics"

#region Self-Healing Functions

function Test-Prerequisites {
    <#
    .SYNOPSIS
        Validates prerequisites with self-healing attempts.
    #>
    Write-Host "`n🔍 Checking prerequisites..." -ForegroundColor Cyan
    
    $allGood = $true
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        Write-Warning "PowerShell 7+ recommended (you have $($PSVersionTable.PSVersion))"
        Write-Host "   ℹ️  Script will work but some features may be limited" -ForegroundColor Yellow
    } else {
        Write-Host "✅ PowerShell $($PSVersionTable.PSVersion)" -ForegroundColor Green
    }
    
    # Check GitHub CLI
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host "❌ GitHub CLI (gh) not found" -ForegroundColor Red
        Write-Host "   📥 Install: winget install GitHub.cli" -ForegroundColor Yellow
        Write-Host "   📥 Or: choco install gh" -ForegroundColor Yellow
        Write-Host "   📥 Or: https://cli.github.com/" -ForegroundColor Yellow
        $allGood = $false
    } else {
        $ghVersion = (gh --version 2>$null | Select-Object -First 1)
        Write-Host "✅ GitHub CLI: $ghVersion" -ForegroundColor Green
    }
    
    # Check if in git repo
    if (-not (Test-Path .git)) {
        Write-Host "❌ Not in a git repository" -ForegroundColor Red
        Write-Host "   📁 Navigate to SmrutiCortex folder and try again" -ForegroundColor Yellow
        $allGood = $false
    } else {
        Write-Host "✅ Git repository detected" -ForegroundColor Green
    }
    
    # Check GitHub authentication
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ GitHub CLI not authenticated" -ForegroundColor Red
        
        # Try to use GITHUB_TOKEN if available
        if ($env:GITHUB_TOKEN) {
            Write-Host "   🔑 GITHUB_TOKEN found, will use it" -ForegroundColor Yellow
            # gh CLI will automatically use GITHUB_TOKEN env var
        } else {
            Write-Host "   🔐 Authenticate with: gh auth login" -ForegroundColor Yellow
            Write-Host "   🔐 Or set: `$env:GITHUB_TOKEN = 'ghp_xxx'" -ForegroundColor Yellow
            $allGood = $false
        }
    } else {
        Write-Host "✅ GitHub CLI authenticated" -ForegroundColor Green
    }
    
    if (-not $allGood) {
        throw "Prerequisites not met. Fix issues above and rerun."
    }
    
    Write-Host ""
}

function Get-RepoInfo {
    <#
    .SYNOPSIS
        Gets repository information from git remote.
    #>
    try {
        $remoteUrl = git remote get-url origin 2>$null
        if ($remoteUrl -match 'github\.com[:/]([^/]+)/([^/.]+)') {
            return @{
                Owner = $matches[1]
                Repo  = $matches[2]
                Url   = $remoteUrl
            }
        }
    } catch {
        # Ignore
    }
    
    # Fallback: try to get from gh
    try {
        $repoInfo = gh repo view --json owner,name 2>$null | ConvertFrom-Json
        return @{
            Owner = $repoInfo.owner.login
            Repo  = $repoInfo.name
            Url   = "https://github.com/$($repoInfo.owner.login)/$($repoInfo.name)"
        }
    } catch {
        throw "Could not determine repository. Ensure you're in a GitHub repository."
    }
}

#endregion

#region Data Collection Functions

function Get-WorkflowRuns {
    <#
    .SYNOPSIS
        Fetches workflow runs from GitHub API via gh CLI.
    #>
    param(
        [string]$Owner,
        [string]$Repo,
        [int]$DaysBack
    )
    
    Write-Host "📊 Fetching workflow runs (last $DaysBack days)..." -ForegroundColor Cyan
    
    # Calculate date limit
    $dateLimit = (Get-Date).AddDays(-$DaysBack).ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    # Fetch up to 1000 recent runs (gh has limit of 100 per request, we'll paginate)
    $allRuns = @()
    $page = 1
    $perPage = 100
    
    do {
        Write-Progress -Activity "Fetching workflow runs" -Status "Page $page" -PercentComplete -1
        
        try {
            $runs = gh api "repos/$Owner/$Repo/actions/runs?per_page=$perPage&page=$page" --jq '.workflow_runs[]' | ConvertFrom-Json -AsHashtable
            
            if (-not $runs) { break }
            
            # Filter by date
            $filteredRuns = $runs | Where-Object { 
                [DateTime]$_.created_at -ge [DateTime]$dateLimit 
            }
            
            $allRuns += $filteredRuns
            
            # If we got fewer than perPage, we've reached the end
            if ($runs.Count -lt $perPage) { break }
            
            # If filtered runs are older than our limit, stop
            if ($filteredRuns.Count -eq 0) { break }
            
            $page++
        } catch {
            Write-Warning "Error fetching page $page : $_"
            break
        }
    } while ($page -le 10)  # Safety limit: 10 pages = 1000 runs max
    
    Write-Progress -Activity "Fetching workflow runs" -Completed
    Write-Host "✅ Fetched $($allRuns.Count) workflow runs" -ForegroundColor Green
    
    return $allRuns
}

function Get-WorkflowDetails {
    <#
    .SYNOPSIS
        Gets workflow file names and details.
    #>
    param(
        [string]$Owner,
        [string]$Repo
    )
    
    Write-Host "📋 Fetching workflow definitions..." -ForegroundColor Cyan
    
    try {
        $workflows = gh api "repos/$Owner/$Repo/actions/workflows" --jq '.workflows[]' | ConvertFrom-Json -AsHashtable
        Write-Host "✅ Found $($workflows.Count) workflows" -ForegroundColor Green
        return $workflows
    } catch {
        Write-Warning "Could not fetch workflow details: $_"
        return @()
    }
}

function Get-ArtifactStats {
    <#
    .SYNOPSIS
        Gets artifact statistics for recent runs.
    #>
    param(
        [string]$Owner,
        [string]$Repo,
        [array]$RunIds
    )
    
    Write-Host "📦 Analyzing artifacts..." -ForegroundColor Cyan
    
    $artifactStats = @{}
    $sampleSize = [Math]::Min(50, $RunIds.Count)  # Sample 50 runs to avoid API rate limits
    
    for ($i = 0; $i -lt $sampleSize; $i++) {
        $runId = $RunIds[$i]
        Write-Progress -Activity "Analyzing artifacts" -Status "Run $($i+1) of $sampleSize" -PercentComplete (($i/$sampleSize)*100)
        
        try {
            $artifacts = gh api "repos/$Owner/$Repo/actions/runs/$runId/artifacts" --jq '.artifacts[]' 2>$null | ConvertFrom-Json -AsHashtable
            
            foreach ($artifact in $artifacts) {
                $name = $artifact.name
                if (-not $artifactStats.ContainsKey($name)) {
                    $artifactStats[$name] = @{
                        Count = 0
                        TotalSize = 0
                        AvgSize = 0
                    }
                }
                $artifactStats[$name].Count++
                $artifactStats[$name].TotalSize += $artifact.size_in_bytes
            }
        } catch {
            # Ignore errors (artifacts may have expired)
        }
    }
    
    Write-Progress -Activity "Analyzing artifacts" -Completed
    
    # Calculate averages
    foreach ($name in $artifactStats.Keys) {
        $artifactStats[$name].AvgSize = $artifactStats[$name].TotalSize / $artifactStats[$name].Count
    }
    
    Write-Host "✅ Analyzed $($artifactStats.Count) unique artifact types" -ForegroundColor Green
    return $artifactStats
}

#endregion

#region Analysis Functions

function Measure-WorkflowMetrics {
    <#
    .SYNOPSIS
        Calculates comprehensive metrics from workflow runs.
    #>
    param(
        [array]$Runs,
        [hashtable]$Workflows
    )
    
    Write-Host "`n📈 Calculating metrics..." -ForegroundColor Cyan
    
    # Group by workflow
    $groupedRuns = $Runs | Group-Object -Property workflow_id
    
    $metrics = @()
    
    foreach ($group in $groupedRuns) {
        $workflowId = $group.Name
        $workflowRuns = $group.Group
        
        # Find workflow name
        $workflowInfo = $Workflows | Where-Object { $_.id -eq [int]$workflowId } | Select-Object -First 1
        $workflowName = if ($workflowInfo) { $workflowInfo.name } else { "Unknown ($workflowId)" }
        $workflowPath = if ($workflowInfo) { $workflowInfo.path } else { "unknown" }
        
        # Calculate metrics
        $totalRuns = $workflowRuns.Count
        $successRuns = ($workflowRuns | Where-Object { $_.conclusion -eq 'success' }).Count
        $failureRuns = ($workflowRuns | Where-Object { $_.conclusion -eq 'failure' }).Count
        $cancelledRuns = ($workflowRuns | Where-Object { $_.conclusion -eq 'cancelled' }).Count
        $successRate = if ($totalRuns -gt 0) { [Math]::Round(($successRuns / $totalRuns) * 100, 1) } else { 0 }
        
        # Calculate durations (in seconds)
        $durations = $workflowRuns | Where-Object { $_.run_started_at } | ForEach-Object {
            try {
                $start = [DateTime]$_.run_started_at
                $end = [DateTime]$_.updated_at
                ($end - $start).TotalSeconds
            } catch {
                0
            }
        } | Where-Object { $_ -gt 0 }
        
        $avgDuration = if ($durations) { [Math]::Round(($durations | Measure-Object -Average).Average, 0) } else { 0 }
        $medianDuration = if ($durations) { 
            $sorted = $durations | Sort-Object
            $mid = [Math]::Floor($sorted.Count / 2)
            [Math]::Round($sorted[$mid], 0)
        } else { 0 }
        $maxDuration = if ($durations) { [Math]::Round(($durations | Measure-Object -Maximum).Maximum, 0) } else { 0 }
        
        # Trigger events
        $triggerCounts = $workflowRuns | Group-Object -Property event | ForEach-Object {
            "$($_.Name): $($_.Count)"
        }
        
        $metrics += [PSCustomObject]@{
            WorkflowName = $workflowName
            WorkflowFile = ($workflowPath -split '/')[-1]
            TotalRuns = $totalRuns
            Success = $successRuns
            Failure = $failureRuns
            Cancelled = $cancelledRuns
            SuccessRate = "$successRate%"
            AvgDurationSec = $avgDuration
            MedianDurationSec = $medianDuration
            MaxDurationSec = $maxDuration
            TriggerBreakdown = ($triggerCounts -join ', ')
        }
    }
    
    Write-Host "✅ Metrics calculated for $($metrics.Count) workflows" -ForegroundColor Green
    return $metrics
}

function Format-Duration {
    param([int]$Seconds)
    
    if ($Seconds -lt 60) {
        return "${Seconds}s"
    } elseif ($Seconds -lt 3600) {
        $mins = [Math]::Floor($Seconds / 60)
        $secs = $Seconds % 60
        return "${mins}m ${secs}s"
    } else {
        $hours = [Math]::Floor($Seconds / 3600)
        $mins = [Math]::Floor(($Seconds % 3600) / 60)
        return "${hours}h ${mins}m"
    }
}

function Format-Size {
    param([long]$Bytes)
    
    if ($Bytes -lt 1KB) {
        return "$Bytes B"
    } elseif ($Bytes -lt 1MB) {
        return "$([Math]::Round($Bytes / 1KB, 1)) KB"
    } elseif ($Bytes -lt 1GB) {
        return "$([Math]::Round($Bytes / 1MB, 1)) MB"
    } else {
        return "$([Math]::Round($Bytes / 1GB, 2)) GB"
    }
}

#endregion

#region Output Functions

function Export-Results {
    param(
        [array]$Metrics,
        [hashtable]$Artifacts,
        [hashtable]$Summary,
        [string]$Format,
        [string]$Path
    )
    
    # Generate default path if not provided
    if (-not $Path) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $extension = switch ($Format) {
            'json' { 'json' }
            'csv' { 'csv' }
            'html' { 'html' }
            default { 'txt' }
        }
        $Path = "workflow-analytics-$timestamp.$extension"
    }
    
    switch ($Format) {
        'json' {
            $output = @{
                GeneratedAt = Get-Date -Format "o"
                ScriptVersion = $ScriptVersion
                Summary = $Summary
                WorkflowMetrics = $Metrics
                ArtifactStats = $Artifacts
            }
            $output | ConvertTo-Json -Depth 10 | Out-File $Path -Encoding utf8
        }
        
        'csv' {
            $Metrics | Export-Csv -Path $Path -NoTypeInformation -Encoding utf8
        }
        
        'html' {
            $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>SmrutiCortex Workflow Analytics</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: #f5f5f5; }
        h1 { color: #2c3e50; }
        h2 { color: #34495e; margin-top: 30px; }
        .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
        .summary-item { background: #ecf0f1; padding: 15px; border-radius: 5px; }
        .summary-item strong { display: block; color: #7f8c8d; font-size: 0.9em; margin-bottom: 5px; }
        .summary-item .value { font-size: 1.5em; color: #2c3e50; }
        table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #3498db; color: white; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .footer { margin-top: 30px; text-align: center; color: #7f8c8d; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>🚀 SmrutiCortex Workflow Analytics</h1>
    <div class="summary">
        <h2>📊 Summary</h2>
        <div class="summary-grid">
            <div class="summary-item"><strong>Analysis Period</strong><span class="value">$($Summary.Days) days</span></div>
            <div class="summary-item"><strong>Total Runs</strong><span class="value">$($Summary.TotalRuns)</span></div>
            <div class="summary-item"><strong>Total Workflows</strong><span class="value">$($Summary.TotalWorkflows)</span></div>
            <div class="summary-item"><strong>Success Rate</strong><span class="value">$($Summary.OverallSuccessRate)</span></div>
        </div>
    </div>
    
    <h2>📋 Workflow Metrics</h2>
    <table>
        <tr>
            <th>Workflow</th>
            <th>Runs</th>
            <th>Success</th>
            <th>Failure</th>
            <th>Success %</th>
            <th>Avg Duration</th>
            <th>Triggers</th>
        </tr>
"@
            foreach ($metric in $Metrics) {
                $html += @"
        <tr>
            <td><strong>$($metric.WorkflowName)</strong><br><small>$($metric.WorkflowFile)</small></td>
            <td>$($metric.TotalRuns)</td>
            <td style="color: green;">$($metric.Success)</td>
            <td style="color: red;">$($metric.Failure)</td>
            <td>$($metric.SuccessRate)</td>
            <td>$(Format-Duration $metric.AvgDurationSec)</td>
            <td><small>$($metric.TriggerBreakdown)</small></td>
        </tr>
"@
            }
            
            $html += @"
    </table>
    
    <h2>📦 Artifact Statistics</h2>
    <table>
        <tr>
            <th>Artifact Name</th>
            <th>Count</th>
            <th>Avg Size</th>
        </tr>
"@
            foreach ($name in ($Artifacts.Keys | Sort-Object)) {
                $stats = $Artifacts[$name]
                $html += @"
        <tr>
            <td>$name</td>
            <td>$($stats.Count)</td>
            <td>$(Format-Size $stats.AvgSize)</td>
        </tr>
"@
            }
            
            $html += @"
    </table>
    
    <div class="footer">
        <p>Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>
        <p>Script Version: $ScriptVersion</p>
    </div>
</body>
</html>
"@
            $html | Out-File $Path -Encoding utf8
        }
        
        default {
            # Table format - already displayed
        }
    }
    
    Write-Host "`n✅ Results exported to: $Path" -ForegroundColor Green
}

#endregion

#region Main Execution

try {
    Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║           📊 SmrutiCortex Workflow Analytics v$ScriptVersion           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

    # Step 1: Prerequisites
    Test-Prerequisites
    
    # Step 2: Get repo info
    Write-Host "📍 Repository Information" -ForegroundColor Cyan
    $repoInfo = Get-RepoInfo
    Write-Host "   Owner: $($repoInfo.Owner)" -ForegroundColor White
    Write-Host "   Repo:  $($repoInfo.Repo)" -ForegroundColor White
    Write-Host "   URL:   $($repoInfo.Url)" -ForegroundColor White
    Write-Host ""
    
    # Step 3: Fetch data
    $workflows = Get-WorkflowDetails -Owner $repoInfo.Owner -Repo $repoInfo.Repo
    $runs = Get-WorkflowRuns -Owner $repoInfo.Owner -Repo $repoInfo.Repo -DaysBack $Days
    
    if ($runs.Count -eq 0) {
        Write-Warning "No workflow runs found in the last $Days days."
        exit 0
    }
    
    # Step 4: Analyze
    $metrics = Measure-WorkflowMetrics -Runs $runs -Workflows $workflows
    
    # Step 5: Artifact stats (optional, can be disabled for speed)
    $artifactStats = @{}
    if ($runs.Count -gt 0) {
        $sampleRunIds = $runs | Select-Object -First 50 -ExpandProperty id
        $artifactStats = Get-ArtifactStats -Owner $repoInfo.Owner -Repo $repoInfo.Repo -RunIds $sampleRunIds
    }
    
    # Step 6: Summary
    $totalRuns = $runs.Count
    $successRuns = ($runs | Where-Object { $_.conclusion -eq 'success' }).Count
    $overallSuccessRate = if ($totalRuns -gt 0) { [Math]::Round(($successRuns / $totalRuns) * 100, 1) } else { 0 }
    
    $summary = @{
        Days = $Days
        TotalRuns = $totalRuns
        TotalWorkflows = $workflows.Count
        OverallSuccessRate = "$overallSuccessRate%"
    }
    
    # Step 7: Display results
    Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                      📊 SUMMARY                                ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
    
    Write-Host "  Analysis Period:      $($summary.Days) days" -ForegroundColor White
    Write-Host "  Total Workflow Runs:  $($summary.TotalRuns)" -ForegroundColor White
    Write-Host "  Total Workflows:      $($summary.TotalWorkflows)" -ForegroundColor White
    Write-Host "  Overall Success Rate: $($summary.OverallSuccessRate)" -ForegroundColor White
    
    Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                  📋 WORKFLOW METRICS                           ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
    
    $metrics | Format-Table -AutoSize -Wrap
    
    if ($artifactStats.Count -gt 0) {
        Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
        Write-Host "║                  📦 ARTIFACT STATISTICS                        ║" -ForegroundColor Cyan
        Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
        
        $artifactStats.GetEnumerator() | Sort-Object Key | ForEach-Object {
            Write-Host "  $($_.Key)" -ForegroundColor Yellow
            Write-Host "    Count:    $($_.Value.Count)" -ForegroundColor White
            Write-Host "    Avg Size: $(Format-Size $_.Value.AvgSize)" -ForegroundColor White
            Write-Host ""
        }
    }
    
    # Step 8: Export if requested
    if ($OutputFormat -ne 'table' -or $ExportPath) {
        Export-Results -Metrics $metrics -Artifacts $artifactStats -Summary $summary -Format $OutputFormat -Path $ExportPath
    }
    
    Write-Host "`n✅ Analysis complete!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}

#endregion
