/**
 * SpecMatrix Global — Tier 3 Outbound & Citation Link Health Checker (`npm run health:links`)
 *
 * Checks:
 *  - All `citations[].url` across all 4 verticals (wattcheck, puregram, cyclegear, hometech)
 *  - All `official_policy_url` in `data/wattcheck/airlines.json`
 *  - All Coupang short-links in `config/coupang-deeplinks.json`
 *
 * Uses bounded concurrency (6 workers), HEAD-then-GET fallback with 6s timeout,
 * classifies OK / REDIRECT / BOT_CHALLENGE(403/429) / DEAD(404/410/5xx/network),
 * and writes `data/audit/link-health-report.json`.
 *
 * Supports `--dry-run`, `--strict`, `--concurrency=N`, `--timeout=MS`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERTICALS = ["wattcheck", "puregram", "cyclegear", "hometech"];
export const DEFAULT_CONCURRENCY = 6;
export const DEFAULT_TIMEOUT_MS = 6000;
export const LINK_HEALTH_USER_AGENT =
  "SpecMatrix-LinkHealthBot/1.0 (+https://specmatrix.io/en/methodology)";

export const HEALTH_CLASSES = {
  OK: "OK",
  REDIRECT: "REDIRECT",
  BOT_CHALLENGE: "BOT_CHALLENGE",
  DEAD: "DEAD",
};

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function round(val, decimals = 2) {
  if (typeof val !== "number" || !Number.isFinite(val)) return 0;
  const f = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * f) / f;
}

/**
 * Pure HTTP status classifier:
 *  - 2xx -> OK (or REDIRECT if fetch followed a redirect)
 *  - 3xx -> REDIRECT
 *  - 403, 429 -> BOT_CHALLENGE
 *  - 404, 410, 5xx, other 4xx, or network/timeout error -> DEAD
 */
export function classifyHttpStatus(status, { redirected = false, error = null } = {}) {
  if (error || typeof status !== "number" || !Number.isFinite(status)) {
    return HEALTH_CLASSES.DEAD;
  }
  if (status >= 200 && status < 300) {
    return redirected ? HEALTH_CLASSES.REDIRECT : HEALTH_CLASSES.OK;
  }
  if (status >= 300 && status < 400) {
    return HEALTH_CLASSES.REDIRECT;
  }
  if (status === 403 || status === 429) {
    return HEALTH_CLASSES.BOT_CHALLENGE;
  }
  return HEALTH_CLASSES.DEAD;
}

/**
 * Collect and deduplicate all outbound citation, airline policy, and Coupang deeplink URLs.
 */
