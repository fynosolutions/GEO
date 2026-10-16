param([switch]$TestData)
$ErrorActionPreference = 'Stop'
$restaurantRepo = Split-Path $PSScriptRoot -Parent
$restaurantEnv = if ($TestData) { '.env.p1-test' } else { '.env' }
$restaurantKeepAlive = $null
Push-Location $restaurantRepo
try {
    if (-not (Test-Path -LiteralPath $restaurantEnv)) { throw 'Local environment file is missing. See README-P1.md.' }
    $restaurantKeepAlive = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu-22.04', '--', 'sleep', 'infinity') -WindowStyle Hidden -PassThru
    $restaurantWslIp = ((& wsl.exe -d Ubuntu-22.04 -- hostname -I).Trim() -split '\s+')[0]
    if ($restaurantWslIp -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Could not resolve the local WSL database address.' }
    & node scripts/restaurant-env.mjs $restaurantWslIp $restaurantEnv
    if ($LASTEXITCODE -ne 0) { throw 'Database environment check failed.' }
    Write-Host 'Open http://localhost:3010/app/org/default/restaurants after startup.'
    Write-Host 'Press Ctrl+C to stop. Only the web app starts; no AI query worker is running.'
    Set-Location (Join-Path $restaurantRepo 'apps/web')
    $env:PORT = '3010'
    & node --use-env-proxy "--env-file=../../$restaurantEnv" node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 3010 --strictPort
} finally {
    Pop-Location
    if ($restaurantKeepAlive -and -not $restaurantKeepAlive.HasExited) { Stop-Process -Id $restaurantKeepAlive.Id -ErrorAction SilentlyContinue }
}
