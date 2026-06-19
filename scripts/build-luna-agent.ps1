$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$lunaDir = Join-Path $root "Luna_Agent"
$resourceBin = Join-Path $root "src-tauri\resources\bin"
$venvDir = Join-Path $lunaDir ".venv-release"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$pyInstallerExe = Join-Path $venvDir "Scripts\pyinstaller.exe"
$distDir = Join-Path $lunaDir "dist"
$buildDir = Join-Path $lunaDir "build"
$specFile = Join-Path $lunaDir "luna-agent.spec"
$lunaExe = Join-Path $distDir "luna-agent.exe"
$targetLunaExe = Join-Path $resourceBin "luna-agent.exe"
$sourceLiveKit = Join-Path $lunaDir "livekit-server.exe"
$targetLiveKit = Join-Path $resourceBin "livekit-server.exe"

Write-Host "Building Luna sidecar"
Write-Host "Luna source: $lunaDir"
Write-Host "Resource output: $resourceBin"

if (!(Test-Path $lunaDir)) {
  throw "Missing Luna_Agent directory at $lunaDir"
}

if (!(Test-Path (Join-Path $lunaDir "agent.py"))) {
  throw "Missing Luna_Agent\agent.py"
}

if (!(Test-Path $resourceBin)) {
  New-Item -ItemType Directory -Force -Path $resourceBin | Out-Null
}

if (!(Test-Path $pythonExe)) {
  Write-Host "Creating release virtualenv..."
  python -m venv $venvDir
}

Write-Host "Installing Luna build dependencies..."
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r (Join-Path $lunaDir "requirements.txt")
& $pythonExe -m pip install pyinstaller

Write-Host "Building luna-agent.exe with PyInstaller..."
Push-Location $lunaDir
try {
  if (Test-Path $lunaExe) {
    Remove-Item -Force $lunaExe
  }

  & $pyInstallerExe `
    --noconfirm `
    --clean `
    --onefile `
    --name luna-agent `
    --paths $lunaDir `
    --collect-all livekit `
    --collect-all livekit.agents `
    --collect-all livekit.plugins `
    --collect-all google.genai `
    --hidden-import dotenv `
    --hidden-import memory `
    --hidden-import antigravity_delegator `
    agent.py
} finally {
  Pop-Location
}

if (!(Test-Path $lunaExe)) {
  throw "PyInstaller completed without producing $lunaExe"
}

Copy-Item -Force $lunaExe $targetLunaExe
Write-Host "Copied Luna sidecar to $targetLunaExe"

if (Test-Path $sourceLiveKit) {
  Copy-Item -Force $sourceLiveKit $targetLiveKit
  Write-Host "Copied LiveKit sidecar to $targetLiveKit"
} else {
  Write-Warning "Missing $sourceLiveKit"
  Write-Warning "Place livekit-server.exe in $resourceBin before producing a distributable installer."
}

Write-Host "Luna sidecar build complete."