export function collectLinksToCheck(rootDir) {
  const resolvedRoot = path.resolve(
    rootDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  );
  const urlMap = new Map();
  let totalReferences = 0;

  function addLink(url, source) {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed) return;
    totalReferences += 1;
    if (!urlMap.has(trimmed)) {
      urlMap.set(trimmed, { url: trimmed, sources: [] });
    }
    urlMap.get(trimmed).sources.push(source);
  }

  // 1. All item citations across all 4 verticals
  for (const vertical of VERTICALS) {
    const itemsDir = path.join(resolvedRoot, "data", vertical, "items");
    if (!fs.existsSync(itemsDir)) continue;
    const files = fs
      .readdirSync(itemsDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    for (const fileName of files) {
      const item = readJsonSafe(path.join(itemsDir, fileName));
      if (!item || !Array.isArray(item.citations)) continue;
      const slug = item.slug || fileName.replace(/\.json$/, "");
      for (const cit of item.citations) {
        if (cit?.url) {
          addLink(cit.url, {
            kind: "citation",
            vertical,
            slug,
            label: cit.label || "",
            source_tier: cit.source_tier ?? null,
          });
        }
      }
    }
  }

  // 2. Airlines official policy URLs
  const airlinesFile = path.join(resolvedRoot, "data", "wattcheck", "airlines.json");
  const airlines = readJsonSafe(airlinesFile);
  if (Array.isArray(airlines)) {
    for (const airline of airlines) {
      if (airline?.official_policy_url) {
        addLink(airline.official_policy_url, {
          kind: "airline_policy",
          vertical: "wattcheck",
          slug: airline.slug || "",
          iata_code: airline.iata_code || "",
        });
      }
    }
  }

  // 3. Coupang short-links registry
  const coupangFile = path.join(resolvedRoot, "config", "coupang-deeplinks.json");
  const coupang = readJsonSafe(coupangFile);
  if (coupang?.links && typeof coupang.links === "object") {
    for (const [slug, url] of Object.entries(coupang.links).sort(([a], [b]) => a.localeCompare(b))) {
      addLink(url, {
        kind: "coupang_deeplink",
        vertical: "global",
        slug,
      });
    }
  }

  const targets = [...urlMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  const countsByKind = {
    citation: 0,
    airline_policy: 0,
    coupang_deeplink: 0,
  };

  for (const t of targets) {
    for (const src of t.sources) {
      if (Object.prototype.hasOwnProperty.call(countsByKind, src.kind)) {
        countsByKind[src.kind] += 1;
      }
    }
  }

  return {
    root_dir: resolvedRoot,
    total_references: totalReferences,
    unique_urls: targets.length,
    references_by_kind: countsByKind,
    targets,
  };
}

async function fetchWithTimeout(url, method, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "follow",
      headers: {
        "User-Agent": LINK_HEALTH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    // Drain/cancel body stream promptly so underlying sockets are released
    try {
      await response?.body?.cancel?.();
    } catch {
      // Ignore stream cancellation noise
    }
    return {
      ok: true,
      status: typeof response?.status === "number" ? response.status : null,
      redirected: Boolean(response?.redirected) || (typeof response?.url === "string" && response.url !== "" && response.url !== url),
      finalUrl: response?.url || url,
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const isTimeout = err?.name === "AbortError";
    return {
      ok: false,
      status: null,
      redirected: false,
      finalUrl: url,
      latencyMs,
      error: isTimeout ? `timeout (${timeoutMs}ms)` : err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a single URL with HEAD first and automatic GET fallback when HEAD returns
 * an error, >=400 status (e.g. 405/403/404/429/5xx), or fails at the network layer.
 */
export async function checkSingleUrl(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  let methodUsed = "HEAD";
  let probe = await fetchWithTimeout(url, "HEAD", { fetchImpl, timeoutMs });

  const shouldFallbackToGet =
    !probe.ok ||
    probe.status === null ||
    probe.status >= 400;

  if (shouldFallbackToGet) {
    const getProbe = await fetchWithTimeout(url, "GET", { fetchImpl, timeoutMs });
    methodUsed = "GET";
    probe = getProbe;
  }

  const classification = classifyHttpStatus(probe.status, {
    redirected: probe.redirected,
    error: probe.error,
  });

  return {
    url,
    method_used: methodUsed,
    status: probe.status,
    redirected: probe.redirected,
    final_url: probe.finalUrl,
    classification,
    latency_ms: probe.latencyMs,
    error: probe.error,
  };
}

/**
 * Bounded concurrency worker pool preserving input order.
 */
export async function mapWithConcurrency(items, concurrency, workerFn) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= list.length) break;
      results[idx] = await workerFn(list[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Pure summary aggregator over checked URL results.
 */
export function summarizeHealthResults(results) {
  const list = Array.isArray(results) ? results : [];
  const counts = {
    total_unique_urls: list.length,
    ok: 0,
    redirect: 0,
    bot_challenge: 0,
    dead: 0,
  };

  const bySourceKind = {
    citation: { total: 0, ok: 0, redirect: 0, bot_challenge: 0, dead: 0 },
    airline_policy: { total: 0, ok: 0, redirect: 0, bot_challenge: 0, dead: 0 },
    coupang_deeplink: { total: 0, ok: 0, redirect: 0, bot_challenge: 0, dead: 0 },
  };

  const deadLinks = [];
  const botChallengeLinks = [];

  for (const r of list) {
    const cls = r.classification;
    if (cls === HEALTH_CLASSES.OK) counts.ok += 1;
    else if (cls === HEALTH_CLASSES.REDIRECT) counts.redirect += 1;
    else if (cls === HEALTH_CLASSES.BOT_CHALLENGE) {
      counts.bot_challenge += 1;
      botChallengeLinks.push({
        url: r.url,
        status: r.status,
        method_used: r.method_used,
        sources: r.sources || [],
      });
    } else {
      counts.dead += 1;
      deadLinks.push({
        url: r.url,
        status: r.status,
        method_used: r.method_used,
        error: r.error || null,
        sources: r.sources || [],
      });
    }

    const kindsSeen = new Set((r.sources || []).map((s) => s.kind));
    for (const kind of kindsSeen) {
      const bucket = bySourceKind[kind];
      if (!bucket) continue;
      bucket.total += 1;
      if (cls === HEALTH_CLASSES.OK) bucket.ok += 1;
      else if (cls === HEALTH_CLASSES.REDIRECT) bucket.redirect += 1;
      else if (cls === HEALTH_CLASSES.BOT_CHALLENGE) bucket.bot_challenge += 1;
      else bucket.dead += 1;
    }
  }

  const healthyCount = counts.ok + counts.redirect;
  const deadRatePct =
    counts.total_unique_urls > 0 ? round((counts.dead / counts.total_unique_urls) * 100, 2) : 0;

  return {
    ...counts,
    healthy_count: healthyCount,
    dead_rate_pct: deadRatePct,
    by_source_kind: bySourceKind,
    dead_links: deadLinks,
    bot_challenge_links: botChallengeLinks,
  };
}

/**
 * Execute Tier 3 outbound & citation link health check across the workspace.
 */
export async function runLinkHealthCheck({
  rootDir,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  dryRun = false,
  writeReport = true,
} = {}) {
  const collected = collectLinksToCheck(rootDir);

  if (dryRun) {
    return {
      generated_at: new Date().toISOString(),
      dry_run: true,
      config: { concurrency, timeout_ms: timeoutMs },
      collection: {
        total_references: collected.total_references,
        unique_urls: collected.unique_urls,
        references_by_kind: collected.references_by_kind,
      },
      summary: {
        total_unique_urls: collected.unique_urls,
        checked: 0,
        ok: 0,
        redirect: 0,
        bot_challenge: 0,
        dead: 0,
        healthy_count: 0,
        dead_rate_pct: 0,
      },
      targets: collected.targets,
    };
  }

  const checked = await mapWithConcurrency(collected.targets, concurrency, async (target) => {
    const res = await checkSingleUrl(target.url, { fetchImpl, timeoutMs });
    return {
      ...res,
      sources: target.sources,
    };
  });

  const summary = summarizeHealthResults(checked);

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: false,
    config: { concurrency, timeout_ms: timeoutMs },
    collection: {
      total_references: collected.total_references,
      unique_urls: collected.unique_urls,
      references_by_kind: collected.references_by_kind,
    },
    summary: {
      total_unique_urls: summary.total_unique_urls,
      ok: summary.ok,
      redirect: summary.redirect,
      bot_challenge: summary.bot_challenge,
      dead: summary.dead,
      healthy_count: summary.healthy_count,
      dead_rate_pct: summary.dead_rate_pct,
      by_source_kind: summary.by_source_kind,
    },
    dead_links: summary.dead_links,
    bot_challenge_links: summary.bot_challenge_links,
    results: checked,
  };

  if (writeReport) {
    const auditDir = path.join(collected.root_dir, "data", "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const reportPath = path.join(auditDir, "link-health-report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.report_path = path.relative(collected.root_dir, reportPath).replace(/\\/g, "/");
  }

  return report;
}

function parseNumericFlag(argv, prefix, fallback) {
  const match = argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const parsed = Number(match.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(fileURLToPath(metaUrl));
  const b = path.resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const strict = args.includes("--strict");
  const concurrency = parseNumericFlag(args, "--concurrency=", DEFAULT_CONCURRENCY);
  const timeoutMs = parseNumericFlag(args, "--timeout=", DEFAULT_TIMEOUT_MS);

  const report = await runLinkHealthCheck({
    concurrency,
    timeoutMs,
    dryRun,
    writeReport: !dryRun,
  });

  console.log("=== SpecMatrix Global — Tier 3 Link Health Check ===");
  console.log(
    `Collected: ${report.collection.unique_urls} unique URLs (${report.collection.total_references} total refs)`
  );
  console.log(
    `Breakdown: citations=${report.collection.references_by_kind.citation}, airlines=${report.collection.references_by_kind.airline_policy}, coupang=${report.collection.references_by_kind.coupang_deeplink}`
  );

  if (dryRun) {
    console.log("Mode:      DRY-RUN (0 network requests sent)");
    process.exitCode = 0;
  } else {
    const s = report.summary;
    console.log(
      `Results:   OK=${s.ok} | REDIRECT=${s.redirect} | BOT_CHALLENGE=${s.bot_challenge} | DEAD=${s.dead} (${s.dead_rate_pct}%)`
    );
    if (report.report_path) {
      console.log(`Report:    ${report.report_path}`);
    }
    if (report.dead_links.length > 0) {
      console.warn(`\nDead Links (${report.dead_links.length}):`);
      for (const dl of report.dead_links) {
        console.warn(`  - [${dl.status ?? "NET"}] ${dl.url}${dl.error ? ` (${dl.error})` : ""}`);
      }
    }
    process.exitCode = strict && s.dead > 0 ? 1 : 0;
  }
}
