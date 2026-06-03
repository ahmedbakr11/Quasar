$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resourceBin = Join-Path $root "src-tauri\resources\bin"
$lunaAgent = Join-Path $resourceBin "luna-agent.exe"
$livekitServer = Join-Path $resourceBin "livekit-server.exe"

Write-Host "Quasar V1 release build"
Write-Host "Root: $root"

if (!(Test-Path $resourceBin)) {
  New-Item -ItemType Directory -Force -Path $resourceBin | Out-Null
}

if (!(Test-Path $livekitServer)) {
  Write-Warning "Missing $livekitServer"
  Write-Warning "Place the Windows LiveKit server binary there before producing a distributable installer."
}

if (!(Test-Path $lunaAgent)) {
  Write-Warning "Missing $lunaAgent"
  Write-Warning "Build Luna with PyInstaller and place the resulting executable there before producing a distributable installer."
}

Push-Location $root
try {
  npm run lint
  npm run build
  Push-Location "src-tauri"
  try {
    cargo check
  } finally {
    Pop-Location
  }
  npm run tauri:build
} finally {
  Pop-Location
}
