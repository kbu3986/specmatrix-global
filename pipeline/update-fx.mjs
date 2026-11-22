/**
 * SpecMatrix Global — Tier 1 Daily FX Snapshot Updater (`npm run fx:update`)
 *
 * Fetches https://open.er-api.com/v6/latest/USD (4.5s timeout),
 * validates ±15% anomaly guardrail against existing data/snapshots/fx-rates.json,
 * and updates ONLY on a clean pass (graceful fallback preserving existing snapshot on offline/anomaly).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FX_API_URL = "https://open.er-api.com/v6/latest/USD";
export const FX_TIMEOUT_MS = 4500;
export const FX_ANOMALY_MAX_PCT = 15;
export const REQUIRED_CURRENCIES = ["USD", "KRW", "JPY", "EUR", "GBP"];

const CURRENCY_DECIMALS = {
  USD: 2,
  KRW: 2,
  JPY: 2,
  EUR: 4,
  GBP: 4,
};

function round(val, decimals) {
  const f = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * f) / f;
}

/**
 * Validate incoming FX rates against required currencies and ±15% anomaly guardrail.
 */
export function validateFxRatesUpdate(
  existingSnapshot,
  incomingRates,
  maxDeviationPct = FX_ANOMALY_MAX_PCT
) {
  const errors = [];
  const anomalies = [];
  const normalizedRates = {};

  if (!incomingRates || typeof incomingRates !== "object") {
    return {
      passed: false,
      errors: ["Incoming FX payload missing rates object"],
      anomalies,
      normalizedRates: null,
    };
  }

  for (const cur of REQUIRED_CURRENCIES) {
    const val = incomingRates[cur];
    if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) {
      errors.push(`Invalid or missing rate for ${cur}: ${val}`);
      continue;
    }

    if (cur === "USD" && Math.abs(val - 1.0) > 0.001) {
      errors.push(`Base currency USD rate must equal 1.0 (got ${val})`);
      continue;
    }

    const prev = existingSnapshot?.rates?.[cur];
    if (typeof prev === "number" && Number.isFinite(prev) && prev > 0) {
      const deviationPct = (Math.abs(val - prev) / prev) * 100;
      if (deviationPct > maxDeviationPct + 1e-9) {
        anomalies.push({
          currency: cur,
          previous: prev,
          incoming: val,
          deviation_pct: round(deviationPct, 2),
          max_allowed_pct: maxDeviationPct,
        });
      }
    }

    normalizedRates[cur] = cur === "USD" ? 1.0 : round(val, CURRENCY_DECIMALS[cur] ?? 4);
  }

  return {
    passed: errors.length === 0 && anomalies.length === 0,
    errors,
    anomalies,
    normalizedRates: errors.length === 0 && anomalies.length === 0 ? normalizedRates : null,
  };
}

/**
 * Fetch live FX rates with 4.5s timeout and update snapshot file ONLY on clean pass.
 * Never throws on offline/timeout/anomaly — returns structured result with graceful fallback.
 */
export async function updateFxSnapshot({
  snapshotPath,
  fetchImpl = globalThis.fetch,
  timeoutMs = FX_TIMEOUT_MS,
  maxDeviationPct = FX_ANOMALY_MAX_PCT,
  dryRun = false,
  nowDate,
} = {}) {
  const resolvedSnapshotPath = path.resolve(
    snapshotPath ||
      path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
        "data",
        "snapshots",
        "fx-rates.json"
      )
  );

  let existing = null;
  if (fs.existsSync(resolvedSnapshotPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(resolvedSnapshotPath, "utf8"));
    } catch (err) {
      return {
        updated: false,
        fallback: true,
        reason: "existing_snapshot_corrupt",
        error: `Failed to parse existing snapshot: ${err.message}`,
        snapshot: null,
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload;
  try {
    const response = await fetchImpl(FX_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response || !response.ok) {
      return {
        updated: false,
        fallback: true,
        reason: "http_error",
        error: `FX API returned HTTP ${response?.status ?? "unknown"}`,
        snapshot: existing,
      };
    }
    payload = await response.json();
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    return {
      updated: false,
      fallback: true,
      reason: isTimeout ? "timeout" : "network_error",
      error: isTimeout
        ? `FX API timed out after ${timeoutMs}ms`
        : `FX API request failed: ${err?.message || String(err)}`,
      snapshot: existing,
    };
  } finally {
    clearTimeout(timer);
  }

  if (payload?.result && payload.result !== "success") {
    return {
      updated: false,
      fallback: true,
      reason: "api_error",
      error: `FX API returned non-success result: ${payload.result}`,
      snapshot: existing,
    };
  }

  const validation = validateFxRatesUpdate(existing, payload?.rates, maxDeviationPct);
  if (!validation.passed) {
    return {
      updated: false,
      fallback: true,
      reason: validation.anomalies.length > 0 ? "anomaly_guardrail_triggered" : "validation_error",
      errors: validation.errors,
      anomalies: validation.anomalies,
      snapshot: existing,
    };
  }

  const isoDate = (nowDate ? new Date(nowDate) : new Date()).toISOString().slice(0, 10);
  const nextSnapshot = {
    base: "USD",
    source: "open.er-api.com/v6/latest/USD",
    updated_at: isoDate,
    rates: validation.normalizedRates,
  };

  if (!dryRun) {
    fs.mkdirSync(path.dirname(resolvedSnapshotPath), { recursive: true });
    fs.writeFileSync(resolvedSnapshotPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf8");
  }

  return {
    updated: !dryRun,
    dry_run: dryRun,
    fallback: false,
    reason: "updated",
    snapshot: nextSnapshot,
  };
}

function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(fileURLToPath(metaUrl));
  const b = path.resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url)) {
  const dryRun = process.argv.includes("--dry-run");
  const strict = process.argv.includes("--strict");

  const result = await updateFxSnapshot({ dryRun });

  if (result.fallback) {
    console.warn(`[fx:update] Graceful fallback (${result.reason}) — keeping existing fx-rates.json.`);
    if (result.error) console.warn(`  Detail: ${result.error}`);
    if (result.anomalies?.length) {
      for (const a of result.anomalies) {
        console.warn(
          `  Anomaly: ${a.currency} moved ${a.deviation_pct}% (${a.previous} -> ${a.incoming}, max ±${a.max_allowed_pct}%)`
        );
      }
    }
    if (result.errors?.length) {
      for (const e of result.errors) console.warn(`  Error: ${e}`);
    }
    process.exitCode = strict ? 1 : 0;
  } else {
    console.log(
      `[fx:update] ${dryRun ? "Dry-run validated" : "Updated"} FX snapshot (${result.snapshot.updated_at}):`,
      JSON.stringify(result.snapshot.rates)
    );
    process.exitCode = 0;
  }
}
