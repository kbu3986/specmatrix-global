# SpecMatrix Global — Production Deployment & Operations Guide

## 1. Live Production Environment (Phase 1 Pilot)

- **Repository**: `https://github.com/kbu3986/specmatrix-global` (`main` source / `gh-pages` static artifact)
- **Live URL (GitHub Pages)**: `https://kbu3986.github.io/specmatrix-global`
- **Core Pages Deployed**: 203 pure-HTML Astro 5 pages (`en` 100p + `ko` 100p + 3 portal hubs; 220 total files)
- **Monetization Active**:
  - Google AdSense: `ca-pub-8587506565277191` (`ads.txt` + `<meta name="google-adsense-account">`)
  - Coupang Partners (KO): `AF2200875` (`sm-watt-kr`, `sm-pure-kr`, `sm-cycle-kr`)
  - Amazon Associates (US/EN): `kbu3986-20` (`msrp_benchmark_mode`, zero unverified ASINs)
- **Search Verification & Sitemaps**:
  - Sitemap Index: `https://kbu3986.github.io/specmatrix-global/sitemap-index.xml`
  - Split Sitemaps: `sitemap-core.xml`, `sitemap-wattcheck-{en,ko}.xml`, `sitemap-puregram-{en,ko}.xml`, `sitemap-cyclegear-{en,ko}.xml`

---

## 2. One-Click Redeploy (GitHub Pages)

```powershell
npm run deploy:gh-pages
```

This runs Stage 2 validation (`npm run validate`), 40 pipeline tests (`npm run test:pipeline`), Astro 5 subpath SSG build (`PUBLIC_BASE_PATH=/specmatrix-global`), Stage 6 HTML QA (`npm run qa:stage6`), zero-downtime `gh-pages` push (retaining previous `_astro/` chunks), and live HTTPS 200 verification.

---

## 3. Daily FX Rate Refresh

```powershell
npm run fx:update
```

Updates `data/snapshots/fx-rates.json` from `open.er-api.com` with a 4.5s timeout and ±15% anomaly guardrail.

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
3. `web/public/_headers` automatically applies immutable caching on `/_astro/*` and security headers.
