/**
 * SpecMatrix Global — Stage 3 SERP Information Gain Audit CLI (`npm run audit:ig`)
 *
 * Audits Minimum Viable Value Contract & Information Gain compliance across all 60 items & 25 VS pairs:
 *  - >= 15 quantitative/structured specification fields per item
 *  - >= 3 deterministic derived metrics per item
 *  - >= 2 localized real-world gotchas per active locale (en, ko)
 *  - >= 2 official https:// citations per item
 *  - Information Gain score >= 75 on every item & VS pair
 *  - >= 3 SERP gaps captured & quantitative diff table rows with zero NaN on every VS pair
 *
 * Writes `data/audit/ig-audit-report.json` when `data/audit/` exists.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FX_RATES,
  computeItemDerived,
  computeVsDiffTable,
} from "./derived-metrics.mjs";

const VERTICALS = ["wattcheck", "puregram", "cyclegear"];

export const IG_THRESHOLDS = {
  minStructuredFields: 15,
  minDerivedMetrics: 3,
  minLocalGotchas: 2,
  minCitations: 2,
  minInfoGainScore: 75,
  minVsSerpGaps: 3,
  minVsDiffRows: 5,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function countNonNullFields(obj) {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== "object") return 1;
  if (Array.isArray(obj)) {
    return obj.length > 0 ? 1 : 0;
  }
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (k === "key_specs_kv" && Array.isArray(v)) {
      count += v.filter((entry) => entry && entry.value !== undefined && entry.value !== "").length;
    } else if (Array.isArray(v)) {
      if (v.length > 0) count += 1;
    } else if (typeof v === "object") {
      count += countNonNullFields(v);
    } else if (typeof v === "string") {
      if (v.trim().length > 0) count += 1;
    } else {
      count += 1;
    }
  }
  return count;
}

/**
 * Count quantitative and structured domain specification fields for an item
 * (excluding boilerplate envelope metadata like schema_version, slug, i18n prose, citations, audit).
 */
export function countStructuredFields(item) {
  if (!item || typeof item !== "object") return 0;
  let total = 0;

  if (item.vertical === "wattcheck") {
    total += countNonNullFields(item.specs);
    total += countNonNullFields(item.airline_compliance_profile);
  } else if (item.vertical === "puregram") {
    total += countNonNullFields(item.package_spec);
    total += countNonNullFields(item.nutrition_label);
    if (Array.isArray(item.certifications) && item.certifications.length > 0) total += 1;
  } else if (item.vertical === "cyclegear") {
    total += countNonNullFields(item.specs);
    if (item.compatibility_graph) {
      const { incompatible_notes_ko: _omitKoNote, ...compatCore } = item.compatibility_graph;
      total += countNonNullFields(compatCore);
    }
    if (item.safety_warning) {
      const { torque_or_install_note_ko: _omitKoTorque, ...safetyCore } = item.safety_warning;
      total += countNonNullFields(safetyCore);
    }
  } else {
    total += countNonNullFields(item.specs);
  }

  return total;
}

/**
 * Audit a single item for Stage 3 Information Gain compliance.
 */
