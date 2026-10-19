$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $projectRoot '.local/server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serverProcessId = [int](Get-Content -LiteralPath $pidFile)
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
    if ($serverProcess -and $serverProcess.CommandLine -like ('*' + (Join-Path $projectRoot 'scripts/next.mjs') + '*')) {
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $serverProcessId"
        foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $serverProcessId -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $pidFile
}
