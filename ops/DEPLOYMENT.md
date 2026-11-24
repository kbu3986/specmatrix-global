# SpecMatrix Global — Production Deployment & Operations Guide

## 1. Live Production Environment (v2 — 4 Verticals + 5 Interactive Studios)

- **Repository**: `https://github.com/kbu3986/specmatrix-global` (`main` source / `gh-pages` static artifact)
- **Live URL (GitHub Pages)**: `https://kbu3986.github.io/specmatrix-global`
- **Core Pages Deployed**: 258+ pure-HTML Astro 5 pages (`en` + `ko` across 4 verticals, 72 verified SKUs, 31 VS matchups, 13 matrices/compat, 5 interactive studios + Tools Hub, 5 legal/trust docs, plus root portal & custom 404; < 350 total files)
- **Interactive Studios (EN + KO)**:
  - Live 1:1 Any-vs-Any Compare Workbench (`/{locale}/compare/`)
  - Travel Power Kit & 30-Airline Optimizer (`/{locale}/tools/travel-power-kit/`)
  - Endurance Race Fueling Mix Planner (`/{locale}/tools/fueling-planner/`)
  - HomeTech 3-Year TCO Payback & Multi-Device UPS Runtime Studio (`/{locale}/tools/hometech-tco-studio/`)
  - Road Tire Pressure & ETRTO 5.0 Bar Hookless Safety Guard (`/{locale}/tools/tire-pressure-guard/`)
- **Monetization Active (iHerb permanently prohibited)**:
  - Google AdSense: `ca-pub-8587506565277191` (`ads.txt` + `<meta name="google-adsense-account">`)
  - Coupang Partners (KO): `AF2200875` (`sm-watt-kr`, `sm-pure-kr`, `sm-cycle-kr`, `sm-home-kr`, Dynamic Banner `id=1054684`, Goldbox shortlink, 72/72 official SKU shortlinks)
  - Amazon Associates (US/EN): `kbu3986-20` (`msrp_benchmark_mode`, zero unverified ASINs)
- **Search Verification, OG & Sitemaps**:
  - Sitemap Index: `https://kbu3986.github.io/specmatrix-global/sitemap-index.xml`
  - Split Sitemaps: `sitemap-core.xml`, `sitemap-wattcheck-{en,ko}.xml`, `sitemap-puregram-{en,ko}.xml`, `sitemap-cyclegear-{en,ko}.xml`, `sitemap-hometech-{en,ko}.xml`
  - Global Search Index: `search-index.json` (zero initial bundle bloat)
  - OpenGraph Social Cards: 5 generated 1200×630 PNGs in `/og/`

---

## 2. One-Click Redeploy (GitHub Pages)

```powershell
npm run deploy:gh-pages
```

This runs Stage 2 validation (`npm run validate`), pipeline unit tests (`npm run test:pipeline`), OG PNG generation + Astro 5 subpath SSG build (`PUBLIC_BASE_PATH=/specmatrix-global`) + search index + 9 split sitemaps, Stage 6 HTML QA (`npm run qa:stage6`), clean `gh-pages` push (excluding Cloudflare `_headers`, preserving `CNAME` if present), exact commit SHA build confirmation, direct HTTP 200 verification (zero 301 redirects), and HTTP 404 check confirming zero `adsbygoogle.js` on error pages.

---

## 3. Daily FX Rate Refresh, Tier-3 Link Health, Coupang Links & IndexNow

```powershell
# Refresh live FX snapshot (ECB/open.er-api with ±15% guard)
npm run fx:update

# Run Tier-3 live HTTP health audit across all citations, airlines & Coupang links
npm run health:links

# Convert all 72 KO URLs via Coupang Partners Open API (once API keys are unlocked)
npm run coupang:sync
# Or export all 72 search URLs for Coupang Partners Center manual link generator
npm run coupang:export

# Instantly notify Bing / Naver / Yandex / DuckDuckGo via IndexNow
npm run indexnow:submit
```

- **Analytics**: Configure `ga4MeasurementId` (`G-...`), `clarityProjectId`, or `cfBeaconToken` in `config/monetization-config.v2.json` and re-run `npm run deploy:gh-pages` to activate visitor & outbound `affiliate_click` tracking.
- **Technical SEO & Growth**: Focus strictly on split sitemaps, IndexNow notifications, `hreflang` symmetry, structured JSON-LD, and high-information-gain interactive studios.

---

## 4. Custom Domain Migration (Cloudflare Pages — Zero Code Changes)

When migrating to a dedicated domain (e.g., `https://specmatrix.io`):

1. Connect `kbu3986/specmatrix-global` to Cloudflare Pages.
2. Configure build settings:
   - **Build command**: `npm ci && npm --prefix web ci && npm run build:all`
   - **Build output directory**: `web/dist`
   - **Environment variables**:
     - `PUBLIC_SITE_URL=https://specmatrix.io`
     - `PUBLIC_BASE_PATH=` (empty)
3. `web/public/_headers` automatically applies immutable caching on `/_astro/*` and security headers on Cloudflare Pages (and is excluded from GitHub Pages deployments).
