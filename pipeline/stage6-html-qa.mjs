/**
 * SpecMatrix Global — Stage 6 Static HTML Build QA Gate (`npm run qa:stage6`)
 *
 * Audits built `web/dist` directory:
 *  1. Total HTML count (>= 200 core pages) & total file count (< 20,000 Cloudflare Pages cap)
 *  2. Visible HTML text scan on EVERY page for forbidden leak tokens (NaN, undefined, [object Object], PENDING_FILL)
 *  3. Internal link resolution for EVERY href="/..." against built files/pages in web/dist
 *  4. Symmetric hreflang (en, ko, x-default) & self-referencing <link rel="canonical"> on all /en/... and /ko/... pages
 *  5. Affiliate disclosure presence & rel="sponsored nofollow noopener" on all affiliate outbound links
 *  6. Valid JSON-LD <script type="application/ld+json"> parsing on every content page
 *  7. ads.txt, robots.txt, sitemap-index.xml, and all 8 split vertical-locale sitemaps
 *  8. Social cards: <meta property="og:image"> + <meta name="twitter:card"> on every localized page,
 *     og:image resolving inside web/dist, and 5 PNG OG cards in web/dist/og/ with valid PNG signatures
 *  9. Client-side search index: web/dist/search-index.json parses cleanly with non-empty
 *     SKU items, airlines, VS, and matrix entries whose paths resolve to built pages
 *
 * Non-localized fallback error pages (404.html) are excluded from canonical/hreflang/social checks.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLOUDFLARE_PAGES_MAX_FILES = 20000;
export const DEFAULT_MIN_CORE_PAGES = 200;

export const REQUIRED_SPLIT_SITEMAPS = [
  { file: "sitemap-wattcheck-en.xml", vertical: "wattcheck", locale: "en" },
  { file: "sitemap-wattcheck-ko.xml", vertical: "wattcheck", locale: "ko" },
  { file: "sitemap-puregram-en.xml", vertical: "puregram", locale: "en" },
  { file: "sitemap-puregram-ko.xml", vertical: "puregram", locale: "ko" },
  { file: "sitemap-cyclegear-en.xml", vertical: "cyclegear", locale: "en" },
  { file: "sitemap-cyclegear-ko.xml", vertical: "cyclegear", locale: "ko" },
  { file: "sitemap-hometech-en.xml", vertical: "hometech", locale: "en" },
  { file: "sitemap-hometech-ko.xml", vertical: "hometech", locale: "ko" },
];

export const REQUIRED_OG_IMAGES = [
  "og-default.png",
  "og-wattcheck.png",
  "og-puregram.png",
  "og-cyclegear.png",
  "og-hometech.png",
];

export const SEARCH_INDEX_FILE = "search-index.json";

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SEARCH_INDEX_REQUIRED_GROUPS = [
  { key: "items", label: "SKU item" },
  { key: "airlines", label: "airline" },
  { key: "vs", label: "VS matchup" },
  { key: "matrices", label: "matrix/compat" },
];

const SEARCH_INDEX_TYPE_TO_GROUP = {
  sku: "items",
  item: "items",
  product: "items",
  airline: "airlines",
  vs: "vs",
  matrix: "matrices",
  compat: "matrices",
};

const MAX_SEARCH_PATH_FAILURES_REPORTED = 25;

export const FORBIDDEN_LEAK_TOKENS = [
  { id: "NaN", regex: /\bNaN\b/ },
  { id: "undefined", regex: /\bundefined\b/ },
  { id: "[object Object]", regex: /\[object Object\]/ },
  { id: "PENDING_FILL", regex: /\bPENDING_FILL\b/ },
];

const AFFILIATE_HOST_PATTERNS = [
  /^(www\.)?amazon\.(com|co\.jp|de|es|co\.uk|ca)$/i,
  /^amzn\.to$/i,
  /^(www\.|link\.)?coupang\.com$/i,
  /^(www\.|kr\.|jp\.|de\.|es\.)?iherb\.com$/i,
  /^(www\.|s\.click\.|ko\.)?aliexpress\.com$/i,
  /(^|\.)awin1\.com$/i,
  /(^|\.)avantlink\.com$/i,
  /(^|\.)sjv\.io$/i,
  /(^|\.)pxf\.io$/i,
];

const AFFILIATE_QUERY_PATTERNS = [
  /[?&]tag=kbu3986-20\b/i,
  /[?&]lptag=AF2200875\b/i,
  /[?&]subid=sm-/i,
];

const DISCLOSURE_PATTERNS = {
  en: /amazon associate|affiliate partner|qualifying purchases|affiliate disclosure|earns from qualifying/i,
  ko: /쿠팡 파트너스|일정액의 수수료|제휴 활동/i,
};

const REQUIRED_AFFILIATE_REL_TOKENS = ["sponsored", "nofollow", "noopener"];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function decodeBasicEntities(str) {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

/**
 * Remove <script>, <style>, and HTML comments while preserving structural HTML tags.
 */
export function stripScriptsStylesComments(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
}

/**
 * Extract visible text from an HTML document (excluding <script>, <style>, comments, and markup tags).
 */
