import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

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

async function main() {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "config", "monetization-config.v2.json"), "utf8")
  );
  const key = (cfg.verification?.indexNowKey || "").trim();
  if (!key) {
    throw new Error("Missing verification.indexNowKey in config/monetization-config.v2.json");
  }

  const host = (process.env.INDEXNOW_HOST || "kbu3986.github.io").trim();
  const keyLocation = `https://${host}/${key}.txt`;

  // Verify key file is live before submitting
  const keyCheck = await fetchText(keyLocation);
  if (keyCheck.trim() !== key) {
    throw new Error(`Key verification mismatch at ${keyLocation}`);
  }
  console.log(`[indexnow] Verified live key file: ${keyLocation}`);

  // Collect URLs from live sitemaps under this host
  const sitemapSources = [
    `https://${host}/specmatrix-global/sitemap-core.xml`,
    `https://${host}/specmatrix-global/sitemap-wattcheck-en.xml`,
    `https://${host}/specmatrix-global/sitemap-wattcheck-ko.xml`,
    `https://${host}/specmatrix-global/sitemap-puregram-en.xml`,
    `https://${host}/specmatrix-global/sitemap-puregram-ko.xml`,
    `https://${host}/specmatrix-global/sitemap-cyclegear-en.xml`,
    `https://${host}/specmatrix-global/sitemap-cyclegear-ko.xml`,
    `https://${host}/pin2pin-global/sitemap.xml`,
    `https://${host}/sitemap.xml`,
  ];

  const urlSet = new Set();
  for (const sm of sitemapSources) {
    try {
      const xml = await fetchText(sm);
      const locs = extractLocs(xml).filter((u) => {
        try {
          return new URL(u).host === host;
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
    host,
    key,
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

main().catch((err) => {
  console.error("[indexnow] Failed:", err.message);
  process.exit(1);
});
