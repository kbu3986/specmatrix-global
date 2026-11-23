/**
 * SpecMatrix Global — Master Data Validation CLI (`npm run validate`)
 *
 * Validates:
 *  - All 72 Pilot SKUs (25 WattCheck, 20 PureGram, 15 CycleGear, 12 HomeTech) against Zod SSOT schemas + physics-math.mjs + cross-audit guards
 *  - All 72 Stage 2 Audit Logs (`data/audit/{vertical}/{slug}.audit.json`)
 *  - All 30 Core Global Airlines (`data/wattcheck/airlines.json`)
 *  - All 31 Canonical VS Insights (`data/{vertical}/vs-insights.json`) + cross-reference integrity
 *  - All 13 Matrix & Compat Pages (`data/{vertical}/matrices.json`) + cross-reference integrity
 *  - Quarantine ratio & 15% circuit breaker (`quarantineCircuitBreakerPct`)
 *
 * Writes `data/audit/validation-report.json` when `data/audit/` exists.
 * Exits 0 ONLY on 100% pass; exits non-zero with clear per-file diagnostics otherwise.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AirlineSchema,
  AuditLogSchema,
  CycleGearItemSchema,
  HomeTechItemSchema,
  MatrixPageSchema,
  PureGramItemSchema,
  VsInsightSchema,
  WattCheckItemSchema,
} from "../schemas/ssot-schema.mjs";
import { verifyItemComplete } from "./physics-math.mjs";

const VERTICALS = ["wattcheck", "puregram", "cyclegear", "hometech"];
const ITEM_SCHEMAS = {
  wattcheck: WattCheckItemSchema,
  puregram: PureGramItemSchema,
  cyclegear: CycleGearItemSchema,
  hometech: HomeTechItemSchema,
};

const REQUIRED_AIRLINE_REGIONS = ["KR", "NA", "EU", "APAC", "ME"];
const MIN_AIRLINES_COUNT = 30;

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, missing: true, error: `File not found: ${filePath}` };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, missing: false, error: `Invalid JSON in ${filePath}: ${err.message}` };
  }
}

function formatZodIssues(zodError) {
  return zodError.issues.map((issue) => ({
    code: `ZOD_${issue.code.toUpperCase()}`,
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

function relPath(rootDir, targetPath) {
  return path.relative(rootDir, targetPath).replace(/\\/g, "/");
}

function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Execute full Phase 1 Pilot validation against `rootDir`.
 */
