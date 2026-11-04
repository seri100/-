$ErrorActionPreference = 'Stop'
$bidRoot = 'C:\Users\main\bid-dashboard'
$bidLogDir = Join-Path $bidRoot 'logs'
New-Item -ItemType Directory -Force -Path $bidLogDir | Out-Null
$bidLog = Join-Path $bidLogDir ('archive_' + (Get-Date -Format yyyyMMdd) + '.log')
Set-Location $bidRoot
try {
    & 'C:\Program Files\nodejs\node.exe' (Join-Path $bidRoot 'archive-bids.mjs') 2>&1 | Out-File -FilePath $bidLog -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Archive failed: node exit $LASTEXITCODE" }
    exit 0
} catch {
    ((Get-Date -Format o) + ' FAILED ' + $_.Exception.Message) | Out-File -FilePath $bidLog -Append -Encoding utf8
    exit 1
}