export function auditItemInformationGain(item, fx = DEFAULT_FX_RATES) {
  const errors = [];
  const structuredFieldsCount = countStructuredFields(item);

  let derived = null;
  let derivedMetricsCount = 0;
  try {
    derived = computeItemDerived(item, fx);
    derivedMetricsCount = derived.derived_metric_count ?? 0;
  } catch (err) {
    errors.push(`Derived metrics calculation failed: ${err.message}`);
  }

  const activeLocales = Array.isArray(item?.available_locales) && item.available_locales.length > 0
    ? item.available_locales
    : ["en", "ko"];

  const gotchaCounts = {};
  let minGotchas = Infinity;
  for (const loc of activeLocales) {
    const cnt = Array.isArray(item?.i18n?.[loc]?.local_gotchas) ? item.i18n[loc].local_gotchas.length : 0;
    gotchaCounts[loc] = cnt;
    if (cnt < minGotchas) minGotchas = cnt;
  }
  if (!Number.isFinite(minGotchas)) minGotchas = 0;

  const citationsCount = Array.isArray(item?.citations) ? item.citations.length : 0;
  const declaredIgScore = typeof item?.audit?.info_gain_score === "number" ? item.audit.info_gain_score : 0;

  if (structuredFieldsCount < IG_THRESHOLDS.minStructuredFields) {
    errors.push(
      `Structured fields (${structuredFieldsCount}) < minimum ${IG_THRESHOLDS.minStructuredFields}`
    );
  }
  if (derivedMetricsCount < IG_THRESHOLDS.minDerivedMetrics) {
    errors.push(
      `Derived metrics (${derivedMetricsCount}) < minimum ${IG_THRESHOLDS.minDerivedMetrics}`
    );
  }
  if (minGotchas < IG_THRESHOLDS.minLocalGotchas) {
    errors.push(
      `Local gotchas per active locale (${JSON.stringify(gotchaCounts)}) < minimum ${IG_THRESHOLDS.minLocalGotchas}`
    );
  }
  if (citationsCount < IG_THRESHOLDS.minCitations) {
    errors.push(`Citations (${citationsCount}) < minimum ${IG_THRESHOLDS.minCitations}`);
  }
  if (declaredIgScore < IG_THRESHOLDS.minInfoGainScore) {
    errors.push(
      `Declared info_gain_score (${declaredIgScore}) < minimum ${IG_THRESHOLDS.minInfoGainScore}`
    );
  }

  // Objective deterministic IG breakdown (30 + 30 + 20 + 20 = 100 pts)
  const quantPts = Math.min(30, Math.round((structuredFieldsCount / 18) * 30));
  const derivedPts = Math.min(30, Math.round((derivedMetricsCount / 4) * 30));
  const gotchaPts = Math.min(20, Math.round((minGotchas / 2) * 20));
  const localizedPts =
    (activeLocales.includes("en") && activeLocales.includes("ko") ? 10 : 5) +
    (citationsCount >= 2 ? 10 : citationsCount * 5);
  const computedIgScore = Math.min(100, quantPts + derivedPts + gotchaPts + localizedPts);

  return {
    slug: item?.slug ?? "(unknown)",
    vertical: item?.vertical ?? "(unknown)",
    passed: errors.length === 0,
    structured_fields_count: structuredFieldsCount,
    derived_metrics_count: derivedMetricsCount,
    local_gotchas_by_locale: gotchaCounts,
    min_local_gotchas: minGotchas,
    citations_count: citationsCount,
    declared_ig_score: declaredIgScore,
    computed_ig_score: computedIgScore,
    score_breakdown: {
      quantitative_specs: quantPts,
      derived_metrics: derivedPts,
      real_world_caveats: gotchaPts,
      localized_regulatory_value: localizedPts,
    },
    errors,
  };
}

/**
 * Audit a single VS pair for Stage 3 Information Gain compliance.
 */
