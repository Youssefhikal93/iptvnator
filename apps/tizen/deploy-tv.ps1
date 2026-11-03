# DRAFT (phase 0, issue #18): builds the IPTVnator Tizen widget, signs it with a
# Samsung certificate profile, installs it on the TV over Developer Mode and
# starts it. Installs next to Jo-TV (own package IPTVnSamTV); reinstalling keeps
# the app's data. Run from the repository root, only with the owner's OK.
#
# Usage: .\apps\tizen\deploy-tv.ps1 [-TvIp 192.168.0.18] [-CertProfile iptvnator-tv]
#                                   [-BackendUrl http://<PC-IP>:3333] [-SkipBuild] [-NoRun]
# -BackendUrl (phase 0 test aid only): M3U URLs are imported through a web-backend
# on the PC until phase 1 adds direct data; see apps/tizen/README.md.
param(
    [string]$TvIp = '192.168.0.18',
    [string]$CertProfile = 'iptvnator-tv',
    [string]$BackendUrl = '',
    [string]$TizenStudio = 'C:\tizen-studio',
    [switch]$SkipBuild,
    [switch]$NoRun
)
$ErrorActionPreference = 'Stop'
$appId = 'IPTVnSamTV.IPTVnator'
$tizen = Join-Path $TizenStudio 'tools\ide\bin\tizen.bat'
$sdb = Join-Path $TizenStudio 'tools\sdb.exe'
$widget = Join-Path (Get-Location) 'dist\apps\tizen\widget'
$build = Join-Path $env:TEMP 'iptvnator-samsungtv'
$target = "${TvIp}:26101"

foreach ($tool in $tizen, $sdb) {
    if (-not (Test-Path $tool)) { throw "$tool not found; install Tizen Studio (tools/tizen/INSTALLATION-TO-TV.md steps 1-2)." }
}

# 1. Build: web:build:tizen, then wrap (probe, config.xml, icon).
if (-not $SkipBuild) {
    corepack pnpm nx run tizen:build-web
    if ($LASTEXITCODE -ne 0) { throw 'web:build:tizen failed' }
    $wrapArgs = @('apps/tizen/scripts/wrap-widget.mjs')
    if ($BackendUrl) { $wrapArgs += @('--backend-url', $BackendUrl) }
    node @wrapArgs
    if ($LASTEXITCODE -ne 0) { throw 'wrapping the widget failed' }
}
if (-not (Test-Path (Join-Path $widget 'config.xml'))) { throw "$widget has no config.xml; run without -SkipBuild." }

# 2. Package and sign a copy, so signature files and the .wgt stay out of dist.
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Copy-Item -Recurse $widget $build
& $tizen package -t wgt -s $CertProfile -- $build
if ($LASTEXITCODE -ne 0) { throw "tizen package failed (is the '$CertProfile' profile listed by 'tizen security-profiles list'?)" }
# tizen install fails on file names with spaces.
Get-ChildItem $build -Filter *.wgt | Select-Object -First 1 | Rename-Item -NewName iptvnator-samsungtv.wgt

# 3. Install over Developer Mode and start.
& $sdb connect $target
Push-Location $build
try {
    & $tizen install -n iptvnator-samsungtv.wgt -s $target -- .
    if ($LASTEXITCODE -ne 0) { throw 'tizen install failed' }
    if (-not $NoRun) { & $tizen run -p $appId -s $target }
} finally {
    Pop-Location
}
Write-Host "Installed $appId. The startup badge shows the timing for 20 s after each start."
