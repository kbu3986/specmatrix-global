param(
    [string]$Owner = "kbu3986",
    [string]$RepoName = "specmatrix-global",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

function Invoke-DirectHttpCheck {
    param(
        [string]$Uri,
        [int]$TimeoutSec = 15
    )
    $req = [System.Net.HttpWebRequest]::Create($Uri)
    $req.Method = "GET"
    $req.AllowAutoRedirect = $false
    $req.Timeout = $TimeoutSec * 1000
    $req.Headers.Add("Cache-Control", "no-cache")
    $req.UserAgent = "SpecMatrix-DeployVerify/1.0"
    try {
        $resp = $req.GetResponse()
        try {
            $status = [int]$resp.StatusCode
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $body = $reader.ReadToEnd()
            $reader.Close()
            return [PSCustomObject]@{
                StatusCode = $status
                Body       = $body
                Length     = $body.Length
                Location   = $resp.Headers["Location"]
            }
        } finally {
            $resp.Close()
        }
    } catch [System.Net.WebException] {
        $errResp = $_.Exception.Response
        if ($null -ne $errResp) {
            try {
                $status = [int]$errResp.StatusCode
                $reader = New-Object System.IO.StreamReader($errResp.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Close()
                return [PSCustomObject]@{
                    StatusCode = $status
                    Body       = $body
                    Length     = $body.Length
                    Location   = $errResp.Headers["Location"]
                }
            } finally {
                $errResp.Close()
            }
        }
        throw
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Deploying SpecMatrix Global ($Owner/$RepoName)" -ForegroundColor Cyan
Write-Host " Target Production URL: $LiveUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Push-Location $RootDir
try {
    # Guard: ensure we are on main branch before pushing main
    $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -ne "main") {
        throw "Refusing to deploy while checked out on branch '$currentBranch'. Switch to 'main' first."
    }

    if (-not $SkipBuild) {
        $env:PUBLIC_SITE_URL = $LiveUrl
        $env:PUBLIC_BASE_PATH = $BasePath
        Write-Host "[1/5] Running Stage 2 validation + pipeline tests + Astro 5 build + Stage 6 QA..." -ForegroundColor Yellow
        Invoke-NativeChecked -Command { npm run build:all } -ErrorMessage "npm run build:all failed"
    } else {
        $robotsPath = Join-Path $DistDir "robots.txt"
        if (-not (Test-Path $robotsPath)) {
            throw "-SkipBuild failed: missing $robotsPath"
        }
        $robotsContent = Get-Content -Raw -Path $robotsPath
        if ($robotsContent -notmatch [regex]::Escape($LiveUrl)) {
            throw "-SkipBuild safety abort: $robotsPath does not contain expected LiveUrl '$LiveUrl' (possible root build mismatch)."
        }
        Write-Host "[1/5] -SkipBuild verified: robots.txt matches $LiveUrl" -ForegroundColor Green
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

    # 4. Publish clean web/dist artifact to gh-pages branch (no stale _astro bloat, exclude _headers, preserve CNAME)
    Write-Host "[4/5] Publishing clean Astro 5 pure-HTML dist to gh-pages branch..." -ForegroundColor Yellow
    $TempDeployDir = Join-Path $env:TEMP ("ghpages-specmatrix-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    $PrevCloneDir = Join-Path $env:TEMP ("prev-specmatrix-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $TempDeployDir | Out-Null
    $PushedSha = ""
    try {
        Copy-Item -Path (Join-Path $DistDir "*") -Destination $TempDeployDir -Recurse -Force
        Copy-Item -Path (Join-Path $DistDir ".nojekyll") -Destination $TempDeployDir -Force

        # Never serve Cloudflare-specific _headers file as raw text on GitHub Pages
        $headersInTemp = Join-Path $TempDeployDir "_headers"
        if (Test-Path $headersInTemp) {
            Remove-Item -Force $headersInTemp
        }

        # Preserve CNAME from existing gh-pages branch if present
        $clonedPrev = Invoke-NativeQuiet { git clone --quiet --depth 1 --branch gh-pages $RemoteUrl $PrevCloneDir }
        if ($clonedPrev -eq 0 -and (Test-Path (Join-Path $PrevCloneDir "CNAME"))) {
            Copy-Item -Path (Join-Path $PrevCloneDir "CNAME") -Destination (Join-Path $TempDeployDir "CNAME") -Force
            Write-Host "  Preserved existing CNAME from gh-pages branch." -ForegroundColor DarkGray
        }

        Push-Location $TempDeployDir
        try {
            Invoke-NativeChecked -Command { git -c core.autocrlf=false init -q -b gh-pages }
            Invoke-NativeChecked -Command { git remote add origin $RemoteUrl }
            Invoke-NativeChecked -Command { git -c core.autocrlf=false add -A }
            Invoke-NativeChecked -Command { git commit -q -m "deploy: SpecMatrix Global (4-Vertical + 5 Studios) ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))" }
            $PushedSha = (git rev-parse HEAD).Trim()
            Invoke-NativeChecked -Command { git push -q -u origin gh-pages --force } -ErrorMessage "Failed pushing gh-pages branch"
        } finally {
            Pop-Location
        }
    } finally {
        Remove-Item -Recurse -Force $PrevCloneDir -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $TempDeployDir -ErrorAction SilentlyContinue
    }

    # 5. Enable GitHub Pages on gh-pages + poll until EXACT commit SHA builds & responds direct 200 OK
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

    $maxAttempts = 45
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
                if ($buildObj.commit -eq $PushedSha -and $buildObj.status -eq "errored") {
                    throw "GitHub Pages build errored for commit $($PushedSha.Substring(0,7)): $($buildObj.error.message)"
                }
            }
            Write-Host "  [$i/$maxAttempts] GitHub Pages building commit $($PushedSha.Substring(0,7))..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
        }
    } finally {
        $ErrorActionPreference = $oldEap
    }

    if (-not $builtConfirmed) {
        throw "GitHub Pages did not confirm building exact commit $PushedSha within timeout ($($maxAttempts * 3)s)."
    }

    $pollTargets = @(
        "$LiveUrl/",
        "$LiveUrl/ko/",
        "$LiveUrl/en/",
        "$LiveUrl/ko/wattcheck/item/anker-prime-27650mah-250w/",
        "$LiveUrl/ko/puregram/item/maurten-gel-100-caf-100/",
        "$LiveUrl/ko/cyclegear/item/continental-gp5000-s-tr-28/",
        "$LiveUrl/ko/hometech/item/apple-mac-mini-m4/",
        "$LiveUrl/ko/hometech/matrix/minipc-nas-tco/",
        "$LiveUrl/en/cyclegear/vs/favero-assioma-pro-rs-2-vs-garmin-rally-rs200/",
        "$LiveUrl/ko/wattcheck/matrix/airlines-30/",
        "$LiveUrl/ko/compare/",
        "$LiveUrl/ko/tools/",
        "$LiveUrl/ko/tools/fueling-planner/",
        "$LiveUrl/ko/tools/travel-power-kit/",
        "$LiveUrl/ko/tools/hometech-tco-studio/",
        "$LiveUrl/ko/tools/tire-pressure-guard/",
        "$LiveUrl/search-index.json",
        "$LiveUrl/og/og-default.png",
        "$LiveUrl/sitemap-index.xml",
        "$LiveUrl/sitemap-core.xml",
        "$LiveUrl/ads.txt",
        "$LiveUrl/robots.txt"
    )

    $liveOk = $false
    for ($j = 1; $j -le 20; $j++) {
        try {
            $resp = Invoke-DirectHttpCheck -Uri "$LiveUrl/ko/?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -TimeoutSec 10
            if ($resp.StatusCode -eq 200) {
                $liveOk = $true
                break
            }
        } catch {
            # retry
        }
        Start-Sleep -Seconds 3
    }

    if (-not $liveOk) {
        throw "Live site $LiveUrl/ko/ did not respond direct HTTP 200 within timeout."
    }

    Write-Host "Verifying live HTTPS production endpoints (direct HTTP 200, zero 301 redirects)..." -ForegroundColor Yellow
    foreach ($u in $pollTargets) {
        $r = Invoke-DirectHttpCheck -Uri "${u}?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -TimeoutSec 15
        if ($r.StatusCode -ne 200) {
            throw "Expected direct HTTP 200 for $u but received HTTP $($r.StatusCode) (Location: $($r.Location))"
        }
        Write-Host ("  HTTP {0} ({1,6} bytes) {2}" -f $r.StatusCode, $r.Length, $u) -ForegroundColor Green
    }

    # Verify custom 404 returns HTTP 404 WITHOUT adsbygoogle.js
    $notFoundUrl = "$LiveUrl/this-page-does-not-exist-check/?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    $nf = Invoke-DirectHttpCheck -Uri $notFoundUrl -TimeoutSec 15
    if ($nf.StatusCode -ne 404) {
        throw "Expected HTTP 404 for $notFoundUrl but got HTTP $($nf.StatusCode)"
    }
    if ($nf.Body -match "adsbygoogle\.js") {
        throw "AdSense compliance error: 404 page at $notFoundUrl contains adsbygoogle.js!"
    }
    Write-Host ("  HTTP {0} ({1,6} bytes, 0 adsbygoogle.js) {2}" -f $nf.StatusCode, $nf.Length, "$LiveUrl/this-page-does-not-exist-check/") -ForegroundColor Green

    Write-Host ""
    Write-Host "LIVE! SpecMatrix Global deployed at $LiveUrl (commit $($PushedSha.Substring(0,7)))" -ForegroundColor Green
} finally {
    Remove-Item Env:PUBLIC_SITE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
    Pop-Location
}
