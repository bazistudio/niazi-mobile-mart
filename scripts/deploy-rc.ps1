# PowerShell script to submit Release Candidate Cloud Build safely with preflight checks.
# Project: niazi-mobile-mart-508317
# Service: niazi-server-ts-product-sales-rc
# Dedicated Deployer SA: niazi-cloudbuild-deployer@niazi-mobile-mart-508317.iam.gserviceaccount.com

$ErrorActionPreference = 'Stop'

Write-Host "=== Niazi Mobile Mart RC Cloud Build Preflight Checks ===" -ForegroundColor Cyan

# Check 2: Verify Git repository
try {
    $isGit = git rev-parse --is-inside-work-tree 2>$null
    if ($isGit.Trim() -ne 'true') {
        Write-Error "Preflight Check Failed: Not inside a Git repository."
        exit 1
    }
} catch {
    Write-Error "Preflight Check Failed: Git command execution failed."
    exit 1
}

# Check 1: Determine Git repository root dynamically
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot -or -not (Test-Path $repoRoot)) {
    Write-Error "Preflight Check Failed: Could not resolve Git repository root."
    exit 1
}
Write-Host "[OK] Repository Root: $repoRoot" -ForegroundColor Green

# Check 3: Verify current branch is feature/typescript-migrate
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
if ($currentBranch -ne 'feature/typescript-migrate') {
    Write-Error "Preflight Check Failed: Must be on branch 'feature/typescript-migrate', currently on '$currentBranch'."
    exit 1
}
Write-Host "[OK] Branch: $currentBranch" -ForegroundColor Green

# Check 4: Verify cloudbuild.rc.yaml exists at repository root
$configPath = Join-Path $repoRoot "cloudbuild.rc.yaml"
if (-not (Test-Path $configPath)) {
    Write-Error "Preflight Check Failed: 'cloudbuild.rc.yaml' not found at repository root ($configPath)."
    exit 1
}
Write-Host "[OK] Config File: $configPath" -ForegroundColor Green

# Check 5: Inspect Git status for unexpected tracked modifications
$statusOutput = git status --porcelain 2>$null
$unexpectedTrackedChanges = @()
foreach ($line in $statusOutput) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "") { continue }
    $statusPrefix = $trimmed.Substring(0, 2)
    $filePath = $trimmed.Substring(2).Trim()

    # backend/env is intentionally ignored
    if ($filePath -eq "backend/env") { continue }

    # Check for tracked file modifications (M, D, R in index or work tree)
    if ($statusPrefix -match '^[MDR]' -or $statusPrefix -match '^[ MADRC][MDR]') {
        $unexpectedTrackedChanges += $filePath
    }
}

if ($unexpectedTrackedChanges.Count -gt 0) {
    Write-Host "Preflight Check Failed: Unexpected tracked modifications exist in working tree:" -ForegroundColor Red
    foreach ($file in $unexpectedTrackedChanges) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    Write-Error "Please resolve or revert tracked changes before submitting RC build."
    exit 1
}
Write-Host "[OK] Git Working Tree Tracked Files Clean" -ForegroundColor Green

# Check 6 & 7: Inspect cloudbuild.rc.yaml content for target & production protection
$configContent = Get-Content $configPath -Raw

if ($configContent -notmatch 'niazi-server-ts-product-sales-rc') {
    Write-Error "Preflight Check Failed: RC target service 'niazi-server-ts-product-sales-rc' not found in cloudbuild.rc.yaml."
    exit 1
}
Write-Host "[OK] Expected RC Target Verified: niazi-server-ts-product-sales-rc" -ForegroundColor Green

if ($configContent -match "-\s*['""]niazi-server['""]\s*$" -or $configContent -match 'deploy\s+niazi-server\b(?!-ts-product-sales-rc)' -or $configContent -match '--image=\S+:latest\b') {
    Write-Error "Preflight Check Failed: Production deployment target 'niazi-server' or ':latest' image deployment detected in cloudbuild.rc.yaml!"
    exit 1
}
Write-Host "[OK] Production Protection Verified: Does not target production service 'niazi-server'" -ForegroundColor Green

# Check 8: Dedicated service account specification verification
$serviceAccount = "niazi-cloudbuild-deployer@niazi-mobile-mart-508317.iam.gserviceaccount.com"
$fullServiceAccount = "projects/niazi-mobile-mart-508317/serviceAccounts/$serviceAccount"
Write-Host "[OK] Dedicated Deployer SA Verified: $serviceAccount" -ForegroundColor Green

Write-Host "=== All Preflight Checks Passed ===" -ForegroundColor Green
Write-Host "Submitting Cloud Build with Service Account: $serviceAccount..." -ForegroundColor Cyan

Set-Location $repoRoot

gcloud builds submit `
    --project=niazi-mobile-mart-508317 `
    --config=cloudbuild.rc.yaml `
    --service-account=$fullServiceAccount `
    .