export function runValidation({ rootDir, writeReport = true } = {}) {
  const resolvedRoot = path.resolve(rootDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

  const manifestPath = path.join(resolvedRoot, "data", "pilot-manifest.json");
  const blocklistPath = path.join(resolvedRoot, "schemas", "legacy-blocklist.json");
  const configPath = path.join(resolvedRoot, "config", "monetization-config.v2.json");

  const failures = [];
  const warnings = [];

  const manifestRes = readJsonFile(manifestPath);
  const blocklistRes = readJsonFile(blocklistPath);
  const configRes = readJsonFile(configPath);

  if (!manifestRes.ok) {
    failures.push({
      category: "config",
      vertical: "global",
      id: "pilot-manifest",
      file: relPath(resolvedRoot, manifestPath),
      errors: [{ code: "MISSING_MANIFEST", field: "", message: manifestRes.error }],
    });
  }
  if (!blocklistRes.ok) {
    failures.push({
      category: "config",
      vertical: "global",
      id: "legacy-blocklist",
      file: relPath(resolvedRoot, blocklistPath),
      errors: [{ code: "MISSING_BLOCKLIST", field: "", message: blocklistRes.error }],
    });
  }
  if (!configRes.ok) {
    failures.push({
      category: "config",
      vertical: "global",
      id: "monetization-config",
      file: relPath(resolvedRoot, configPath),
      errors: [{ code: "MISSING_CONFIG", field: "", message: configRes.error }],
    });
  }

  if (!manifestRes.ok || !blocklistRes.ok || !configRes.ok) {
    return {
      generated_at: new Date().toISOString(),
      overall_passed: false,
      circuit_breaker: {
        threshold_pct: 15,
        quarantined_count: 0,
        total_items: 0,
        quarantine_ratio_pct: 0,
        triggered: false,
        status: "CONFIG_ERROR",
      },
      counts: {},
      by_vertical: {},
      quarantined_slugs: [],
      warnings,
      failures,
    };
  }

  const manifest = manifestRes.data;
  const legacyBlocklist = blocklistRes.data;
  const config = configRes.data;

  const activeLocales = config.releaseGate?.activeLocales ?? manifest.active_locales ?? ["en", "ko"];
  const releaseWaveMax = config.releaseGate?.releaseWaveMax ?? 1;
  const minTrustScore = config.releaseGate?.minTrustScore ?? 95;
  const breakerThresholdPct = config.releaseGate?.quarantineCircuitBreakerPct ?? 15;

  const validatedItemsByVertical = {
    wattcheck: new Map(),
    puregram: new Map(),
    cyclegear: new Map(),
    hometech: new Map(),
  };

  const quarantinedSet = new Set();

  const counts = {
    items: { expected: 0, found: 0, passed: 0, failed: 0 },
    audit_logs: { expected: 0, found: 0, passed: 0, failed: 0 },
    airlines: { expected: MIN_AIRLINES_COUNT, found: 0, passed: 0, failed: 0 },
    vs_pairs: { expected: 0, found: 0, passed: 0, failed: 0 },
    matrices: { expected: 0, found: 0, passed: 0, failed: 0 },
  };

  const byVertical = {};

  // ---------------------------------------------------------------------------
  // 1. Validate Items & Audit Logs per Vertical
  // ---------------------------------------------------------------------------
  for (const vertical of VERTICALS) {
    const expectedSlugs = Array.isArray(manifest.items?.[vertical]) ? manifest.items[vertical] : [];
    const expectedSlugSet = new Set(expectedSlugs);

    const vStats = {
      items: { expected: expectedSlugs.length, found: 0, passed: 0, failed: 0 },
      audit_logs: { expected: expectedSlugs.length, found: 0, passed: 0, failed: 0 },
      vs_pairs: {
        expected: Array.isArray(manifest.vs_pairs?.[vertical]) ? manifest.vs_pairs[vertical].length : 0,
        found: 0,
        passed: 0,
        failed: 0,
      },
      matrices: {
        expected: Array.isArray(manifest.matrix_compat?.[vertical])
          ? manifest.matrix_compat[vertical].length
          : 0,
        found: 0,
        passed: 0,
        failed: 0,
      },
    };
    byVertical[vertical] = vStats;

    counts.items.expected += expectedSlugs.length;
    counts.audit_logs.expected += expectedSlugs.length;

    const itemsDir = path.join(resolvedRoot, "data", vertical, "items");
    const auditDir = path.join(resolvedRoot, "data", "audit", vertical);

    // Check for any unlisted item files on disk
    if (fs.existsSync(itemsDir)) {
      const diskFiles = fs.readdirSync(itemsDir).filter((f) => f.endsWith(".json"));
      for (const fileName of diskFiles) {
        const slugFromFile = fileName.replace(/\.json$/, "");
        if (!expectedSlugSet.has(slugFromFile)) {
          warnings.push({
            code: "UNLISTED_ITEM_FILE",
            file: relPath(resolvedRoot, path.join(itemsDir, fileName)),
            message: `Item file "${fileName}" is not listed in pilot-manifest.json`,
          });
        }
      }
    }

    for (const slug of expectedSlugs) {
      // --- Item JSON ---
      const itemFile = path.join(itemsDir, `${slug}.json`);
      const itemRes = readJsonFile(itemFile);
      const itemErrors = [];

      if (!itemRes.ok) {
        itemErrors.push({
          code: itemRes.missing ? "ITEM_FILE_MISSING" : "ITEM_JSON_INVALID",
          field: "",
          message: itemRes.error,
        });
      } else {
        counts.items.found += 1;
        vStats.items.found += 1;
        const item = itemRes.data;

        const zodRes = ITEM_SCHEMAS[vertical].safeParse(item);
        if (!zodRes.success) {
          itemErrors.push(...formatZodIssues(zodRes.error));
        }

        if (item.slug !== slug) {
          itemErrors.push({
            code: "ITEM_SLUG_FILENAME_MISMATCH",
            field: "slug",
            message: `Item slug "${item.slug}" does not match manifest/filename slug "${slug}"`,
          });
        }

        if (item.vertical !== vertical) {
          itemErrors.push({
            code: "ITEM_VERTICAL_MISMATCH",
            field: "vertical",
            message: `Item vertical "${item.vertical}" does not match directory "${vertical}"`,
          });
        }

        if (typeof item.release_wave === "number" && item.release_wave > releaseWaveMax) {
          itemErrors.push({
            code: "ITEM_RELEASE_WAVE_EXCEEDS_GATE",
            field: "release_wave",
            message: `Pilot item release_wave (${item.release_wave}) exceeds releaseWaveMax (${releaseWaveMax})`,
          });
        }

        const itemLocales = Array.isArray(item.available_locales) ? item.available_locales : [];
        for (const reqLocale of activeLocales) {
          if (!itemLocales.includes(reqLocale)) {
            itemErrors.push({
              code: "ITEM_MISSING_ACTIVE_LOCALE",
              field: "available_locales",
              message: `Pilot item must include active locale "${reqLocale}" in available_locales`,
            });
          }
        }

        const physicsAndGuards = verifyItemComplete(item, legacyBlocklist);
        if (!physicsAndGuards.passed) {
          itemErrors.push(...physicsAndGuards.errors);
        }

        if (itemErrors.length === 0) {
          validatedItemsByVertical[vertical].set(slug, item);
        }
      }

      if (itemErrors.length > 0) {
        counts.items.failed += 1;
        vStats.items.failed += 1;
        quarantinedSet.add(`${vertical}/${slug}`);
        failures.push({
          category: "item",
          vertical,
          id: slug,
          file: relPath(resolvedRoot, itemFile),
          errors: itemErrors,
        });
      } else {
        counts.items.passed += 1;
        vStats.items.passed += 1;
      }

      // --- Audit Log JSON ---
      const auditFile = path.join(auditDir, `${slug}.audit.json`);
      const auditRes = readJsonFile(auditFile);
      const auditErrors = [];

      if (!auditRes.ok) {
        auditErrors.push({
          code: auditRes.missing ? "AUDIT_FILE_MISSING" : "AUDIT_JSON_INVALID",
          field: "",
          message: auditRes.error,
        });
      } else {
        counts.audit_logs.found += 1;
        vStats.audit_logs.found += 1;
        const audit = auditRes.data;

        const zodRes = AuditLogSchema.safeParse(audit);
        if (!zodRes.success) {
          auditErrors.push(...formatZodIssues(zodRes.error));
        }

        if (audit.sku_slug !== slug) {
          auditErrors.push({
            code: "AUDIT_SLUG_MISMATCH",
            field: "sku_slug",
            message: `Audit sku_slug "${audit.sku_slug}" does not match expected "${slug}"`,
          });
        }
        if (audit.vertical !== vertical) {
          auditErrors.push({
            code: "AUDIT_VERTICAL_MISMATCH",
            field: "vertical",
            message: `Audit vertical "${audit.vertical}" does not match expected "${vertical}"`,
          });
        }
        if (typeof audit.trust_score === "number" && audit.trust_score < minTrustScore) {
          auditErrors.push({
            code: "AUDIT_TRUST_BELOW_GATE",
            field: "trust_score",
            message: `Audit trust_score (${audit.trust_score}) < minTrustScore (${minTrustScore})`,
          });
        }
      }

      if (auditErrors.length > 0) {
        counts.audit_logs.failed += 1;
        vStats.audit_logs.failed += 1;
        quarantinedSet.add(`${vertical}/${slug}`);
        failures.push({
          category: "audit_log",
          vertical,
          id: slug,
          file: relPath(resolvedRoot, auditFile),
          errors: auditErrors,
        });
      } else {
        counts.audit_logs.passed += 1;
        vStats.audit_logs.passed += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Validate 30 Global Airlines (`data/wattcheck/airlines.json`)
  // ---------------------------------------------------------------------------
  const airlinesFile = path.join(resolvedRoot, "data", "wattcheck", "airlines.json");
  const airlinesRes = readJsonFile(airlinesFile);
  const validAirlineSlugs = new Set();

  if (!airlinesRes.ok) {
    counts.airlines.failed = MIN_AIRLINES_COUNT;
    failures.push({
      category: "airlines",
      vertical: "wattcheck",
      id: "airlines.json",
      file: relPath(resolvedRoot, airlinesFile),
      errors: [
        {
          code: airlinesRes.missing ? "AIRLINES_FILE_MISSING" : "AIRLINES_JSON_INVALID",
          field: "",
          message: airlinesRes.error,
        },
      ],
    });
  } else if (!Array.isArray(airlinesRes.data)) {
    counts.airlines.failed = MIN_AIRLINES_COUNT;
    failures.push({
      category: "airlines",
      vertical: "wattcheck",
      id: "airlines.json",
      file: relPath(resolvedRoot, airlinesFile),
      errors: [
        {
          code: "AIRLINES_NOT_ARRAY",
          field: "",
          message: "data/wattcheck/airlines.json must be a top-level JSON array",
        },
      ],
    });
  } else {
    const airlines = airlinesRes.data;
    counts.airlines.found = airlines.length;
    const seenSlugs = new Set();
    const seenIata = new Set();
    const seenRegions = new Set();

    for (let i = 0; i < airlines.length; i += 1) {
      const rec = airlines[i];
      const recErrors = [];
      const zodRes = AirlineSchema.safeParse(rec);
      if (!zodRes.success) {
        recErrors.push(...formatZodIssues(zodRes.error));
      }

      if (rec?.slug) {
        if (seenSlugs.has(rec.slug)) {
          recErrors.push({
            code: "AIRLINE_DUPLICATE_SLUG",
            field: "slug",
            message: `Duplicate airline slug "${rec.slug}"`,
          });
        }
        seenSlugs.add(rec.slug);
      }

      if (rec?.iata_code) {
        const codeUpper = String(rec.iata_code).toUpperCase();
        if (seenIata.has(codeUpper)) {
          recErrors.push({
            code: "AIRLINE_DUPLICATE_IATA",
            field: "iata_code",
            message: `Duplicate airline IATA code "${codeUpper}"`,
          });
        }
        seenIata.add(codeUpper);
      }

      if (rec?.region) seenRegions.add(rec.region);

      if (recErrors.length > 0) {
        counts.airlines.failed += 1;
        failures.push({
          category: "airlines",
          vertical: "wattcheck",
          id: rec?.slug || `index:${i}`,
          file: relPath(resolvedRoot, airlinesFile),
          errors: recErrors,
        });
      } else {
        counts.airlines.passed += 1;
        validAirlineSlugs.add(rec.slug);
      }
    }

    const collectionErrors = [];
    if (airlines.length < MIN_AIRLINES_COUNT) {
      collectionErrors.push({
        code: "AIRLINES_COUNT_BELOW_MIN",
        field: "length",
        message: `Expected at least ${MIN_AIRLINES_COUNT} airlines, found ${airlines.length}`,
      });
    }
    for (const region of REQUIRED_AIRLINE_REGIONS) {
      if (!seenRegions.has(region)) {
        collectionErrors.push({
          code: "AIRLINES_MISSING_REGION",
          field: "region",
          message: `Airlines DB is missing required region "${region}"`,
        });
      }
    }
    if (collectionErrors.length > 0) {
      failures.push({
        category: "airlines",
        vertical: "wattcheck",
        id: "airlines-completeness",
        file: relPath(resolvedRoot, airlinesFile),
        errors: collectionErrors,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Validate 25 VS Insights & Cross-Reference Integrity
  // ---------------------------------------------------------------------------
  for (const vertical of VERTICALS) {
    const manifestPairs = Array.isArray(manifest.vs_pairs?.[vertical]) ? manifest.vs_pairs[vertical] : [];
    counts.vs_pairs.expected += manifestPairs.length;

    const vsFile = path.join(resolvedRoot, "data", vertical, "vs-insights.json");
    const vsRes = readJsonFile(vsFile);

    if (!vsRes.ok) {
      if (vsRes.missing && manifestPairs.length === 0) {
        continue;
      }
      counts.vs_pairs.failed += manifestPairs.length;
      byVertical[vertical].vs_pairs.failed += manifestPairs.length;
      failures.push({
        category: "vs_insight",
        vertical,
        id: "vs-insights.json",
        file: relPath(resolvedRoot, vsFile),
        errors: [
          {
            code: vsRes.missing ? "VS_FILE_MISSING" : "VS_JSON_INVALID",
            field: "",
            message: vsRes.error,
          },
        ],
      });
      continue;
    }

    if (!Array.isArray(vsRes.data)) {
      counts.vs_pairs.failed += manifestPairs.length;
      byVertical[vertical].vs_pairs.failed += manifestPairs.length;
      failures.push({
        category: "vs_insight",
        vertical,
        id: "vs-insights.json",
        file: relPath(resolvedRoot, vsFile),
        errors: [
          {
            code: "VS_NOT_ARRAY",
            field: "",
            message: `data/${vertical}/vs-insights.json must be a top-level JSON array`,
          },
        ],
      });
      continue;
    }

    const vsList = vsRes.data;
    counts.vs_pairs.found += vsList.length;
    byVertical[vertical].vs_pairs.found = vsList.length;

    const seenPairSlugs = new Set();
    const validPairSlugs = new Set();
    const itemsMap = validatedItemsByVertical[vertical];
    const manifestItemSet = new Set(manifest.items?.[vertical] || []);

    for (let i = 0; i < vsList.length; i += 1) {
      const entry = vsList[i];
      const entryErrors = [];

      const zodRes = VsInsightSchema.safeParse(entry);
      if (!zodRes.success) {
        entryErrors.push(...formatZodIssues(zodRes.error));
      }

      if (entry?.vertical !== vertical) {
        entryErrors.push({
          code: "VS_VERTICAL_MISMATCH",
          field: "vertical",
          message: `VS insight vertical "${entry?.vertical}" does not match "${vertical}"`,
        });
      }

      if (entry?.pair_slug) {
        if (seenPairSlugs.has(entry.pair_slug)) {
          entryErrors.push({
            code: "VS_DUPLICATE_PAIR",
            field: "pair_slug",
            message: `Duplicate VS pair_slug "${entry.pair_slug}"`,
          });
        }
        seenPairSlugs.add(entry.pair_slug);
      }

      if (entry?.slug_a && !itemsMap.has(entry.slug_a)) {
        const reason = manifestItemSet.has(entry.slug_a)
          ? `referenced item "${entry.slug_a}" failed validation or is missing`
          : `referenced item "${entry.slug_a}" does not exist in ${vertical}`;
        entryErrors.push({
          code: "VS_BROKEN_REF_A",
          field: "slug_a",
          message: `Cross-reference error: ${reason}`,
        });
      }

      if (entry?.slug_b && !itemsMap.has(entry.slug_b)) {
        const reason = manifestItemSet.has(entry.slug_b)
          ? `referenced item "${entry.slug_b}" failed validation or is missing`
          : `referenced item "${entry.slug_b}" does not exist in ${vertical}`;
        entryErrors.push({
          code: "VS_BROKEN_REF_B",
          field: "slug_b",
          message: `Cross-reference error: ${reason}`,
        });
      }

      if (entryErrors.length > 0) {
        counts.vs_pairs.failed += 1;
        byVertical[vertical].vs_pairs.failed += 1;
        failures.push({
          category: "vs_insight",
          vertical,
          id: entry?.pair_slug || `index:${i}`,
          file: relPath(resolvedRoot, vsFile),
          errors: entryErrors,
        });
      } else {
        counts.vs_pairs.passed += 1;
        byVertical[vertical].vs_pairs.passed += 1;
        validPairSlugs.add(entry.pair_slug);
      }
    }

    // Check manifest VS completeness
    for (const [slugA, slugB] of manifestPairs) {
      const expectedPair = `${slugA}-vs-${slugB}`;
      if (slugA >= slugB) {
        failures.push({
          category: "vs_insight",
          vertical,
          id: expectedPair,
          file: relPath(resolvedRoot, manifestPath),
          errors: [
            {
              code: "MANIFEST_VS_NON_CANONICAL",
              field: `vs_pairs.${vertical}`,
              message: `Manifest VS pair [${slugA}, ${slugB}] violates canonical slug_a < slug_b order`,
            },
          ],
        });
      }
      if (!seenPairSlugs.has(expectedPair)) {
        counts.vs_pairs.failed += 1;
        byVertical[vertical].vs_pairs.failed += 1;
        failures.push({
          category: "vs_insight",
          vertical,
          id: expectedPair,
          file: relPath(resolvedRoot, vsFile),
          errors: [
            {
              code: "VS_MANIFEST_PAIR_MISSING",
              field: "pair_slug",
              message: `Required manifest VS pair "${expectedPair}" is missing from ${relPath(resolvedRoot, vsFile)}`,
            },
          ],
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Validate 10 Matrix & Compat Pages + Cross-Reference Integrity
  // ---------------------------------------------------------------------------
  for (const vertical of VERTICALS) {
    const manifestMatrices = Array.isArray(manifest.matrix_compat?.[vertical])
      ? manifest.matrix_compat[vertical]
      : [];
    counts.matrices.expected += manifestMatrices.length;

    const matrixFile = path.join(resolvedRoot, "data", vertical, "matrices.json");
    const matrixRes = readJsonFile(matrixFile);

    if (!matrixRes.ok) {
      if (matrixRes.missing && manifestMatrices.length === 0) {
        continue;
      }
      counts.matrices.failed += manifestMatrices.length;
      byVertical[vertical].matrices.failed += manifestMatrices.length;
      failures.push({
        category: "matrix",
        vertical,
        id: "matrices.json",
        file: relPath(resolvedRoot, matrixFile),
        errors: [
          {
            code: matrixRes.missing ? "MATRIX_FILE_MISSING" : "MATRIX_JSON_INVALID",
            field: "",
            message: matrixRes.error,
          },
        ],
      });
      continue;
    }

    if (!Array.isArray(matrixRes.data)) {
      counts.matrices.failed += manifestMatrices.length;
      byVertical[vertical].matrices.failed += manifestMatrices.length;
      failures.push({
        category: "matrix",
        vertical,
        id: "matrices.json",
        file: relPath(resolvedRoot, matrixFile),
        errors: [
          {
            code: "MATRIX_NOT_ARRAY",
            field: "",
            message: `data/${vertical}/matrices.json must be a top-level JSON array`,
          },
        ],
      });
      continue;
    }

    const matrices = matrixRes.data;
    counts.matrices.found += matrices.length;
    byVertical[vertical].matrices.found = matrices.length;

    const seenMatrixKeys = new Set();
    const itemsMap = validatedItemsByVertical[vertical];

    for (let i = 0; i < matrices.length; i += 1) {
      const m = matrices[i];
      const mErrors = [];

      const zodRes = MatrixPageSchema.safeParse(m);
      if (!zodRes.success) {
        mErrors.push(...formatZodIssues(zodRes.error));
      }

      if (m?.vertical !== vertical) {
        mErrors.push({
          code: "MATRIX_VERTICAL_MISMATCH",
          field: "vertical",
          message: `Matrix vertical "${m?.vertical}" does not match "${vertical}"`,
        });
      }

      const key = `${m?.archetype}:${m?.slug}`;
      if (m?.archetype && m?.slug) {
        if (seenMatrixKeys.has(key)) {
          mErrors.push({
            code: "MATRIX_DUPLICATE_KEY",
            field: "slug",
            message: `Duplicate matrix/compat entry "${key}"`,
          });
        }
        seenMatrixKeys.add(key);
      }

      if (Array.isArray(m?.featured_item_slugs)) {
        for (const refSlug of m.featured_item_slugs) {
          const isValidItem = itemsMap.has(refSlug);
          const isAirlinesPageAirlineRef =
            vertical === "wattcheck" && m.slug === "airlines-30" && validAirlineSlugs.has(refSlug);
          if (!isValidItem && !isAirlinesPageAirlineRef) {
            mErrors.push({
              code: "MATRIX_BROKEN_FEATURED_REF",
              field: "featured_item_slugs",
              message: `Featured slug "${refSlug}" does not resolve to a validated ${vertical} item`,
            });
          }
        }
      }

      if (mErrors.length > 0) {
        counts.matrices.failed += 1;
        byVertical[vertical].matrices.failed += 1;
        failures.push({
          category: "matrix",
          vertical,
          id: m?.slug || `index:${i}`,
          file: relPath(resolvedRoot, matrixFile),
          errors: mErrors,
        });
      } else {
        counts.matrices.passed += 1;
        byVertical[vertical].matrices.passed += 1;
      }
    }

    for (const req of manifestMatrices) {
      const key = `${req.archetype}:${req.slug}`;
      if (!seenMatrixKeys.has(key)) {
        counts.matrices.failed += 1;
        byVertical[vertical].matrices.failed += 1;
        failures.push({
          category: "matrix",
          vertical,
          id: req.slug,
          file: relPath(resolvedRoot, matrixFile),
          errors: [
            {
              code: "MATRIX_MANIFEST_ENTRY_MISSING",
              field: "slug",
              message: `Required manifest ${req.archetype} page "${req.slug}" missing from ${relPath(resolvedRoot, matrixFile)}`,
            },
          ],
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Quarantine Ratio & 15% Circuit Breaker
  // ---------------------------------------------------------------------------
  const totalItems = counts.items.expected;
  const quarantinedSlugs = [...quarantinedSet].sort();
  const quarantineRatioPct = totalItems > 0 ? round((quarantinedSlugs.length / totalItems) * 100, 2) : 0;
  const circuitBreakerTriggered = quarantineRatioPct > breakerThresholdPct;
  const breakerStatus = circuitBreakerTriggered
    ? "RED_CIRCUIT_BREAKER"
    : quarantineRatioPct >= 10
      ? "YELLOW_HOLD"
      : "GREEN";

  const overallPassed = failures.length === 0 && !circuitBreakerTriggered;

  const report = {
    generated_at: new Date().toISOString(),
    pilot_version: manifest.pilot_version,
    overall_passed: overallPassed,
    circuit_breaker: {
      threshold_pct: breakerThresholdPct,
      quarantined_count: quarantinedSlugs.length,
      total_items: totalItems,
      quarantine_ratio_pct: quarantineRatioPct,
      triggered: circuitBreakerTriggered,
      status: breakerStatus,
    },
    counts,
    by_vertical: byVertical,
    quarantined_slugs: quarantinedSlugs,
    warnings,
    failures,
  };

  const auditRootDir = path.join(resolvedRoot, "data", "audit");
  if (writeReport && fs.existsSync(auditRootDir)) {
    const reportPath = path.join(auditRootDir, "validation-report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.report_path = relPath(resolvedRoot, reportPath);
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
  const report = runValidation({ writeReport: true });
  const c = report.counts;
  const cb = report.circuit_breaker;

  console.log("=== SpecMatrix Global — Stage 2 Master Validation ===");
  console.log(
    `Items:      ${c.items?.passed ?? 0}/${c.items?.expected ?? 0} passed (${c.items?.failed ?? 0} failed)`
  );
  console.log(
    `Audit Logs: ${c.audit_logs?.passed ?? 0}/${c.audit_logs?.expected ?? 0} passed (${c.audit_logs?.failed ?? 0} failed)`
  );
  console.log(
    `Airlines:   ${c.airlines?.passed ?? 0}/${c.airlines?.expected ?? 0} passed (${c.airlines?.failed ?? 0} failed)`
  );
  console.log(
    `VS Pairs:   ${c.vs_pairs?.passed ?? 0}/${c.vs_pairs?.expected ?? 0} passed (${c.vs_pairs?.failed ?? 0} failed)`
  );
  console.log(
    `Matrices:   ${c.matrices?.passed ?? 0}/${c.matrices?.expected ?? 0} passed (${c.matrices?.failed ?? 0} failed)`
  );
  console.log(
    `Quarantine: ${cb.quarantined_count}/${cb.total_items} (${cb.quarantine_ratio_pct}%) | Circuit Breaker (>${cb.threshold_pct}%): ${cb.status}`
  );

  if (report.report_path) {
    console.log(`Report:     ${report.report_path}`);
  }

  if (report.warnings.length > 0) {
    console.warn(`\nWarnings (${report.warnings.length}):`);
    for (const w of report.warnings) {
      console.warn(`  - [${w.code}] ${w.file}: ${w.message}`);
    }
  }

  if (!report.overall_passed) {
    console.error(`\nFAILURES (${report.failures.length} entries):`);
    for (const f of report.failures) {
      console.error(`  [${f.category}] ${f.file} (${f.id})`);
      for (const err of f.errors) {
        console.error(`    - ${err.code}${err.field ? ` (${err.field})` : ""}: ${err.message}`);
      }
    }
    if (cb.triggered) {
      console.error(
        `\nCIRCUIT BREAKER TRIGGERED: Quarantine ratio ${cb.quarantine_ratio_pct}% exceeds ${cb.threshold_pct}% threshold!`
      );
    }
    process.exitCode = 1;
  } else {
    console.log("\nPASS: 100% of Phase 1 Pilot data passed schema, physics, cross-audit & manifest gates.");
    process.exitCode = 0;
  }
}
