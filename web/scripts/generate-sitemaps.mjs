import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(WEB_DIR, "dist");
const SITE_URL = "https://specmatrix.io";
const VERTICALS = ["wattcheck", "puregram", "cyclegear"];
const LOCALES = ["en", "ko"];
const TODAY = new Date().toISOString().slice(0, 10);

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
    const route = normalized.slice(0, -"/index.html".length);
    return `${SITE_URL}/${route}`;
  }
  if (normalized.endsWith(".html")) {
    return `${SITE_URL}/${normalized.slice(0, -".html".length)}`;
  }
  return `${SITE_URL}/${normalized}`;
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

  // 6 split vertical-locale sitemaps
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

  console.log(
    `[sitemaps] Generated sitemap-index.xml + ${generatedFiles.length} split sitemaps (${htmlFiles.length} total HTML pages).`
  );
  for (const [k, list] of Object.entries(buckets)) {
    console.log(`  - ${k}: ${list.length} URLs`);
  }
}

main();