export function auditVsInformationGain(vsInsight, itemA, itemB, fx = DEFAULT_FX_RATES) {
  const errors = [];
  const declaredIgScore =
    typeof vsInsight?.info_gain_score === "number" ? vsInsight.info_gain_score : 0;
  const serpGapsCount = Array.isArray(vsInsight?.serp_gaps_captured)
    ? vsInsight.serp_gaps_captured.length
    : 0;

  if (declaredIgScore < IG_THRESHOLDS.minInfoGainScore) {
    errors.push(
      `VS info_gain_score (${declaredIgScore}) < minimum ${IG_THRESHOLDS.minInfoGainScore}`
    );
  }
  if (serpGapsCount < IG_THRESHOLDS.minVsSerpGaps) {
    errors.push(
      `VS serp_gaps_captured (${serpGapsCount}) < minimum ${IG_THRESHOLDS.minVsSerpGaps}`
    );
  }

  for (const loc of ["en", "ko"]) {
    const v = vsInsight?.verdict?.[loc];
    if (!v) {
      errors.push(`Missing verdict.${loc}`);
    } else {
      if (!Array.isArray(v.choose_a_if) || v.choose_a_if.length < 2) {
        errors.push(`verdict.${loc}.choose_a_if requires >= 2 entries`);
      }
      if (!Array.isArray(v.choose_b_if) || v.choose_b_if.length < 2) {
        errors.push(`verdict.${loc}.choose_b_if requires >= 2 entries`);
      }
    }
  }

  let diffRowsCount = 0;
  let scoredMetricsCount = 0;
  let nanFound = false;

  if (!itemA || !itemB) {
    errors.push("Missing referenced itemA or itemB for VS diff calculation");
  } else {
    try {
      const diff = computeVsDiffTable(itemA, itemB, fx);
      diffRowsCount = diff.rows.length;
      scoredMetricsCount = diff.summary.total_scored_metrics;

      for (const r of diff.rows) {
        if (
          Number.isNaN(r.value_a) ||
          Number.isNaN(r.value_b) ||
          Number.isNaN(r.delta_a_minus_b) ||
          Number.isNaN(r.delta_pct)
        ) {
          nanFound = true;
        }
      }
      if (nanFound) {
        errors.push("NaN detected in computed VS diff table");
      }
      if (diffRowsCount < IG_THRESHOLDS.minVsDiffRows) {
        errors.push(`VS diff table rows (${diffRowsCount}) < minimum ${IG_THRESHOLDS.minVsDiffRows}`);
      }
    } catch (err) {
      errors.push(`VS diff calculation failed: ${err.message}`);
    }
  }

  return {
    pair_slug: vsInsight?.pair_slug ?? "(unknown)",
    vertical: vsInsight?.vertical ?? "(unknown)",
    passed: errors.length === 0,
    declared_ig_score: declaredIgScore,
    serp_gaps_count: serpGapsCount,
    diff_rows_count: diffRowsCount,
    scored_metrics_count: scoredMetricsCount,
    errors,
  };
}

/**
 * Run Stage 3 SERP Information Gain audit across the workspace.
 */
