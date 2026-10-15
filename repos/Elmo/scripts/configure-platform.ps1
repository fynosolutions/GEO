param([ValidateSet('Google','Yelp')][string]$Platform = 'Google')
$ErrorActionPreference = 'Stop'
Write-Host ('GEO setup: ' + $Platform)
Write-Host 'Paste the API key only in this local window. It will not be displayed.'
Write-Host 'No API requests or subscriptions are made by this tool.'
if ($Platform -eq 'Google') {
    Write-Host 'First enable Places API (New), link billing, and restrict this key to Places API (New).'
} else {
    Write-Host 'First confirm the Yelp license covers evaluation or separately authorized display.'
}
$platformSetupConfirmation = Read-Host 'Enter YES after confirming API access, purpose and billing'
if ($platformSetupConfirmation -cne 'YES') { Write-Host 'Cancelled; nothing changed.'; exit 0 }
$platformSetupPurpose = ''
if ($Platform -eq 'Yelp') {
    $platformSetupPurpose = Read-Host 'Purpose: evaluation or display_authorized'
}
$platformSetupCeiling = Read-Host 'Conservative maximum USD per API request (Google pilot: 0.05)'
$platformSetupPrior = Read-Host 'Verified earlier project external spend in USD, outside the reservation ledger (enter 0 if none)'
$platformSetupKey = Read-Host 'API key (hidden)' -AsSecureString
$platformSetupPointer = [IntPtr]::Zero
try {
    $platformSetupPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($platformSetupKey)
    $platformSetupPayload = @{
        provider = $Platform.ToLowerInvariant()
        key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($platformSetupPointer)
        ceiling = $platformSetupCeiling
        prior = $platformSetupPrior
        purpose = $platformSetupPurpose
        confirmed = $true
    } | ConvertTo-Json -Compress
    $platformSetupPayload | & node (Join-Path $PSScriptRoot 'configure-platform.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Configuration was not completed.' }
    Write-Host 'Saved to both local environment files. Return to Codex to restart and verify the website.'
} finally {
    if ($platformSetupPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($platformSetupPointer) }
    $platformSetupPayload = $null
    $platformSetupKey.Dispose()
}
