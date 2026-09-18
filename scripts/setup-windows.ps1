# Bootstraps a fresh Windows machine/VM for geo-browser development.
#
# - Installs Node.js LTS at machine scope (shared across every Windows user profile
#   on the box, instead of once per user) via winget.
# - Runs `npm install`.
# - If Google Chrome isn't installed, points the VS Code Chrome-type debug configs
#   in .vscode/launch.json at Microsoft Edge instead (idempotent — only touches
#   entries that don't already have a runtimeExecutable).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

Write-Host "== geo-browser setup ==" -ForegroundColor Cyan

# 1. Node.js / npm (machine-wide install — shared by every Windows user profile on this VM)
if (Test-CommandExists "node") {
    Write-Host "Node.js already installed: $(node -v)"
} else {
    Write-Host "Installing Node.js LTS (machine scope)..."
    winget install --id OpenJS.NodeJS.LTS -e --scope machine --accept-package-agreements --accept-source-agreements
    Update-SessionPath
}

if (-not (Test-CommandExists "npm")) {
    Update-SessionPath
}
if (-not (Test-CommandExists "npm")) {
    Write-Warning "npm still not found on PATH. Close and reopen your terminal, then re-run this script."
    exit 1
}
Write-Host "npm: $(npm -v)"

# 2. Project dependencies
Write-Host "Running npm install..."
npm install

# 3. VS Code debug launch configs need a Chromium-based browser (type: chrome).
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$edgeCandidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
    Write-Host "Chrome found at $chrome - launch.json needs no changes."
} elseif ($edge) {
    Write-Host "Chrome not found; pointing launch.json's chrome debug configs at Edge: $edge"
    node (Join-Path $PSScriptRoot "patch-launch-json.cjs") $edge
} else {
    Write-Warning "Neither Chrome nor Edge found. Install a Chromium-based browser to use the VS Code debug launch configs."
}

Write-Host "Setup complete." -ForegroundColor Green