export function runIgAudit({ rootDir, writeReport = true } = {}) {
  const resolvedRoot = path.resolve(rootDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const manifest = readJson(path.join(resolvedRoot, "data", "pilot-manifest.json"));
  const fx = readJson(path.join(resolvedRoot, "data", "snapshots", "fx-rates.json")) || DEFAULT_FX_RATES;

  if (!manifest) {
    return {
      generated_at: new Date().toISOString(),
      overall_passed: false,
      error: "Missing or invalid data/pilot-manifest.json",
      summary: {},
      items: [],
      vs_pairs: [],
    };
  }

  const itemResults = [];
  const vsResults = [];
  const itemsByVertical = {
    wattcheck: new Map(),
    puregram: new Map(),
    cyclegear: new Map(),
  };

  for (const vertical of VERTICALS) {
    const slugs = Array.isArray(manifest.items?.[vertical]) ? manifest.items[vertical] : [];
    for (const slug of slugs) {
      const itemFile = path.join(resolvedRoot, "data", vertical, "items", `${slug}.json`);
      const item = readJson(itemFile);
      if (!item) {
        itemResults.push({
          slug,
          vertical,
          passed: false,
          structured_fields_count: 0,
          derived_metrics_count: 0,
          min_local_gotchas: 0,
          citations_count: 0,
          declared_ig_score: 0,
          computed_ig_score: 0,
          errors: [`Missing or invalid JSON file: data/${vertical}/items/${slug}.json`],
        });
        continue;
      }
      itemsByVertical[vertical].set(slug, item);
      itemResults.push(auditItemInformationGain(item, fx));
    }
  }

  for (const vertical of VERTICALS) {
    const expectedPairs = Array.isArray(manifest.vs_pairs?.[vertical]) ? manifest.vs_pairs[vertical] : [];
    const vsFile = path.join(resolvedRoot, "data", vertical, "vs-insights.json");
    const vsRaw = readJson(vsFile);
    const vsBySlug = new Map();
    if (Array.isArray(vsRaw)) {
      for (const entry of vsRaw) {
        if (entry?.pair_slug) vsBySlug.set(entry.pair_slug, entry);
      }
    }

    for (const [slugA, slugB] of expectedPairs) {
      const pairSlug = `${slugA}-vs-${slugB}`;
      const vsEntry = vsBySlug.get(pairSlug);
      if (!vsEntry) {
        vsResults.push({
          pair_slug: pairSlug,
          vertical,
          passed: false,
          declared_ig_score: 0,
          serp_gaps_count: 0,
          diff_rows_count: 0,
          scored_metrics_count: 0,
          errors: [`Missing VS insight entry "${pairSlug}" in data/${vertical}/vs-insights.json`],
        });
        continue;
      }
      const itemA = itemsByVertical[vertical].get(slugA);
      const itemB = itemsByVertical[vertical].get(slugB);
      vsResults.push(auditVsInformationGain(vsEntry, itemA, itemB, fx));
    }
  }

  const itemsPassed = itemResults.filter((r) => r.passed).length;
  const vsPassed = vsResults.filter((r) => r.passed).length;
  const avgItemIg =
    itemResults.length > 0
      ? Number(
          (
            itemResults.reduce((acc, r) => acc + (r.declared_ig_score || 0), 0) / itemResults.length
          ).toFixed(2)
        )
      : 0;
  const avgVsIg =
    vsResults.length > 0
      ? Number(
          (vsResults.reduce((acc, r) => acc + (r.declared_ig_score || 0), 0) / vsResults.length).toFixed(2)
        )
      : 0;

  const overallPassed =
    itemResults.length > 0 &&
    vsResults.length > 0 &&
    itemsPassed === itemResults.length &&
    vsPassed === vsResults.length;

  const report = {
    generated_at: new Date().toISOString(),
    overall_passed: overallPassed,
    thresholds: IG_THRESHOLDS,
    summary: {
      items_total: itemResults.length,
      items_passed: itemsPassed,
      items_failed: itemResults.length - itemsPassed,
      avg_item_ig_score: avgItemIg,
      vs_total: vsResults.length,
      vs_passed: vsPassed,
      vs_failed: vsResults.length - vsPassed,
      avg_vs_ig_score: avgVsIg,
    },
    items: itemResults,
    vs_pairs: vsResults,
  };

  const auditDir = path.join(resolvedRoot, "data", "audit");
  if (writeReport && fs.existsSync(auditDir)) {
    const outPath = path.join(auditDir, "ig-audit-report.json");
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.report_path = path.relative(resolvedRoot, outPath).replace(/\\/g, "/");
  }

  return report;
}

function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(fileURLToPath(metaUrl));
  const b = path.resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url)) {
  const report = runIgAudit({ writeReport: true });
  const s = report.summary;

  console.log("=== SpecMatrix Global — Stage 3 SERP Information Gain Audit ===");
  console.log(
    `Items:    ${s.items_passed}/${s.items_total} passed (avg IG score: ${s.avg_item_ig_score})`
  );
  console.log(
    `VS Pairs: ${s.vs_passed}/${s.vs_total} passed (avg IG score: ${s.avg_vs_ig_score})`
  );
  if (report.report_path) {
    console.log(`Report:   ${report.report_path}`);
  }

  if (!report.overall_passed) {
    const failedItems = report.items.filter((r) => !r.passed);
    const failedVs = report.vs_pairs.filter((r) => !r.passed);
    if (failedItems.length > 0) {
      console.error(`\nFailed Items (${failedItems.length}):`);
      for (const fi of failedItems) {
        console.error(`  - [${fi.vertical}] ${fi.slug}: ${fi.errors.join("; ")}`);
      }
    }
    if (failedVs.length > 0) {
      console.error(`\nFailed VS Pairs (${failedVs.length}):`);
      for (const fv of failedVs) {
        console.error(`  - [${fv.vertical}] ${fv.pair_slug}: ${fv.errors.join("; ")}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log("\nPASS: 100% of items & VS pairs satisfy Stage 3 Information Gain gates.");
    process.exitCode = 0;
  }
}
