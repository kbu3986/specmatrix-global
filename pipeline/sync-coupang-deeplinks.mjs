import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VERTICALS = ["wattcheck", "puregram", "cyclegear"];
const OUT_FILE = path.join(REPO_ROOT, "config", "coupang-deeplinks.json");

function loadAllItems() {
  const items = [];
  for (const v of VERTICALS) {
    const dir = path.join(REPO_ROOT, "data", v, "items");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".json")) continue;
      items.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    }
  }
  return items;
}

function buildRawCoupangSearchUrl(searchQuery) {
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(searchQuery)}`;
}

function buildHmacAuthorization(method, urlPath, accessKey, secretKey) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const datetime =
    String(now.getUTCFullYear()).slice(-2) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z";
  const [pathOnly, query = ""] = urlPath.split("?");
  const message = `${datetime}${method}${pathOnly}${query}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function convertBatchViaApi(urls, subId, accessKey, secretKey) {
  const apiPath = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
  const auth = buildHmacAuthorization("POST", apiPath, accessKey, secretKey);
  const res = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coupangUrls: urls,
      subId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Coupang Open API HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.rCode !== "0" || !Array.isArray(json.data)) {
    throw new Error(`Coupang Open API error: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function main() {
  const exportOnly = process.argv.includes("--export-urls");
  const items = loadAllItems();
  const cfg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "config", "monetization-config.v2.json"), "utf8")
  );
  const existing = fs.existsSync(OUT_FILE)
    ? JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))
    : { schema_version: "1.0.0", updated_at: "", links: {} };

  if (exportOnly) {
    console.log("# Coupang Partners Batch Conversion URLs (60 SKUs)");
    for (const item of items) {
      const rawUrl = buildRawCoupangSearchUrl(item.regional_offers.kr.search_query);
      console.log(`${item.slug}\t${rawUrl}`);
    }
    return;
  }

  const accessKey = (process.env.COUPANG_ACCESS_KEY || "").trim();
  const secretKey = (process.env.COUPANG_SECRET_KEY || "").trim();
  if (!accessKey || !secretKey) {
    console.log(
      "[coupang:sync] COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY not set (Open API requires >= 150,000 KRW sales in Coupang Partners)."
    );
    console.log(
      "[coupang:sync] Run `node pipeline/sync-coupang-deeplinks.mjs --export-urls` to export all 60 search URLs for Coupang Partners Center manual link generation, or set COUPANG_ACCESS_KEY & COUPANG_SECRET_KEY to auto-convert."
    );
    return;
  }

  const links = { ...(existing.links || {}) };
  let converted = 0;

  for (const v of VERTICALS) {
    const vItems = items.filter((i) => i.vertical === v);
    const subId = cfg.coupang.verticalSubIds[v] || cfg.coupang.defaultSubId || "ssalmeok-kr";
    for (let i = 0; i < vItems.length; i += 10) {
      const slice = vItems.slice(i, i + 10);
      const rawUrls = slice.map((item) =>
        buildRawCoupangSearchUrl(item.regional_offers.kr.search_query)
      );
      const result = await convertBatchViaApi(rawUrls, subId, accessKey, secretKey);
      result.forEach((entry, idx) => {
        const slug = slice[idx].slug;
        const shortUrl = entry.shortenUrl || entry.landingUrl;
        if (shortUrl && shortUrl.startsWith("https://link.coupang.com/")) {
          links[slug] = shortUrl;
          converted++;
        }
      });
    }
  }

  const payload = {
    schema_version: "1.0.0",
    description:
      "Official Coupang Partners short-link registry (https://link.coupang.com/a/...).",
    updated_at: new Date().toISOString().slice(0, 10),
    links,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[coupang:sync] Saved ${converted} official link.coupang.com URLs -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("[coupang:sync] Failed:", err.message);
  process.exit(1);
});