export function stripNonVisibleHtml(html) {
  const withoutBlocks = stripScriptsStylesComments(html);
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Scan visible HTML text for forbidden leak tokens (NaN, undefined, [object Object], PENDING_FILL).
 */
export function scanVisibleLeakTokens(html) {
  const visible = stripNonVisibleHtml(html);
  const hits = [];
  for (const token of FORBIDDEN_LEAK_TOKENS) {
    const match = visible.match(token.regex);
    if (match) {
      const idx = match.index ?? 0;
      const snippet = visible.slice(Math.max(0, idx - 30), Math.min(visible.length, idx + 40));
      hits.push({ token: token.id, snippet });
    }
  }
  return hits;
}

function parseAttributes(attrText) {
  const attrs = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrText)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = decodeBasicEntities(val);
  }
  return attrs;
}

/**
 * Extract all root-relative internal href="/..." values (excluding <script>, <style>, comments, and // protocol-relative URLs).
 */
export function extractInternalHrefs(html) {
  const clean = stripScriptsStylesComments(html);
  const hrefs = [];
  const tagRe = /<(?:a|link|area)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (typeof attrs.href === "string" && attrs.href.startsWith("/") && !attrs.href.startsWith("//")) {
      hrefs.push(attrs.href);
    }
  }
  return hrefs;
}

/**
 * Resolve an internal root-relative href ("/en/about", "/_astro/a.css", "/") against a built dist directory.
 */
export function resolveInternalHref(distDir, href, basePath = "") {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) {
    return false;
  }

  let cleanPath = href.split("#")[0].split("?")[0];
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    return false;
  }

  const normBase =
    basePath && basePath !== "/"
      ? `/${basePath.replace(/^\/+|\/+$/g, "")}`
      : "";
  if (normBase) {
    if (cleanPath === normBase || cleanPath === `${normBase}/`) {
      cleanPath = "/";
    } else if (cleanPath.startsWith(`${normBase}/`)) {
      cleanPath = cleanPath.slice(normBase.length);
    } else {
      return false;
    }
  }

  if (cleanPath === "/" || cleanPath === "") {
    return fs.existsSync(path.join(distDir, "index.html"));
  }

  const trimmed = cleanPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) {
    return fs.existsSync(path.join(distDir, "index.html"));
  }

  // Prevent directory traversal outside distDir
  const resolvedRoot = path.resolve(distDir);
  const candidates = [
    path.resolve(distDir, trimmed),
    path.resolve(distDir, trimmed, "index.html"),
    path.resolve(distDir, `${trimmed}.html`),
  ];

  for (const candidate of candidates) {
    if (!candidate.startsWith(resolvedRoot)) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return true;
      }
    } catch {
      // ignore stat errors
    }
  }

  return false;
}

/**
 * Extract canonical and alternate hreflang <link> tags from HTML.
 */
