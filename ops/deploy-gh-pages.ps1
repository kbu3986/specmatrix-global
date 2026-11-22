param(
    [string]$Owner = "kbu3986",
    [string]$RepoName = "specmatrix-global",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir "web\dist"
$BasePath = "/$RepoName"
$LiveUrl = "https://$Owner.github.io/$RepoName"
$RemoteUrl = "https://github.com/$Owner/$RepoName.git"

function Invoke-NativeQuiet {
    param([scriptblock]$Command)
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command 2>&1 | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

function Invoke-NativeChecked {
    param(
        [scriptblock]$Command,
        [string]$ErrorMessage = "Native command failed"
    )
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Command 2>&1
        $code = $LASTEXITCODE
        if ($output) {
            $output | Where-Object {
                $_ -notmatch 'LF will be replaced by CRLF' -and $_ -notmatch '^\s*create mode 100644 '
            } | ForEach-Object { Write-Host "  $_" }
        }
        if ($code -ne 0) {
            throw "$ErrorMessage (exit code $code)"
        }
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Deploying SpecMatrix Global ($Owner/$RepoName)" -ForegroundColor Cyan
Write-Host " Target Production URL: $LiveUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Push-Location $RootDir
try {
    if (-not $SkipBuild) {
        $env:PUBLIC_SITE_URL = $LiveUrl
        $env:PUBLIC_BASE_PATH = $BasePath
        Write-Host "[1/5] Running Stage 2 validation + pipeline tests + Astro 5 build + Stage 6 QA..." -ForegroundColor Yellow
        Invoke-NativeChecked -Command { npm run build:all } -ErrorMessage "npm run build:all failed"
    }

    if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
        throw "Built dist directory missing index.html at $DistDir"
    }
    if (-not (Test-Path (Join-Path $DistDir ".nojekyll"))) {
        New-Item -ItemType File -Force -Path (Join-Path $DistDir ".nojekyll") | Out-Null
    }

    # 2. Ensure GitHub public repository exists (required for free GitHub Pages)
    Write-Host "[2/5] Checking GitHub repository $Owner/$RepoName..." -ForegroundColor Yellow
    $viewCode = Invoke-NativeQuiet { gh repo view "$Owner/$RepoName" --json name }
    if ($viewCode -ne 0) {
        Invoke-NativeChecked -Command {
            gh repo create "$Owner/$RepoName" --public --description "SpecMatrix Global — Evidence-anchored multi-locale spec verification & comparison matrix (Astro 5 SSG)"
        } -ErrorMessage "Failed to create GitHub repository $Owner/$RepoName"
    }

    # 3. Push source main branch
    Write-Host "[3/5] Syncing source main branch to $Owner/$RepoName..." -ForegroundColor Yellow
    $hasOrigin = Invoke-NativeQuiet { git remote get-url origin }
    if ($hasOrigin -eq 0) {
        Invoke-NativeChecked -Command { git remote set-url origin $RemoteUrl }
    } else {
        Invoke-NativeChecked -Command { git remote add origin $RemoteUrl }
    }
    Invoke-NativeChecked -Command { git push -u origin main } -ErrorMessage "Failed pushing main branch"

    # 4. Publish web/dist artifact to gh-pages branch (preserving prior _astro chunks for zero-downtime swap)
    Write-Host "[4/5] Publishing Astro 5 pure-HTML dist to gh-pages branch..." -ForegroundColor Yellow
    $TempDeployDir = Join-Path $env:TEMP ("ghpages-specmatrix-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    $PrevCloneDir = Join-Path $env:TEMP ("prev-specmatrix-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $TempDeployDir | Out-Null
    $PushedSha = ""
    try {
        $clonedPrev = Invoke-NativeQuiet { git clone --quiet --depth 1 --branch gh-pages $RemoteUrl $PrevCloneDir }
        if ($clonedPrev -eq 0 -and (Test-Path (Join-Path $PrevCloneDir "_astro"))) {
            New-Item -ItemType Directory -Force -Path (Join-Path $TempDeployDir "_astro") | Out-Null
            Copy-Item -Path (Join-Path $PrevCloneDir "_astro\*") -Destination (Join-Path $TempDeployDir "_astro") -Recurse -Force -ErrorAction SilentlyContinue
        }

        Copy-Item -Path (Join-Path $DistDir "*") -Destination $TempDeployDir -Recurse -Force
        Copy-Item -Path (Join-Path $DistDir ".nojekyll") -Destination $TempDeployDir -Force

        Push-Location $TempDeployDir
        try {
            Invoke-NativeChecked -Command { git -c core.autocrlf=false init -q -b gh-pages }
            Invoke-NativeChecked -Command { git remote add origin $RemoteUrl }
            Invoke-NativeChecked -Command { git -c core.autocrlf=false add -A }
            Invoke-NativeChecked -Command { git commit -q -m "deploy: SpecMatrix Global Phase 1 Pilot ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))" }
            $PushedSha = (git rev-parse HEAD).Trim()
            Invoke-NativeChecked -Command { git push -q -u origin gh-pages --force } -ErrorMessage "Failed pushing gh-pages branch"
        } finally {
            Pop-Location
        }
    } finally {
        Remove-Item -Recurse -Force $PrevCloneDir -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $TempDeployDir -ErrorAction SilentlyContinue
    }

    # 5. Enable GitHub Pages on gh-pages + poll until EXACT commit SHA builds & responds 200 OK
    Write-Host "[5/5] Enabling GitHub Pages & waiting for build ($($PushedSha.Substring(0,7)))..." -ForegroundColor Yellow
    $pagesCheck = Invoke-NativeQuiet { gh api "repos/$Owner/$RepoName/pages" }
    if ($pagesCheck -ne 0) {
        Invoke-NativeChecked -Command {
            gh api "repos/$Owner/$RepoName/pages" -X POST -f "source[branch]=gh-pages" -f "source[path]=/"
        } -ErrorMessage "Failed enabling GitHub Pages"
    } else {
        Invoke-NativeQuiet {
            gh api "repos/$Owner/$RepoName/pages" -X PUT -f "source[branch]=gh-pages" -f "source[path]=/"
        } | Out-Null
    }
    Invoke-NativeQuiet { gh api "repos/$Owner/$RepoName/pages/builds" -X POST } | Out-Null

    $maxAttempts = 40
    $builtConfirmed = $false
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        for ($i = 1; $i -le $maxAttempts; $i++) {
            $latestJson = gh api "repos/$Owner/$RepoName/pages/builds/latest" 2>$null
            if ($LASTEXITCODE -eq 0 -and $latestJson) {
                $buildObj = $latestJson | ConvertFrom-Json
                if ($buildObj.commit -eq $PushedSha -and $buildObj.status -eq "built") {
                    $builtConfirmed = $true
                    break
                }
            }
            Write-Host "  [$i/$maxAttempts] GitHub Pages building commit $($PushedSha.Substring(0,7))..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
        }
    } finally {
        $ErrorActionPreference = $oldEap
    }

    $pollTargets = @(
        "$LiveUrl/",
        "$LiveUrl/ko",
        "$LiveUrl/en",
        "$LiveUrl/ko/wattcheck/item/anker-prime-27650mah-250w",
        "$LiveUrl/ko/puregram/item/maurten-gel-100-caf-100",
        "$LiveUrl/ko/cyclegear/item/continental-gp5000-s-tr-28",
        "$LiveUrl/en/cyclegear/vs/favero-assioma-pro-rs-2-vs-garmin-rally-rs200",
        "$LiveUrl/ko/wattcheck/matrix/airlines-30",
        "$LiveUrl/sitemap-index.xml",
        "$LiveUrl/ads.txt",
        "$LiveUrl/robots.txt"
    )

    $liveOk = $false
    for ($j = 1; $j -le 20; $j++) {
        try {
            $resp = Invoke-WebRequest -Uri "$LiveUrl/ko?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -Method Get -UseBasicParsing -Headers @{"Cache-Control"="no-cache"} -TimeoutSec 10 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                $liveOk = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 3
        }
    }

    if (-not $liveOk) {
        throw "Live site $LiveUrl/ko did not respond HTTP 200 within timeout."
    }

    Write-Host "Verifying live HTTPS production endpoints..." -ForegroundColor Yellow
    foreach ($u in $pollTargets) {
        $r = Invoke-WebRequest -Uri "$u?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -Method Get -UseBasicParsing -Headers @{"Cache-Control"="no-cache"} -TimeoutSec 15
        Write-Host ("  HTTP {0} ({1,6} bytes) {2}" -f $r.StatusCode, $r.Content.Length, $u) -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "LIVE! SpecMatrix Global deployed at $LiveUrl (commit $($PushedSha.Substring(0,7)))" -ForegroundColor Green
} finally {
    Remove-Item Env:PUBLIC_SITE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
    Pop-Location
}
