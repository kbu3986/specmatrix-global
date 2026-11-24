import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_DIR, "..");
const DIST_DIR = path.join(WEB_DIR, "dist");

const RAW_BASE = (process.env.PUBLIC_BASE_PATH || "").trim();
const BASE_PATH =
  RAW_BASE && RAW_BASE !== "/"
    ? `/${RAW_BASE.replace(/^\/+|\/+$/g, "")}`
    : "";

const RAW_SITE_URL = (process.env.PUBLIC_SITE_URL || "https://specmatrix.io")
  .trim()
  .replace(/\/+$/, "");

const SITE_URL =
  BASE_PATH && !RAW_SITE_URL.endsWith(BASE_PATH)
    ? `${RAW_SITE_URL}${BASE_PATH}`
    : RAW_SITE_URL;

const VERTICALS = ["wattcheck", "puregram", "cyclegear", "hometech"];
const TODAY = new Date().toISOString().slice(0, 10);

function readConfigSafe() {
  const cfgPath = path.join(REPO_ROOT, "config", "monetization-config.v2.json");
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {
    return {};
  }
}

const CFG = readConfigSafe();
const LOCALES =
  Array.isArray(CFG?.releaseGate?.activeLocales) && CFG.releaseGate.activeLocales.length > 0
    ? CFG.releaseGate.activeLocales
    : ["en", "ko"];
const INDEXNOW_KEY = String(CFG?.verification?.indexNowKey || "").trim();

function walkHtmlFiles(dir, relBase = "") {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkHtmlFiles(full, rel));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(rel);
    }
  }
  return results;
}

function htmlRelToUrl(rel) {
  const normalized = rel.replace(/\\/g, "/");
  if (normalized === "index.html") {
    return `${SITE_URL}/`;
  }
  if (normalized.endsWith("/index.html")) {
    const route = normalized.slice(0, -"/index.html".length).replace(/^\/+|\/+$/g, "");
    return route ? `${SITE_URL}/${route}/` : `${SITE_URL}/`;
  }
  if (normalized.endsWith(".html")) {
    const route = normalized.slice(0, -".html".length).replace(/^\/+|\/+$/g, "");
    return route ? `${SITE_URL}/${route}/` : `${SITE_URL}/`;
  }
  const route = normalized.replace(/^\/+|\/+$/g, "");
  return route ? `${SITE_URL}/${route}/` : `${SITE_URL}/`;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrlSetXml(urls) {
  const sorted = [...new Set(urls)].sort();
  const body = sorted
    .map(
      (u) =>
        `  <url>\n    <loc>${xmlEscape(u)}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body ? `${body}\n` : ""}</urlset>\n`;
}

function buildSitemapIndexXml(sitemapFiles) {
  const body = sitemapFiles
    .map(
      (name) =>
        `  <sitemap>\n    <loc>${xmlEscape(`${SITE_URL}/${name}`)}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </sitemap>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[sitemaps] dist directory not found: ${DIST_DIR}`);
    process.exit(1);
  }

  const htmlFiles = walkHtmlFiles(DIST_DIR);
  const buckets = {
    core: [],
  };
  for (const v of VERTICALS) {
    for (const l of LOCALES) {
      buckets[`${v}-${l}`] = [];
    }
  }

  for (const rel of htmlFiles) {
    const relNorm = rel.replace(/\\/g, "/").toLowerCase();
    if (relNorm === "404.html" || relNorm === "404/index.html") {
      continue;
    }
    const url = htmlRelToUrl(rel);
    const pathname = url.slice(SITE_URL.length);
    const segs = pathname.split("/").filter(Boolean);
    if (segs.length >= 2 && LOCALES.includes(segs[0]) && VERTICALS.includes(segs[1])) {
      buckets[`${segs[1]}-${segs[0]}`].push(url);
    } else {
      buckets.core.push(url);
    }
  }

  const generatedFiles = [];

  // Core sitemap
  const coreName = "sitemap-core.xml";
  fs.writeFileSync(path.join(DIST_DIR, coreName), buildUrlSetXml(buckets.core), "utf-8");
  generatedFiles.push(coreName);

  // Split vertical-locale sitemaps
  for (const v of VERTICALS) {
    for (const l of LOCALES) {
      const fileName = `sitemap-${v}-${l}.xml`;
      fs.writeFileSync(
        path.join(DIST_DIR, fileName),
        buildUrlSetXml(buckets[`${v}-${l}`]),
        "utf-8"
      );
      generatedFiles.push(fileName);
    }
  }

  // Sitemap index
  fs.writeFileSync(
    path.join(DIST_DIR, "sitemap-index.xml"),
    buildSitemapIndexXml(generatedFiles),
    "utf-8"
  );

  // Dynamic robots.txt matching active SITE_URL
  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap-index.xml\n`;
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), robotsTxt, "utf-8");

  // Required for GitHub Pages so _astro/ CSS/JS assets are never hidden by Jekyll
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "", "utf-8");

  // Emit standalone IndexNow key verification file when configured
  let indexNowNote = "";
  if (INDEXNOW_KEY && /^[a-zA-Z0-9_-]{8,128}$/.test(INDEXNOW_KEY)) {
    fs.writeFileSync(path.join(DIST_DIR, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, "utf-8");
    indexNowNote = ` + ${INDEXNOW_KEY}.txt`;
  }

  console.log(
    `[sitemaps] Generated sitemap-index.xml + ${generatedFiles.length} split sitemaps + robots.txt + .nojekyll${indexNowNote} (${htmlFiles.length} HTML pages, locales=${LOCALES.join(",")}, site=${SITE_URL}).`
  );
  for (const [k, list] of Object.entries(buckets)) {
    console.log(`  - ${k}: ${list.length} URLs`);
  }
}

main();
