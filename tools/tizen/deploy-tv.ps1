# Packages tools/tizen/tv-app, installs it on the TV and starts it.
# Usage: .\tools\tizen\deploy-tv.ps1 [-TvIp 192.168.0.18] [-CertProfile iptvnator-tv]
param(
    [string]$TvIp = '192.168.0.18',
    [string]$CertProfile = 'iptvnator-tv'
)
$ErrorActionPreference = 'Stop'
$tizen = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
$src = Join-Path $PSScriptRoot 'tv-app'
$build = Join-Path $env:TEMP 'iptvnator-tv'
$target = "${TvIp}:26101"

# The vendor scripts are not committed (INSTALLATION-TO-TV.md section 8).
foreach ($file in 'hls.min.js', 'mpegts.js', 'preact.umd.js', 'htm.umd.js') {
    if (-not (Test-Path (Join-Path $src "vendor\$file"))) { throw "tv-app\vendor\$file is missing; download it as in INSTALLATION-TO-TV.md section 8." }
}

# Package a copy so signature files and the .wgt stay out of the repo.
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Copy-Item -Recurse $src $build
Remove-Item -Force (Join-Path $build '*.wgt') -ErrorAction SilentlyContinue
& $tizen package -t wgt -s $CertProfile -- $build
# tizen install fails on file names with spaces.
Get-ChildItem $build -Filter *.wgt | Select-Object -First 1 | Rename-Item -NewName iptvnator.wgt

& 'C:\tizen-studio\tools\sdb.exe' connect $target
Push-Location $build
try {
    & $tizen install -n iptvnator.wgt -s $target -- .
    if ($LASTEXITCODE -ne 0) { throw 'The install failed; no release copy was kept.' }
    & $tizen run -p IPTVnTVApp.IPTVnator -s $target
} finally {
    Pop-Location
}

# Keep each installed build (#100, JOTV-RELEASES.md): the signed .wgt and the
# vendor scripts, next to the repo in Projects\jotv-releases\<version> <date> <time>.
$version = ([xml](Get-Content (Join-Path $src 'config.xml') -Raw)).widget.version
$releases = Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot))) 'jotv-releases'
$kept = Join-Path $releases ("$version " + (Get-Date -Format 'yyyy-MM-dd HH.mm'))
New-Item -ItemType Directory -Force (Join-Path $kept 'vendor') | Out-Null
Copy-Item (Join-Path $build 'iptvnator.wgt') $kept
foreach ($file in 'hls.min.js', 'mpegts.js', 'preact.umd.js', 'htm.umd.js') { Copy-Item (Join-Path $src "vendor\$file") (Join-Path $kept 'vendor') }
Write-Host "Kept this build in $kept"