export function extractLinkTags(html) {
  const clean = stripScriptsStylesComments(html);
  const canonicals = [];
  const alternates = [];
  const linkRe = /<link\b([^>]*)>/gi;
  let m;
  while ((m = linkRe.exec(clean)) !== null) {
    const attrs = parseAttributes(m[1]);
    const relTokens = (attrs.rel || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (relTokens.includes("canonical") && attrs.href) {
      canonicals.push(attrs.href.trim());
    }
    if (relTokens.includes("alternate") && attrs.hreflang && attrs.href) {
      alternates.push({
        hreflang: attrs.hreflang.trim().toLowerCase(),
        href: attrs.href.trim(),
      });
    }
  }
  return { canonicals, alternates };
}

/**
 * Determine whether an outbound URL is an affiliate link.
 */
export function isAffiliateUrl(urlStr) {
  if (typeof urlStr !== "string" || !/^https?:\/\//i.test(urlStr)) return false;
  if (AFFILIATE_QUERY_PATTERNS.some((re) => re.test(urlStr))) return true;
  try {
    const parsed = new URL(urlStr);
    return AFFILIATE_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

/**
 * Extract all affiliate outbound <a> links and validate rel="sponsored nofollow noopener".
 */
export function extractAffiliateLinks(html) {
  const clean = stripScriptsStylesComments(html);
  const results = [];
  const aRe = /<a\b([^>]*)>/gi;
  let m;
  while ((m = aRe.exec(clean)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (!attrs.href || !isAffiliateUrl(attrs.href)) continue;
    const relTokens = new Set(
      (attrs.rel || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
    );
    const missingRel = REQUIRED_AFFILIATE_REL_TOKENS.filter((t) => !relTokens.has(t));
    results.push({
      href: attrs.href,
      rel: attrs.rel || "",
      validRel: missingRel.length === 0,
      missingRel,
    });
  }
  return results;
}

/**
 * Extract and parse all <script type="application/ld+json"> blocks from HTML.
 */
export function extractJsonLdBlocks(html) {
  const blocks = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  while ((m = scriptRe.exec(String(html || ""))) !== null) {
    const attrs = parseAttributes(m[1]);
    const typeVal = (attrs.type || "").split(";")[0].trim().toLowerCase();
    if (typeVal !== "application/ld+json") continue;

    const raw = m[2].trim();
    const blockIndex = idx;
    idx += 1;

    try {
      const parsed = JSON.parse(raw);
      const isObj = parsed !== null && typeof parsed === "object";
      const hasContext =
        isObj &&
        (Array.isArray(parsed)
          ? parsed.every((item) => item && typeof item === "object" && "@context" in item)
          : "@context" in parsed);
      const hasTypeOrGraph =
        isObj &&
        (Array.isArray(parsed)
          ? parsed.every((item) => item && typeof item === "object" && ("@type" in item || "@graph" in item))
          : "@type" in parsed || "@graph" in parsed);

      const leakHit = FORBIDDEN_LEAK_TOKENS.find((t) => t.regex.test(raw));

      blocks.push({
        index: blockIndex,
        valid: Boolean(isObj && hasContext && hasTypeOrGraph && !leakHit),
        parsed,
        error: !isObj
          ? "JSON-LD root must be an object or array"
          : !hasContext
            ? "JSON-LD missing @context"
            : !hasTypeOrGraph
              ? "JSON-LD missing @type or @graph"
              : leakHit
                ? `JSON-LD contains forbidden token "${leakHit.id}"`
                : null,
      });
    } catch (err) {
      blocks.push({
        index: blockIndex,
        valid: false,
        parsed: null,
        error: `JSON.parse error: ${err.message}`,
      });
    }
  }
  return blocks;
}

/**
 * Validate XML sitemap or sitemap-index contents and return extracted <loc> URLs.
 */
export function validateSitemapXml(xml, { kind = "urlset", siteUrl = "https://specmatrix.io", requiredPrefix } = {}) {
  const errors = [];
  const locs = [];
  const text = String(xml || "").trim();

  if (!text) {
    return { valid: false, locs, errors: ["Sitemap file is empty"] };
  }

  const rootTag = kind === "sitemapindex" ? "<sitemapindex" : "<urlset";
  const closeTag = kind === "sitemapindex" ? "</sitemapindex>" : "</urlset>";
  if (!text.includes(rootTag) || !text.includes(closeTag)) {
    errors.push(`Sitemap XML missing expected ${rootTag}...${closeTag} root element`);
  }

  const locRe = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m;
  while ((m = locRe.exec(text)) !== null) {
    const loc = decodeBasicEntities(m[1].trim());
    locs.push(loc);

    let parsed;
    try {
      parsed = new URL(loc);
    } catch {
      errors.push(`Invalid URL in <loc>: "${loc}"`);
      continue;
    }

    if (parsed.protocol !== "https:") {
      errors.push(`Sitemap URL must use https://: "${loc}"`);
    }
    if (siteUrl && !loc.startsWith(siteUrl)) {
      errors.push(`Sitemap URL "${loc}" does not match siteUrl "${siteUrl}"`);
    }
    if (requiredPrefix) {
      const prefixNoSlash = requiredPrefix.replace(/\/+$/, "");
      const prefixWithSlash = `${prefixNoSlash}/`;
      if (loc !== prefixNoSlash && !loc.startsWith(prefixWithSlash)) {
        errors.push(`Sitemap URL "${loc}" does not match expected prefix "${requiredPrefix}"`);
      }
    }
  }

  if (locs.length === 0) {
    errors.push("Sitemap contains 0 <loc> URLs");
  }

  return {
    valid: errors.length === 0,
    locs,
    errors,
  };
}

function htmlFileToRoutePath(distDir, filePath) {
  const rel = path.relative(distDir, filePath).replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) {
    return `/${rel.slice(0, -"/index.html".length)}`;
  }
  if (rel.endsWith(".html")) {
    return `/${rel.slice(0, -".html".length)}`;
  }
  return `/${rel}`;
}

function normalizeUrlNoTrailingSlash(urlStr) {
  try {
    const u = new URL(urlStr);
    const p = u.pathname === "/" ? "/" : u.pathname.replace(/\/+$/, "");
    return `${u.origin}${p}`;
  } catch {
    return String(urlStr || "").replace(/\/+$/, "");
  }
}

function isContentRoute(routePath) {
  return /^\/(en|ko)\/(wattcheck|puregram|cyclegear|hometech)\/(item|vs|matrix|compat)\//.test(routePath);
}

/**
 * True for non-localized fallback error pages (e.g. `404.html`, `404/index.html`, `en/404.html`)
 * which must be excluded from canonical / hreflang / social-card checks.
 */
export function isErrorFallbackPage(relFile) {
  const rel = String(relFile || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  return /(^|\/)(404|500)(\.html|\/index\.html)$/.test(rel);
}

/**
 * Extract <meta> tags keyed by lowercase `property` or `name` (first occurrence wins).
 */
export function extractMetaTags(html) {
  const clean = stripScriptsStylesComments(html);
  const meta = {};
  const metaRe = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = metaRe.exec(clean)) !== null) {
    const attrs = parseAttributes(m[1]);
    const key = (attrs.property || attrs.name || "").trim().toLowerCase();
    if (!key || Object.prototype.hasOwnProperty.call(meta, key)) continue;
    meta[key] = typeof attrs.content === "string" ? attrs.content.trim() : "";
  }
  return meta;
}

/**
 * True when the buffer starts with the 8-byte PNG signature (89 50 4E 47 0D 0A 1A 0A).
 */
export function isValidPngBuffer(buf) {
  if (!buf || typeof buf.length !== "number" || buf.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buf[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function classifySearchEntry(entry) {
  const rawType = String(entry?.t ?? entry?.type ?? entry?.kind ?? "").toLowerCase();
  return SEARCH_INDEX_TYPE_TO_GROUP[rawType] || null;
}

/**
 * Validate a parsed search-index payload.
 *
 * Supports both shapes:
 *  - Flat:  `{ items: [{ t: "sku" | "airline" | "vs" | "matrix" | "tool", p: "/..." }, ...] }`
 *  - Split: `{ items: [...], airlines: [...], vs: [...], matrices: [...] }`
 *
 * Requires non-empty SKU items, airlines, VS, and matrix/compat groups.
 */
export function validateSearchIndexPayload(payload) {
  const errors = [];
  const counts = { items: 0, airlines: 0, vs: 0, matrices: 0, total_entries: 0 };
  const entries = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      valid: false,
      errors: ["search-index.json root must be a JSON object"],
      counts,
      entries,
    };
  }

  const isSplitShape = ["airlines", "vs", "matrices"].some((k) => Array.isArray(payload[k]));

  if (isSplitShape) {
    for (const group of SEARCH_INDEX_REQUIRED_GROUPS) {
      const arr = payload[group.key];
      if (!Array.isArray(arr)) {
        errors.push(`search-index.json missing "${group.key}" array`);
        continue;
      }
      counts[group.key] = arr.length;
      entries.push(...arr);
    }
  } else if (!Array.isArray(payload.items)) {
    errors.push('search-index.json missing "items" array');
  } else {
    entries.push(...payload.items);
    for (const entry of payload.items) {
      const group = classifySearchEntry(entry);
      if (group) counts[group] += 1;
    }
  }

  counts.total_entries = entries.length;

  for (const group of SEARCH_INDEX_REQUIRED_GROUPS) {
    if (counts[group.key] === 0 && !errors.some((e) => e.includes(`"${group.key}"`))) {
      errors.push(`search-index.json has 0 ${group.label} entries (expected non-empty "${group.key}")`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    counts,
    entries,
  };
}

function resolveSearchEntryPath(distDir, rawPath, basePath) {
  const p = String(rawPath || "").split("#")[0];
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  const localized = /^\/(en|ko)(\/|$)/.test(p) ? p : `/en${p === "/" ? "" : p}`;
  return resolveInternalHref(distDir, `${basePath}${localized}`, basePath);
}

/**
 * Run complete Stage 6 HTML QA audit on a built `web/dist` directory.
 */
export function runStage6HtmlQa({
  distDir,
  configPath,
  siteUrl: siteUrlOverride,
  basePath: basePathOverride,
  minCorePages = DEFAULT_MIN_CORE_PAGES,
  maxTotalFiles = CLOUDFLARE_PAGES_MAX_FILES,
  requireSocialMeta = true,
  requireOgImages = true,
  requireSearchIndex = true,
} = {}) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const resolvedDist = path.resolve(distDir || path.join(repoRoot, "web", "dist"));
  const resolvedConfigPath = path.resolve(
    configPath || path.join(repoRoot, "config", "monetization-config.v2.json")
  );

  let config = {
    siteUrl: "https://specmatrix.io",
    adsTxtLine: "google.com, pub-8587506565277191, DIRECT, f08c47fec0942fa0",
  };
  if (fs.existsSync(resolvedConfigPath)) {
    try {
      config = { ...config, ...JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8")) };
    } catch {
      // fall back to defaults
    }
  }
  const siteUrl = String(
    siteUrlOverride || config.siteUrl || "https://specmatrix.io"
  ).replace(/\/+$/, "");
  const rawBasePath = String(basePathOverride || "").trim();
  const basePath =
    rawBasePath && rawBasePath !== "/"
      ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
      : "";

  const failures = [];

  if (!fs.existsSync(resolvedDist) || !fs.statSync(resolvedDist).isDirectory()) {
    failures.push({
      check: "dist_exists",
      file: resolvedDist,
      message: `Build output directory does not exist: ${resolvedDist}`,
    });
    return {
      generated_at: new Date().toISOString(),
      overall_passed: false,
      dist_dir: resolvedDist,
      site_url: siteUrl,
      stats: {
        total_files: 0,
        max_total_files: maxTotalFiles,
        html_files: 0,
        min_core_pages: minCorePages,
        localized_html_files: 0,
        internal_links_checked: 0,
        affiliate_links_checked: 0,
        jsonld_blocks_checked: 0,
        sitemap_files_validated: 0,
        sitemap_urls_checked: 0,
        error_fallback_pages: 0,
        social_meta_pages_checked: 0,
        og_images_validated: 0,
        search_index_entries: 0,
      },
      failures,
    };
  }

  let siteHost = "";
  try {
    siteHost = new URL(siteUrl).host;
  } catch {
    siteHost = "";
  }

  const allFiles = walkFiles(resolvedDist);
  const htmlFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".html"));

  // 1. Cloudflare Pages file cap (< 20,000) & minimum core HTML pages (>= 200)
  if (allFiles.length >= maxTotalFiles) {
    failures.push({
      check: "file_count_cap",
      file: "web/dist",
      message: `Total built file count (${allFiles.length}) reached or exceeded Cloudflare Pages limit (${maxTotalFiles})`,
    });
  }
  if (htmlFiles.length < minCorePages) {
    failures.push({
      check: "min_core_pages",
      file: "web/dist",
      message: `Built HTML page count (${htmlFiles.length}) is below required minimum (${minCorePages})`,
    });
  }

  // Per-page analysis + collect hreflang map for bidirectional symmetry audit
  const localizedPages = new Map();
  let totalInternalLinksChecked = 0;
  let totalAffiliateLinksChecked = 0;
  let totalJsonLdBlocksChecked = 0;
  let errorFallbackPages = 0;
  let socialMetaPagesChecked = 0;

  for (const htmlFile of htmlFiles) {
    const relFile = path.relative(resolvedDist, htmlFile).replace(/\\/g, "/");
    const routePath = htmlFileToRoutePath(resolvedDist, htmlFile);
    const html = fs.readFileSync(htmlFile, "utf8");
    const isErrorPage = isErrorFallbackPage(relFile);
    if (isErrorPage) errorFallbackPages += 1;

    // 2. Forbidden leak tokens in visible text
    const leakHits = scanVisibleLeakTokens(html);
    for (const hit of leakHits) {
      failures.push({
        check: "forbidden_leak_token",
        file: relFile,
        message: `Forbidden token "${hit.token}" leaked in visible text near: "${hit.snippet}"`,
      });
    }

    // 3. Internal href="/..." resolution
    const internalHrefs = extractInternalHrefs(html);
    for (const href of internalHrefs) {
      totalInternalLinksChecked += 1;
      if (!resolveInternalHref(resolvedDist, href, basePath)) {
        failures.push({
          check: "broken_internal_link",
          file: relFile,
          message: `Broken internal link href="${href}" does not resolve in web/dist (basePath="${basePath}")`,
        });
      }
    }

    // 4. Canonical & hreflang on /en/... and /ko/... pages (404/500 fallback pages excluded)
    const locMatch = isErrorPage ? null : routePath.match(/^\/(en|ko)(\/.*)?$/);
    if (locMatch) {
      const locale = locMatch[1];
      const rest = locMatch[2] || "";
      const { canonicals, alternates } = extractLinkTags(html);

      const expectedSelf = `${siteUrl}/${locale}${rest}`;
      const expectedEn = `${siteUrl}/en${rest}`;
      const expectedKo = `${siteUrl}/ko${rest}`;

      if (canonicals.length !== 1) {
        failures.push({
          check: "canonical_missing_or_duplicate",
          file: relFile,
          message: `Expected exactly 1 <link rel="canonical">, found ${canonicals.length}`,
        });
      } else if (normalizeUrlNoTrailingSlash(canonicals[0]) !== expectedSelf) {
        failures.push({
          check: "canonical_not_self_referencing",
          file: relFile,
          message: `Canonical "${canonicals[0]}" does not match self URL "${expectedSelf}"`,
        });
      }

      const altMap = new Map();
      for (const alt of alternates) {
        altMap.set(alt.hreflang, alt.href);
      }

      for (const [langKey, expectedHref] of [
        ["en", expectedEn],
        ["ko", expectedKo],
        ["x-default", expectedEn],
      ]) {
        const actual = altMap.get(langKey);
        if (!actual) {
          failures.push({
            check: "hreflang_missing",
            file: relFile,
            message: `Missing <link rel="alternate" hreflang="${langKey}">`,
          });
        } else if (normalizeUrlNoTrailingSlash(actual) !== expectedHref) {
          failures.push({
            check: "hreflang_target_mismatch",
            file: relFile,
            message: `hreflang="${langKey}" points to "${actual}", expected "${expectedHref}"`,
          });
        }
      }

      if (canonicals.length === 1 && altMap.has(locale) && canonicals[0] !== altMap.get(locale)) {
        failures.push({
          check: "canonical_hreflang_exact_mismatch",
          file: relFile,
          message: `Canonical "${canonicals[0]}" differs from self hreflang="${locale}" ("${altMap.get(locale)}")`,
        });
      }

      localizedPages.set(routePath, {
        file: relFile,
        locale,
        rest,
        altMap,
      });

      // 5a. Affiliate disclosure presence on localized pages
      const visible = stripNonVisibleHtml(html);
      const disclosureRegex = DISCLOSURE_PATTERNS[locale];
      if (disclosureRegex && !disclosureRegex.test(visible)) {
        failures.push({
          check: "affiliate_disclosure_missing",
          file: relFile,
          message: `Missing required ${locale.toUpperCase()} affiliate disclosure text`,
        });
      }

      // 8a. Social card meta tags (og:image + twitter:card) on localized pages
      if (requireSocialMeta) {
        socialMetaPagesChecked += 1;
        const meta = extractMetaTags(html);
        const ogImage = meta["og:image"] || "";
        const twitterCard = meta["twitter:card"] || "";

        if (!ogImage) {
          failures.push({
            check: "og_image_meta_missing",
            file: relFile,
            message: 'Missing non-empty <meta property="og:image" content="...">',
          });
        } else if (!/^https:\/\//i.test(ogImage)) {
          failures.push({
            check: "og_image_meta_not_absolute",
            file: relFile,
            message: `og:image must be an absolute https:// URL (got "${ogImage}")`,
          });
        } else {
          try {
            const ogUrl = new URL(ogImage);
            if (siteHost && ogUrl.host === siteHost && !resolveInternalHref(resolvedDist, ogUrl.pathname, basePath)) {
              failures.push({
                check: "og_image_unresolved",
                file: relFile,
                message: `og:image "${ogImage}" does not resolve to a built file in web/dist`,
              });
            }
          } catch {
            failures.push({
              check: "og_image_meta_not_absolute",
              file: relFile,
              message: `og:image is not a valid URL: "${ogImage}"`,
            });
          }
        }

        if (!twitterCard) {
          failures.push({
            check: "twitter_card_meta_missing",
            file: relFile,
            message: 'Missing non-empty <meta name="twitter:card" content="...">',
          });
        }
      }
    }

    // 5b. Affiliate outbound link rel="sponsored nofollow noopener"
    const affLinks = extractAffiliateLinks(html);
    for (const link of affLinks) {
      totalAffiliateLinksChecked += 1;
      if (!link.validRel) {
        failures.push({
          check: "affiliate_link_rel_invalid",
          file: relFile,
          message: `Affiliate link "${link.href}" missing rel tokens [${link.missingRel.join(", ")}] (got rel="${link.rel}")`,
        });
      }
    }

    // If a non-localized page contains affiliate links, require a disclosure too
    if (!locMatch && affLinks.length > 0) {
      const visible = stripNonVisibleHtml(html);
      if (!DISCLOSURE_PATTERNS.en.test(visible) && !DISCLOSURE_PATTERNS.ko.test(visible)) {
        failures.push({
          check: "affiliate_disclosure_missing",
          file: relFile,
          message: "Page contains affiliate outbound links without affiliate disclosure text",
        });
      }
    }

    // 6. JSON-LD parsing & presence on content pages
    const jsonLdBlocks = extractJsonLdBlocks(html);
    totalJsonLdBlocksChecked += jsonLdBlocks.length;
    for (const block of jsonLdBlocks) {
      if (!block.valid) {
        failures.push({
          check: "jsonld_invalid",
          file: relFile,
          message: `JSON-LD block #${block.index} invalid: ${block.error}`,
        });
      }
    }
    if (isContentRoute(routePath) && jsonLdBlocks.length === 0) {
      failures.push({
        check: "jsonld_missing_on_content_page",
        file: relFile,
        message: `Content page "${routePath}" has 0 <script type="application/ld+json"> blocks`,
      });
    }
  }

  // Bidirectional hreflang symmetry across built localized pages
  for (const [routePath, meta] of localizedPages.entries()) {
    const peerLocale = meta.locale === "en" ? "ko" : "en";
    const peerRoute = `/${peerLocale}${meta.rest}`;
    const peer = localizedPages.get(peerRoute);
    if (!peer) {
      failures.push({
        check: "hreflang_asymmetric_missing_peer",
        file: meta.file,
        message: `Page "${routePath}" references hreflang="${peerLocale}" peer "${peerRoute}" which does not exist in web/dist`,
      });
    } else {
      const peerBackLink = peer.altMap.get(meta.locale);
      const expectedBack = `${siteUrl}${routePath}`;
      if (!peerBackLink || normalizeUrlNoTrailingSlash(peerBackLink) !== expectedBack) {
        failures.push({
          check: "hreflang_asymmetric_backlink",
          file: meta.file,
          message: `Peer "${peerRoute}" does not link back to "${expectedBack}" via hreflang="${meta.locale}"`,
        });
      }
    }
  }

  // 7a. ads.txt
  const adsTxtPath = path.join(resolvedDist, "ads.txt");
  if (!fs.existsSync(adsTxtPath)) {
    failures.push({
      check: "ads_txt_missing",
      file: "ads.txt",
      message: "Missing web/dist/ads.txt",
    });
  } else {
    const adsContent = fs.readFileSync(adsTxtPath, "utf8");
    if (config.adsTxtLine && !adsContent.includes(config.adsTxtLine)) {
      failures.push({
        check: "ads_txt_content_mismatch",
        file: "ads.txt",
        message: `ads.txt missing expected publisher line: "${config.adsTxtLine}"`,
      });
    }
  }

  // 7b. robots.txt
  const robotsTxtPath = path.join(resolvedDist, "robots.txt");
  if (!fs.existsSync(robotsTxtPath)) {
    failures.push({
      check: "robots_txt_missing",
      file: "robots.txt",
      message: "Missing web/dist/robots.txt",
    });
  } else {
    const robotsContent = fs.readFileSync(robotsTxtPath, "utf8");
    if (!/User-agent:/i.test(robotsContent)) {
      failures.push({
        check: "robots_txt_user_agent",
        file: "robots.txt",
        message: "robots.txt missing User-agent directive",
      });
    }
    if (!/Sitemap:\s*https:\/\/[^\s]+sitemap-index\.xml/i.test(robotsContent)) {
      failures.push({
        check: "robots_txt_sitemap_index",
        file: "robots.txt",
        message: "robots.txt missing Sitemap directive pointing to https://.../sitemap-index.xml",
      });
    }
  }

  // 7c. sitemap-index.xml & all 8 split vertical-locale sitemaps
  const sitemapIndexPath = path.join(resolvedDist, "sitemap-index.xml");
  let indexedSitemapLocs = [];
  if (!fs.existsSync(sitemapIndexPath)) {
    failures.push({
      check: "sitemap_index_missing",
      file: "sitemap-index.xml",
      message: "Missing web/dist/sitemap-index.xml",
    });
  } else {
    const indexXml = fs.readFileSync(sitemapIndexPath, "utf8");
    const indexRes = validateSitemapXml(indexXml, { kind: "sitemapindex", siteUrl });
    indexedSitemapLocs = indexRes.locs;
    for (const err of indexRes.errors) {
      failures.push({
        check: "sitemap_index_invalid",
        file: "sitemap-index.xml",
        message: err,
      });
    }

    for (const req of REQUIRED_SPLIT_SITEMAPS) {
      const expectedLoc = `${siteUrl}/${req.file}`;
      if (!indexedSitemapLocs.includes(expectedLoc)) {
        failures.push({
          check: "sitemap_index_missing_split",
          file: "sitemap-index.xml",
          message: `sitemap-index.xml missing required split sitemap "${expectedLoc}"`,
        });
      }
    }
  }

  let totalSitemapUrls = 0;
  const validatedSitemaps = new Set();

  for (const req of REQUIRED_SPLIT_SITEMAPS) {
    validatedSitemaps.add(req.file);
    const smPath = path.join(resolvedDist, req.file);
    if (!fs.existsSync(smPath)) {
      failures.push({
        check: "split_sitemap_missing",
        file: req.file,
        message: `Missing required split sitemap: web/dist/${req.file}`,
      });
      continue;
    }

    const smXml = fs.readFileSync(smPath, "utf8");
    const smRes = validateSitemapXml(smXml, {
      kind: "urlset",
      siteUrl,
      requiredPrefix: `${siteUrl}/${req.locale}/${req.vertical}/`,
    });
    for (const err of smRes.errors) {
      failures.push({
        check: "split_sitemap_invalid",
        file: req.file,
        message: err,
      });
    }

    for (const loc of smRes.locs) {
      totalSitemapUrls += 1;
      try {
        const u = new URL(loc);
        if (!resolveInternalHref(resolvedDist, u.pathname, basePath)) {
          failures.push({
            check: "sitemap_url_404",
            file: req.file,
            message: `Sitemap URL "${loc}" does not resolve to an existing page in web/dist`,
          });
        }
      } catch {
        // already reported by validateSitemapXml
      }
    }
  }

  // Also validate any additional sitemaps referenced in sitemap-index.xml (e.g. sitemap-core.xml)
  for (const loc of indexedSitemapLocs) {
    try {
      const u = new URL(loc);
      const relPathname =
        basePath && u.pathname.startsWith(`${basePath}/`)
          ? u.pathname.slice(basePath.length)
          : u.pathname;
      const fileName = relPathname.replace(/^\/+/, "");
      if (!fileName || validatedSitemaps.has(fileName)) continue;
      validatedSitemaps.add(fileName);
      const extraPath = path.join(resolvedDist, fileName);
      if (!fs.existsSync(extraPath)) {
        failures.push({
          check: "indexed_sitemap_missing",
          file: fileName,
          message: `Sitemap "${fileName}" listed in sitemap-index.xml does not exist in web/dist`,
        });
        continue;
      }
      const extraXml = fs.readFileSync(extraPath, "utf8");
      const extraRes = validateSitemapXml(extraXml, { kind: "urlset", siteUrl });
      for (const err of extraRes.errors) {
        failures.push({
          check: "indexed_sitemap_invalid",
          file: fileName,
          message: err,
        });
      }
      for (const pageLoc of extraRes.locs) {
        totalSitemapUrls += 1;
        try {
          const pu = new URL(pageLoc);
          if (!resolveInternalHref(resolvedDist, pu.pathname, basePath)) {
            failures.push({
              check: "sitemap_url_404",
              file: fileName,
              message: `Sitemap URL "${pageLoc}" does not resolve to an existing page in web/dist`,
            });
          }
        } catch {
          // already reported
        }
      }
    } catch {
      // already reported
    }
  }

  // 8b. OG social card PNGs in web/dist/og/
  let ogImagesValidated = 0;
  if (requireOgImages) {
    for (const fileName of REQUIRED_OG_IMAGES) {
      const relOg = `og/${fileName}`;
      const ogPath = path.join(resolvedDist, "og", fileName);
      if (!fs.existsSync(ogPath) || !fs.statSync(ogPath).isFile()) {
        failures.push({
          check: "og_image_missing",
          file: relOg,
          message: `Missing required OG social card: web/dist/${relOg}`,
        });
        continue;
      }
      let header = Buffer.alloc(0);
      try {
        const fd = fs.openSync(ogPath, "r");
        try {
          header = Buffer.alloc(PNG_SIGNATURE.length);
          const bytesRead = fs.readSync(fd, header, 0, PNG_SIGNATURE.length, 0);
          header = header.subarray(0, bytesRead);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        header = Buffer.alloc(0);
      }
      if (!isValidPngBuffer(header)) {
        failures.push({
          check: "og_image_invalid_png",
          file: relOg,
          message: `web/dist/${relOg} is not a valid PNG (missing 89 50 4E 47 0D 0A 1A 0A signature)`,
        });
        continue;
      }
      ogImagesValidated += 1;
    }
  }

  // 9. Client-side search index (web/dist/search-index.json)
  let searchIndexEntries = 0;
  if (requireSearchIndex) {
    const searchIndexPath = path.join(resolvedDist, SEARCH_INDEX_FILE);
    if (!fs.existsSync(searchIndexPath)) {
      failures.push({
        check: "search_index_missing",
        file: SEARCH_INDEX_FILE,
        message: `Missing web/dist/${SEARCH_INDEX_FILE}`,
      });
    } else {
      let payload = null;
      let parseError = null;
      try {
        payload = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
      } catch (err) {
        parseError = err;
      }

      if (parseError) {
        failures.push({
          check: "search_index_invalid_json",
          file: SEARCH_INDEX_FILE,
          message: `${SEARCH_INDEX_FILE} JSON.parse error: ${parseError.message}`,
        });
      } else {
        const res = validateSearchIndexPayload(payload);
        searchIndexEntries = res.counts.total_entries;
        for (const err of res.errors) {
          failures.push({
            check: "search_index_invalid",
            file: SEARCH_INDEX_FILE,
            message: err,
          });
        }

        let brokenPaths = 0;
        for (const entry of res.entries) {
          const rawPath = entry?.p ?? entry?.path ?? null;
          if (typeof rawPath !== "string") continue;
          if (!resolveSearchEntryPath(resolvedDist, rawPath, basePath)) {
            brokenPaths += 1;
            if (brokenPaths <= MAX_SEARCH_PATH_FAILURES_REPORTED) {
              failures.push({
                check: "search_index_broken_path",
                file: SEARCH_INDEX_FILE,
                message: `Search entry path "${rawPath}" does not resolve to a built /en page in web/dist`,
              });
            }
          }
        }
        if (brokenPaths > MAX_SEARCH_PATH_FAILURES_REPORTED) {
          failures.push({
            check: "search_index_broken_path",
            file: SEARCH_INDEX_FILE,
            message: `... and ${brokenPaths - MAX_SEARCH_PATH_FAILURES_REPORTED} more unresolved search entry paths`,
          });
        }
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    overall_passed: failures.length === 0,
    dist_dir: resolvedDist,
    site_url: siteUrl,
    stats: {
      total_files: allFiles.length,
      max_total_files: maxTotalFiles,
      html_files: htmlFiles.length,
      min_core_pages: minCorePages,
      localized_html_files: localizedPages.size,
      internal_links_checked: totalInternalLinksChecked,
      affiliate_links_checked: totalAffiliateLinksChecked,
      jsonld_blocks_checked: totalJsonLdBlocksChecked,
      sitemap_files_validated: validatedSitemaps.size,
      sitemap_urls_checked: totalSitemapUrls,
      error_fallback_pages: errorFallbackPages,
      social_meta_pages_checked: socialMetaPagesChecked,
      og_images_validated: ogImagesValidated,
      search_index_entries: searchIndexEntries,
    },
    failures,
  };
}

function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(fileURLToPath(metaUrl));
  const b = path.resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url)) {
  const report = runStage6HtmlQa({
    siteUrl: process.env.PUBLIC_SITE_URL,
    basePath: process.env.PUBLIC_BASE_PATH,
  });
  const s = report.stats;

  console.log("=== SpecMatrix Global — Stage 6 Static HTML QA Gate ===");
  console.log(`Dist Dir:        ${report.dist_dir}`);
  console.log(`Total Files:     ${s.total_files} / < ${s.max_total_files} (Cloudflare Pages cap)`);
  console.log(`HTML Pages:      ${s.html_files} (min ${s.min_core_pages}) | Localized: ${s.localized_html_files}`);
  console.log(`Internal Links:  ${s.internal_links_checked} checked`);
  console.log(`Affiliate Links: ${s.affiliate_links_checked} checked`);
  console.log(`JSON-LD Blocks:  ${s.jsonld_blocks_checked} checked`);
  console.log(`Sitemaps:        ${s.sitemap_files_validated} files / ${s.sitemap_urls_checked} URLs checked`);
  console.log(`Social Meta:     ${s.social_meta_pages_checked} localized pages | OG PNGs: ${s.og_images_validated}/${REQUIRED_OG_IMAGES.length}`);
  console.log(`Search Index:    ${s.search_index_entries} entries | Fallback pages excluded: ${s.error_fallback_pages}`);

  if (!report.overall_passed) {
    console.error(`\nSTAGE 6 QA FAILED (${report.failures.length} issues):`);
    const maxPrint = 50;
    for (const f of report.failures.slice(0, maxPrint)) {
      console.error(`  - [${f.check}] ${f.file}: ${f.message}`);
    }
    if (report.failures.length > maxPrint) {
      console.error(`  ... and ${report.failures.length - maxPrint} more issues.`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nPASS: Stage 6 HTML QA gate passed 100% with zero leaks, broken links, or SEO defects.");
    process.exitCode = 0;
  }
}
