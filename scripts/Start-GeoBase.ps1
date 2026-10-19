$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$nodeCommand = Get-Command node -ErrorAction Stop
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.next/BUILD_ID'))) {
    Write-Host 'Run npm ci, npm run db:migrate and npm run build first.'
    exit 1
}
$runtimeDirectory = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pidFile = Join-Path $runtimeDirectory 'server.pid'
$port = if ($env:GEOBASE_PORT) { [int]$env:GEOBASE_PORT } else { 3000 }
if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid GEOBASE_PORT.' }
$url = "http://127.0.0.1:$port/merchant"
function Open-Workspace { if ($env:GEOBASE_NO_BROWSER -ne '1') { Start-Process $url } }
try {
    $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) { Open-Workspace; exit 0 }
} catch {}
$nextScript = Join-Path $projectRoot 'scripts/next.mjs'
$serverArguments = @(('"{0}"' -f $nextScript), 'start', '--hostname', '127.0.0.1', '--port', [string]$port)
$serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList $serverArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
$serverProcess.Id | Set-Content -LiteralPath $pidFile
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($serverProcess.HasExited) { throw 'Server stopped. Check .local/server-error.log.' }
    try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing; if ($response.StatusCode -eq 200) { Open-Workspace; exit 0 } } catch {}
}
throw 'Startup timed out. Check .local/server-error.log.'
