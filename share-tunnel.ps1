# Quick-share Sunrise Motel with friends via Cloudflare Quick Tunnel.
# Your dev server must be running first:  npm run dev   (package.json pins it to port 3112)
# Then run:  powershell -ExecutionPolicy Bypass -File ./share-tunnel.ps1
$ErrorActionPreference = "Stop"
$Tunnel = Join-Path $PSScriptRoot "bin\cloudflared.exe"
if (!(Test-Path $Tunnel)) {
  New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot "bin") | Out-Null
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $Tunnel
}
& $Tunnel tunnel --url http://127.0.0.1:3112 --no-autoupdate
