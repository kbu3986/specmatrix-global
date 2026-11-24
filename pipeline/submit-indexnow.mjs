import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_PUBLIC_SITE_URL = "https://kbu3986.github.io/specmatrix-global";
const VERTICALS = ["wattcheck", "puregram", "cyclegear", "hometech"];
const LOCALES = ["en", "ko"];

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u.startsWith("https://")) locs.push(u);
  }
  return locs;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export function resolveIndexNowConfig({ cfg = {}, env = process.env, argv = process.argv.slice(2) } = {}) {
  const rawSiteUrl = (
    env.PUBLIC_SITE_URL ||
    env.INDEXNOW_SITE_URL ||
    DEFAULT_PUBLIC_SITE_URL ||
    cfg.siteUrl ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  const parsed = new URL(rawSiteUrl);
  const host = (env.INDEXNOW_HOST || parsed.host).trim();
  const basePath = parsed.pathname.replace(/\/+$/, "");
  const sitePrefix = `https://${host}${basePath}`;
  const key = (cfg.verification?.indexNowKey || "").trim();

  const sitemapSources = [
    `${sitePrefix}/sitemap-core.xml`,
    ...VERTICALS.flatMap((v) =>
      LOCALES.map((loc) => `${sitePrefix}/sitemap-${v}-${loc}.xml`)
    ),
  ];

  const includeSibling = argv.includes("--include-sibling-sitemaps");
  if (includeSibling) {
    const rootSitemap = `https://${host}/sitemap.xml`;
    if (!sitemapSources.includes(rootSitemap)) {
      sitemapSources.push(rootSitemap);
    }
  }

  for (const arg of argv) {
    if (arg.startsWith("--extra-sitemap=")) {
      const extra = arg.slice("--extra-sitemap=".length).trim();
      if (extra.startsWith("https://") && !sitemapSources.includes(extra)) {
        sitemapSources.push(extra);
      }
    }
  }

  const keyLocationCandidates = [];
  if (env.INDEXNOW_KEY_LOCATION && env.INDEXNOW_KEY_LOCATION.trim()) {
    keyLocationCandidates.push(env.INDEXNOW_KEY_LOCATION.trim());
  }
  keyLocationCandidates.push(`${sitePrefix}/${key}.txt`);
  if (basePath) {
    keyLocationCandidates.push(`https://${host}/${key}.txt`);
  }

  return {
    siteUrl: sitePrefix,
    host,
    basePath,
    key,
    keyLocationCandidates: [...new Set(keyLocationCandidates)],
    sitemapSources,
  };
}

async function resolveLiveKeyLocation(candidates, expectedKey) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const keyCheck = await fetchText(candidate);
      if (keyCheck.trim() === expectedKey) {
        return candidate;
      }
      lastError = new Error(`Key verification mismatch at ${candidate}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No live IndexNow key file verified");
}

async function main() {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "config", "monetization-config.v2.json"), "utf8")
  );
  const plan = resolveIndexNowConfig({ cfg });
  if (!plan.key) {
    throw new Error("Missing verification.indexNowKey in config/monetization-config.v2.json");
  }

  const keyLocation = await resolveLiveKeyLocation(plan.keyLocationCandidates, plan.key);
  console.log(`[indexnow] Verified live key file: ${keyLocation}`);
  console.log(`[indexnow] Target site: ${plan.siteUrl} (host=${plan.host})`);

  const urlSet = new Set();
  for (const sm of plan.sitemapSources) {
    try {
      const xml = await fetchText(sm);
      const locs = extractLocs(xml).filter((u) => {
        try {
          return new URL(u).host === plan.host;
        } catch {
          return false;
        }
      });
      locs.forEach((u) => urlSet.add(u));
      console.log(`  + ${locs.length} URLs from ${sm}`);
    } catch (err) {
      console.warn(`  ! Skipped ${sm}: ${err.message}`);
    }
  }

  const urlList = Array.from(urlSet);
  if (urlList.length === 0) {
    throw new Error("No URLs collected for IndexNow submission.");
  }

  const body = {
    host: plan.host,
    key: plan.key,
    keyLocation,
    urlList,
  };

  const endpoints = [
    "https://api.indexnow.org/indexnow",
    "https://searchadvisor.naver.com/indexnow",
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      console.log(
        `[indexnow] POST ${ep} -> HTTP ${res.status} (${urlList.length} URLs) ${text ? text.slice(0, 120) : "OK"}`
      );
    } catch (err) {
      console.warn(`[indexnow] POST ${ep} error: ${err.message}`);
    }
  }
}

function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(fileURLToPath(metaUrl));
  const b = path.resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url)) {
  main().catch((err) => {
    console.error("[indexnow] Failed:", err.message);
    process.exit(1);
  });
}
