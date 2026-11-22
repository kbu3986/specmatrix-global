/**
 * SpecMatrix Global — Stage 2 Deterministic Physics, Math & Cross-Audit Verifier
 *
 * Pure, side-effect-free invariant checks for:
 *  - WattCheck (battery Wh math, port allocation matrix, IATA/MOLIT carry-on rules, GaN guards)
 *  - PureGram  (net-weight math, macro & active ceilings, purity %, total active, kcal, YMYL filter)
 *  - CycleGear (power-meter accuracy, road-tire width & hookless safety cap, trainer noise dBA)
 *  - Cross-Audit Guards (SM-01 legacy 48-slug blocklist, SM-02 MSRP mode & unique real ASINs,
 *    citations >= 2, trust_score >= 95, info_gain_score >= 75)
 */

const EPS = 1e-9;

export const REAL_ASIN_REGEX = /^B0[0-9A-Z]{8}$/;

export const FORBIDDEN_ASIN_PATTERNS = [
  /ASSIOMA/i,
  /PLACEHOLDER/i,
  /TEST/i,
  /DUMMY/i,
  /SAMPLE/i,
  /XXXXX/i,
  /^B000000000$/,
];

export const FORBIDDEN_YMYL_PATTERNS = [
  { id: "ko_amino_spiking_accusation", regex: /아미노\s*스파이킹\s*의혹/i },
  { id: "en_amino_spiking_scam", regex: /amino\s*spiking\s*(scam|fraud|suspicion)/i },
  { id: "en_medical_cures", regex: /\bcures\b/i },
  { id: "en_treats_disease", regex: /\btreats?\s+diseases?\b/i },
  { id: "en_prevents_disease", regex: /\bprevents?\s+diseases?\b/i },
  { id: "ko_medical_treatment", regex: /질병을?\s*(치료|완치|예방)/i },
];

function makeError(code, field, message) {
  return { code, field, message };
}

function collectStrings(value, prefix = "", out = []) {
  if (typeof value === "string") {
    out.push({ field: prefix, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectStrings(value[i], `${prefix}[${i}]`, out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      collectStrings(v, next, out);
    }
  }
  return out;
}

/**
 * Verify WattCheck physics, port power allocation, and IATA airline compliance invariants.
 */
export function verifyWattCheckPhysics(item) {
  const errors = [];
  const checks = {};

  if (!item || typeof item !== "object" || !item.specs || !item.airline_compliance_profile) {
    errors.push(
      makeError(
        "WATT_MISSING_SECTIONS",
        "specs",
        "WattCheck item must include specs and airline_compliance_profile"
      )
    );
    return { passed: false, errors, checks };
  }

  const { specs, airline_compliance_profile: air } = item;

  // 1. Battery vs GaN invariants
  if (specs.has_battery === true) {
    const wh = specs.battery_energy_wh;
    const mah = specs.nominal_capacity_mah;
    const v = specs.nominal_voltage_v;

    if (typeof wh !== "number" || !Number.isFinite(wh) || wh <= 0) {
      errors.push(
        makeError("WATT_BATTERY_WH_REQUIRED", "specs.battery_energy_wh", "Battery item requires positive battery_energy_wh")
      );
    }
    if (typeof mah !== "number" || !Number.isFinite(mah) || mah <= 0) {
      errors.push(
        makeError("WATT_BATTERY_MAH_REQUIRED", "specs.nominal_capacity_mah", "Battery item requires positive nominal_capacity_mah")
      );
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      errors.push(
        makeError("WATT_BATTERY_V_REQUIRED", "specs.nominal_voltage_v", "Battery item requires positive nominal_voltage_v")
      );
    }

    if (
      typeof wh === "number" &&
      wh > 0 &&
      typeof mah === "number" &&
      mah > 0 &&
      typeof v === "number" &&
      v > 0
    ) {
      const expectedWh = (mah * v) / 1000;
      const whDeviation = Math.abs(wh - expectedWh) / wh;
      checks.wh_expected = Number(expectedWh.toFixed(4));
      checks.wh_deviation_ratio = Number(whDeviation.toFixed(6));

      if (whDeviation > 0.05 + EPS) {
        errors.push(
          makeError(
            "WATT_WH_FORMULA_MISMATCH",
            "specs.battery_energy_wh",
            `Wh invariant failed: |${wh} - (${mah} * ${v} / 1000)| / ${wh} = ${(whDeviation * 100).toFixed(2)}% (> 5.00%)`
          )
        );
      }

      // IATA carry-on thresholds
      if (wh > 100) {
        if (air.carryon_no_approval !== false) {
          errors.push(
            makeError(
              "WATT_IATA_OVER_100WH_APPROVAL",
              "airline_compliance_profile.carryon_no_approval",
              `Battery ${wh} Wh > 100 Wh MUST have carryon_no_approval === false`
            )
          );
        }
        if (air.iata_tier === "under_100wh_no_approval" || air.iata_tier === "no_battery_always_allowed") {
          errors.push(
            makeError(
              "WATT_IATA_TIER_MISMATCH",
              "airline_compliance_profile.iata_tier",
              `Battery ${wh} Wh > 100 Wh cannot have iata_tier "${air.iata_tier}"`
            )
          );
        }
      } else {
        if (air.iata_tier !== "under_100wh_no_approval") {
          errors.push(
            makeError(
              "WATT_IATA_TIER_UNDER_100WH",
              "airline_compliance_profile.iata_tier",
              `Battery ${wh} Wh <= 100 Wh must have iata_tier "under_100wh_no_approval" (got "${air.iata_tier}")`
            )
          );
        }
      }

      if (wh > 160) {
        if (air.carryon_allowed !== false) {
          errors.push(
            makeError(
              "WATT_IATA_OVER_160WH_CARRYON",
              "airline_compliance_profile.carryon_allowed",
              `Battery ${wh} Wh > 160 Wh MUST have carryon_allowed === false`
            )
          );
        }
        if (air.iata_tier !== "over_160wh_prohibited") {
          errors.push(
            makeError(
              "WATT_IATA_TIER_OVER_160WH",
              "airline_compliance_profile.iata_tier",
              `Battery ${wh} Wh > 160 Wh MUST have iata_tier "over_160wh_prohibited" (got "${air.iata_tier}")`
            )
          );
        }
      } else if (wh > 100) {
        if (air.iata_tier !== "100_to_160wh_approval_required") {
          errors.push(
            makeError(
              "WATT_IATA_TIER_100_TO_160WH",
              "airline_compliance_profile.iata_tier",
              `Battery ${wh} Wh in (100, 160] MUST have iata_tier "100_to_160wh_approval_required" (got "${air.iata_tier}")`
            )
          );
        }
      }

      if (air.checked_baggage !== "prohibited") {
        errors.push(
          makeError(
            "WATT_BATTERY_CHECKED_PROHIBITED",
            "airline_compliance_profile.checked_baggage",
            `Lithium battery item (${wh} Wh) must have checked_baggage === "prohibited"`
          )
        );
      }
    }

    if (
      specs.conversion_efficiency_pct !== null &&
      specs.conversion_efficiency_pct !== undefined &&
      (specs.conversion_efficiency_pct < 60 || specs.conversion_efficiency_pct > 95)
    ) {
      errors.push(
        makeError(
          "WATT_EFFICIENCY_RANGE",
          "specs.conversion_efficiency_pct",
          `conversion_efficiency_pct (${specs.conversion_efficiency_pct}) must be within 60–95%`
        )
      );
    }
  } else if (specs.has_battery === false) {
    if (air.iata_tier !== "no_battery_always_allowed") {
      errors.push(
        makeError(
          "WATT_GAN_IATA_TIER",
          "airline_compliance_profile.iata_tier",
          `Non-battery item (has_battery === false) MUST have iata_tier === "no_battery_always_allowed" (got "${air.iata_tier}")`
        )
      );
    }
    if (air.carryon_allowed !== true || air.carryon_no_approval !== true) {
      errors.push(
        makeError(
          "WATT_GAN_CARRYON_FLAGS",
          "airline_compliance_profile",
          "Non-battery item MUST have carryon_allowed === true and carryon_no_approval === true"
        )
      );
    }
    if (air.checked_baggage !== "allowed") {
      errors.push(
        makeError(
          "WATT_GAN_CHECKED_BAGGAGE",
          "airline_compliance_profile.checked_baggage",
          'Non-battery item MUST have checked_baggage === "allowed"'
        )
      );
    }
    if (specs.battery_energy_wh !== null && specs.battery_energy_wh !== undefined) {
      errors.push(
        makeError(
          "WATT_GAN_NONNULL_WH",
          "specs.battery_energy_wh",
          "Non-battery item (has_battery === false) must have battery_energy_wh === null"
        )
      );
    }
    if (specs.nominal_capacity_mah !== null && specs.nominal_capacity_mah !== undefined) {
      errors.push(
        makeError(
          "WATT_GAN_NONNULL_MAH",
          "specs.nominal_capacity_mah",
          "Non-battery item (has_battery === false) must have nominal_capacity_mah === null"
        )
      );
    }
  } else {
    errors.push(
      makeError("WATT_HAS_BATTERY_BOOLEAN", "specs.has_battery", "specs.has_battery must be boolean")
    );
  }

  // 2. Output wattage consistency
  if (
    typeof specs.max_single_port_output_w === "number" &&
    typeof specs.max_total_output_w === "number" &&
    specs.max_single_port_output_w > specs.max_total_output_w + EPS
  ) {
    errors.push(
      makeError(
        "WATT_SINGLE_EXCEEDS_TOTAL",
        "specs.max_single_port_output_w",
        `max_single_port_output_w (${specs.max_single_port_output_w} W) exceeds max_total_output_w (${specs.max_total_output_w} W)`
      )
    );
  }

  // 3. Port definitions & Port Allocation Matrix invariants
  const ports = Array.isArray(specs.ports) ? specs.ports : [];
  const portMap = new Map();
  for (let i = 0; i < ports.length; i += 1) {
    const p = ports[i];
    if (!p || !p.id) {
      errors.push(makeError("WATT_INVALID_PORT", `specs.ports[${i}]`, "Port must have a valid id"));
      continue;
    }
    if (portMap.has(p.id)) {
      errors.push(
        makeError("WATT_DUPLICATE_PORT_ID", `specs.ports[${i}].id`, `Duplicate port id "${p.id}"`)
      );
    }
    portMap.set(p.id, p);
  }

  const matrix = Array.isArray(specs.port_allocation_matrix) ? specs.port_allocation_matrix : [];
  if (matrix.length === 0) {
    errors.push(
      makeError(
        "WATT_EMPTY_PORT_MATRIX",
        "specs.port_allocation_matrix",
        "port_allocation_matrix must contain at least 1 allocation row"
      )
    );
  }

  let maxRowSum = 0;
  for (let idx = 0; idx < matrix.length; idx += 1) {
    const row = matrix[idx];
    const activePorts = Array.isArray(row?.active_ports) ? row.active_ports : [];
    const outputW = row?.output_w && typeof row.output_w === "object" ? row.output_w : {};
    const activeSet = new Set(activePorts);

    for (const pid of activePorts) {
      if (!portMap.has(pid)) {
        errors.push(
          makeError(
            "WATT_UNKNOWN_ACTIVE_PORT",
            `specs.port_allocation_matrix[${idx}].active_ports`,
            `Active port "${pid}" does not exist in specs.ports`
          )
        );
      }
      if (!Object.prototype.hasOwnProperty.call(outputW, pid)) {
        errors.push(
          makeError(
            "WATT_MISSING_PORT_OUTPUT",
            `specs.port_allocation_matrix[${idx}].output_w`,
            `Active port "${pid}" is missing from output_w`
          )
        );
      }
    }

    let rowSum = 0;
    for (const [pid, w] of Object.entries(outputW)) {
      if (!portMap.has(pid)) {
        errors.push(
          makeError(
            "WATT_UNKNOWN_OUTPUT_PORT",
            `specs.port_allocation_matrix[${idx}].output_w.${pid}`,
            `Output port "${pid}" does not exist in specs.ports`
          )
        );
      }
      if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
        errors.push(
          makeError(
            "WATT_INVALID_PORT_WATTAGE",
            `specs.port_allocation_matrix[${idx}].output_w.${pid}`,
            `Invalid wattage value (${w}) for port "${pid}"`
          )
        );
        continue;
      }
      if (w > 0 && !activeSet.has(pid)) {
        errors.push(
          makeError(
            "WATT_INACTIVE_PORT_HAS_OUTPUT",
            `specs.port_allocation_matrix[${idx}].output_w.${pid}`,
            `Port "${pid}" outputs ${w} W but is not listed in active_ports`
          )
        );
      }
      const portDef = portMap.get(pid);
      if (portDef && typeof portDef.max_w === "number" && w > portDef.max_w + EPS) {
        errors.push(
          makeError(
            "WATT_PORT_EXCEEDS_MAX_W",
            `specs.port_allocation_matrix[${idx}].output_w.${pid}`,
            `Port "${pid}" allocated ${w} W exceeds its declared max_w (${portDef.max_w} W)`
          )
        );
      }
      rowSum += w;
    }

    if (rowSum > maxRowSum) maxRowSum = rowSum;
    if (
      typeof specs.max_total_output_w === "number" &&
      rowSum > specs.max_total_output_w + EPS
    ) {
      errors.push(
        makeError(
          "WATT_PORT_SUM_EXCEEDS_MAX",
          `specs.port_allocation_matrix[${idx}].output_w`,
          `Allocation row sum (${rowSum} W) exceeds max_total_output_w (${specs.max_total_output_w} W)`
        )
      );
    }
  }

  checks.port_matrix_rows = matrix.length;
  checks.port_matrix_max_sum_w = Number(maxRowSum.toFixed(2));

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}

/**
 * Scan PureGram textual content for forbidden YMYL accusation or medical claim terms (SM-05).
 */
export function scanYmylForbiddenTerms(item) {
  const hits = [];
  const targets = [
    { prefix: "i18n", value: item?.i18n },
    { prefix: "nutrition_label.sweetener_details", value: item?.nutrition_label?.sweetener_details },
    { prefix: "derived_math", value: item?.derived_math },
    { prefix: "certifications", value: item?.certifications },
  ];

  for (const target of targets) {
    const strings = collectStrings(target.value, target.prefix, []);
    for (const { field, text } of strings) {
      for (const rule of FORBIDDEN_YMYL_PATTERNS) {
        const match = text.match(rule.regex);
        if (match) {
          hits.push({
            rule_id: rule.id,
            field,
            matched: match[0],
          });
        }
      }
    }
  }
  return hits;
}

/**
 * Verify PureGram nutrition-label math invariants and SM-05 YMYL safety compliance.
 */
export function verifyPureGramPhysics(item) {
  const errors = [];
  const checks = {};

  if (!item || typeof item !== "object" || !item.package_spec || !item.nutrition_label || !item.derived_math) {
    errors.push(
      makeError(
        "PURE_MISSING_SECTIONS",
        "package_spec",
        "PureGram item must include package_spec, nutrition_label, and derived_math"
      )
    );
    return { passed: false, errors, checks };
  }

  const { package_spec: pkg, nutrition_label: nut, derived_math: dm } = item;

  // 1. Package net weight check: abs(serving_weight_g * total_servings - net_weight_g) / net_weight_g <= 0.05
  if (pkg.net_weight_g > 0) {
    const expectedNet = pkg.serving_weight_g * pkg.total_servings;
    const netDev = Math.abs(expectedNet - pkg.net_weight_g) / pkg.net_weight_g;
    checks.net_weight_expected_g = Number(expectedNet.toFixed(3));
    checks.net_weight_deviation_ratio = Number(netDev.toFixed(6));

    if (netDev > 0.05 + EPS) {
      errors.push(
        makeError(
          "PURE_NET_WEIGHT_MISMATCH",
          "package_spec.net_weight_g",
          `Net weight invariant failed: |${pkg.serving_weight_g} * ${pkg.total_servings} - ${pkg.net_weight_g}| / ${pkg.net_weight_g} = ${(netDev * 100).toFixed(2)}% (> 5.00%)`
        )
      );
    }
  } else {
    errors.push(
      makeError("PURE_NET_WEIGHT_POSITIVE", "package_spec.net_weight_g", "net_weight_g must be > 0")
    );
  }

  // 2. Macro sum ceiling: protein + carbs + fat <= serving_weight_g
  const macroSum = nut.protein_g + nut.carbs_g + nut.fat_g;
  checks.macro_sum_g = Number(macroSum.toFixed(3));
  if (macroSum > pkg.serving_weight_g + EPS) {
    errors.push(
      makeError(
        "PURE_MACRO_EXCEEDS_SERVING",
        "nutrition_label",
        `protein (${nut.protein_g}) + carbs (${nut.carbs_g}) + fat (${nut.fat_g}) = ${macroSum} g exceeds serving_weight_g (${pkg.serving_weight_g} g)`
      )
    );
  }

  // 3. Active per serving ceiling: active_per_serving_g <= serving_weight_g
  if (nut.active_per_serving_g > pkg.serving_weight_g + EPS) {
    errors.push(
      makeError(
        "PURE_ACTIVE_EXCEEDS_SERVING",
        "nutrition_label.active_per_serving_g",
        `active_per_serving_g (${nut.active_per_serving_g} g) exceeds serving_weight_g (${pkg.serving_weight_g} g)`
      )
    );
  }

  // 4. Purity percentage check: abs(purity_pct - active/serving*100) <= 0.5
  if (pkg.serving_weight_g > 0) {
    const expectedPurity = (nut.active_per_serving_g / pkg.serving_weight_g) * 100;
    const purityDiff = Math.abs(dm.purity_pct - expectedPurity);
    checks.purity_expected_pct = Number(expectedPurity.toFixed(4));
    checks.purity_diff_pct_pts = Number(purityDiff.toFixed(4));

    if (purityDiff > 0.5 + EPS) {
      errors.push(
        makeError(
          "PURE_PURITY_MISMATCH",
          "derived_math.purity_pct",
          `Purity invariant failed: |${dm.purity_pct} - ${expectedPurity.toFixed(2)}| = ${purityDiff.toFixed(2)} pp (> 0.50 pp)`
        )
      );
    }
  }

  // 5. Total pure active check: abs(total_pure_active_g - active*servings) / total_pure_active_g <= 0.02
  if (dm.total_pure_active_g > 0) {
    const expectedTotalActive = nut.active_per_serving_g * pkg.total_servings;
    const totalActiveDev = Math.abs(dm.total_pure_active_g - expectedTotalActive) / dm.total_pure_active_g;
    checks.total_pure_active_expected_g = Number(expectedTotalActive.toFixed(4));
    checks.total_pure_active_deviation_ratio = Number(totalActiveDev.toFixed(6));

    if (totalActiveDev > 0.02 + EPS) {
      errors.push(
        makeError(
          "PURE_TOTAL_ACTIVE_MISMATCH",
          "derived_math.total_pure_active_g",
          `Total pure active invariant failed: |${dm.total_pure_active_g} - ${expectedTotalActive.toFixed(2)}| / ${dm.total_pure_active_g} = ${(totalActiveDev * 100).toFixed(2)}% (> 2.00%)`
        )
      );
    }
  } else {
    errors.push(
      makeError(
        "PURE_TOTAL_ACTIVE_POSITIVE",
        "derived_math.total_pure_active_g",
        "total_pure_active_g must be > 0"
      )
    );
  }

  // 6. Calorie consistency check when calories_kcal >= 20 (<= 15% deviation)
  if (nut.calories_kcal >= 20) {
    const expectedKcal = 4 * nut.protein_g + 4 * nut.carbs_g + 9 * nut.fat_g;
    const kcalDev = Math.abs(expectedKcal - nut.calories_kcal) / nut.calories_kcal;
    checks.kcal_expected = Number(expectedKcal.toFixed(2));
    checks.kcal_deviation_ratio = Number(kcalDev.toFixed(6));

    if (kcalDev > 0.15 + EPS) {
      errors.push(
        makeError(
          "PURE_CALORIE_MISMATCH",
          "nutrition_label.calories_kcal",
          `Calorie invariant failed: |4*${nut.protein_g} + 4*${nut.carbs_g} + 9*${nut.fat_g} (${expectedKcal}) - ${nut.calories_kcal}| / ${nut.calories_kcal} = ${(kcalDev * 100).toFixed(2)}% (> 15.00%)`
        )
      );
    }
  } else {
    checks.kcal_check_skipped = true;
  }

  // 7. Carb 90g/hr servings check when provided on carbohydrate products
  if (
    nut.active_ingredient_type === "carbohydrates" &&
    dm.servings_for_90g_per_hour !== null &&
    dm.servings_for_90g_per_hour !== undefined
  ) {
    const expected90 = 90 / nut.active_per_serving_g;
    const diff90 = Math.abs(dm.servings_for_90g_per_hour - expected90);
    checks.servings_90g_expected = Number(expected90.toFixed(2));
    if (diff90 > 0.05 + EPS) {
      errors.push(
        makeError(
          "PURE_90G_SERVINGS_MISMATCH",
          "derived_math.servings_for_90g_per_hour",
          `servings_for_90g_per_hour (${dm.servings_for_90g_per_hour}) differs from 90 / ${nut.active_per_serving_g} (${expected90.toFixed(2)})`
        )
      );
    }
  }

  // 8. SM-05 YMYL forbidden accusation/medical term scan
  const ymylHits = scanYmylForbiddenTerms(item);
  checks.ymyl_hits_count = ymylHits.length;
  for (const hit of ymylHits) {
    errors.push(
      makeError(
        "PURE_YMYL_FORBIDDEN_TERM",
        hit.field,
        `Forbidden YMYL term matched (${hit.rule_id}): "${hit.matched}"`
      )
    );
  }

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}

/**
 * Verify CycleGear physics, engineering bounds, and mandatory SM-05 hookless tire safety rules.
 */
export function verifyCycleGearPhysics(item) {
  const errors = [];
  const checks = {};

  if (!item || typeof item !== "object" || !item.specs || !item.safety_warning) {
    errors.push(
      makeError(
        "CYCLE_MISSING_SECTIONS",
        "specs",
        "CycleGear item must include specs and safety_warning"
      )
    );
    return { passed: false, errors, checks };
  }

  const { category, specs, safety_warning: safety } = item;

  if (typeof specs.weight_g !== "number" || !Number.isFinite(specs.weight_g) || specs.weight_g <= 0) {
    errors.push(makeError("CYCLE_WEIGHT_POSITIVE", "specs.weight_g", "weight_g must be > 0"));
  }

  // Power meter accuracy invariant: 0.5% - 3.0%
  if (category === "power-meter") {
    const acc = specs.claimed_accuracy_pct;
    checks.claimed_accuracy_pct = acc;
    if (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0.5 - EPS || acc > 3.0 + EPS) {
      errors.push(
        makeError(
          "CYCLE_POWER_METER_ACCURACY",
          "specs.claimed_accuracy_pct",
          `Power meter claimed_accuracy_pct (${acc}) must be within 0.5–3.0%`
        )
      );
    }
  } else if (specs.claimed_accuracy_pct !== null && specs.claimed_accuracy_pct !== undefined) {
    if (specs.claimed_accuracy_pct < 0.5 - EPS || specs.claimed_accuracy_pct > 3.0 + EPS) {
      errors.push(
        makeError(
          "CYCLE_ACCURACY_RANGE",
          "specs.claimed_accuracy_pct",
          `claimed_accuracy_pct (${specs.claimed_accuracy_pct}) out of valid range 0.5–3.0%`
        )
      );
    }
  }

  // Road tire width (23-45mm) + mandatory hookless safety rules
  if (category === "road-tire") {
    const width = specs.tire_width_mm;
    const maxPsi = specs.hookless_max_psi;
    checks.tire_width_mm = width;
    checks.requires_hookless_warning = safety.requires_hookless_warning;
    checks.hookless_max_psi = maxPsi;

    if (typeof width !== "number" || !Number.isFinite(width) || width < 23 - EPS || width > 45 + EPS) {
      errors.push(
        makeError(
          "CYCLE_TIRE_WIDTH_RANGE",
          "specs.tire_width_mm",
          `Road tire tire_width_mm (${width}) must be within 23–45 mm`
        )
      );
    }

    if (safety.requires_hookless_warning !== true) {
      errors.push(
        makeError(
          "CYCLE_HOOKLESS_WARNING_REQUIRED",
          "safety_warning.requires_hookless_warning",
          "Road tire MUST set safety_warning.requires_hookless_warning === true (SM-05)"
        )
      );
    }

    if (specs.hookless_compatible !== false) {
      if (typeof maxPsi !== "number" || !Number.isFinite(maxPsi) || maxPsi <= 0 || maxPsi > 73 + EPS) {
        errors.push(
          makeError(
            "CYCLE_HOOKLESS_MAX_PSI",
            "specs.hookless_max_psi",
            `Road tire hookless_max_psi (${maxPsi}) must be positive and <= 73 psi (ETRTO 5.0 bar / 72.5 psi cap)`
          )
        );
      }
    } else if (maxPsi !== null && maxPsi !== undefined && (maxPsi <= 0 || maxPsi > 73 + EPS)) {
      errors.push(
        makeError(
          "CYCLE_HOOKLESS_MAX_PSI",
          "specs.hookless_max_psi",
          `hookless_max_psi (${maxPsi}) must be <= 73 psi`
        )
      );
    }
  } else {
    if (
      specs.tire_width_mm !== null &&
      specs.tire_width_mm !== undefined &&
      (specs.tire_width_mm < 23 - EPS || specs.tire_width_mm > 45 + EPS)
    ) {
      errors.push(
        makeError(
          "CYCLE_TIRE_WIDTH_RANGE",
          "specs.tire_width_mm",
          `tire_width_mm (${specs.tire_width_mm}) must be within 23–45 mm`
        )
      );
    }
    if (
      specs.hookless_max_psi !== null &&
      specs.hookless_max_psi !== undefined &&
      (specs.hookless_max_psi <= 0 || specs.hookless_max_psi > 73 + EPS)
    ) {
      errors.push(
        makeError(
          "CYCLE_HOOKLESS_MAX_PSI",
          "specs.hookless_max_psi",
          `hookless_max_psi (${specs.hookless_max_psi}) must be <= 73 psi`
        )
      );
    }
  }

  // Smart trainer noise invariant: 15 <= noise_dba <= 85
  if (category === "smart-trainer") {
    const dba = specs.trainer_noise_dba;
    checks.trainer_noise_dba = dba;
    if (typeof dba !== "number" || !Number.isFinite(dba) || dba < 15 - EPS || dba > 85 + EPS) {
      errors.push(
        makeError(
          "CYCLE_TRAINER_NOISE_RANGE",
          "specs.trainer_noise_dba",
          `Smart trainer trainer_noise_dba (${dba}) must be within 15–85 dBA`
        )
      );
    }
    if (typeof specs.max_trainer_watts !== "number" || specs.max_trainer_watts <= 0) {
      errors.push(
        makeError(
          "CYCLE_TRAINER_WATTS_REQUIRED",
          "specs.max_trainer_watts",
          "Smart trainer must specify positive max_trainer_watts"
        )
      );
    }
  } else if (
    specs.trainer_noise_dba !== null &&
    specs.trainer_noise_dba !== undefined &&
    (specs.trainer_noise_dba < 15 - EPS || specs.trainer_noise_dba > 85 + EPS)
  ) {
    errors.push(
      makeError(
        "CYCLE_TRAINER_NOISE_RANGE",
        "specs.trainer_noise_dba",
        `trainer_noise_dba (${specs.trainer_noise_dba}) must be within 15–85 dBA`
      )
    );
  }

  // Drivetrain speeds sanity check
  if (category === "drivetrain") {
    const speeds = specs.drivetrain_speeds;
    checks.drivetrain_speeds = speeds;
    if (!Number.isInteger(speeds) || speeds < 11 || speeds > 13) {
      errors.push(
        makeError(
          "CYCLE_DRIVETRAIN_SPEEDS",
          "specs.drivetrain_speeds",
          `Drivetrain drivetrain_speeds (${speeds}) must be an integer in 11–13`
        )
      );
    }
  }

  // GPS computer battery sanity check
  if (category === "gps-computer") {
    const hrs = specs.battery_life_hours;
    checks.battery_life_hours = hrs;
    if (typeof hrs !== "number" || !Number.isFinite(hrs) || hrs <= 0) {
      errors.push(
        makeError(
          "CYCLE_GPS_BATTERY_REQUIRED",
          "specs.battery_life_hours",
          "GPS computer must specify positive battery_life_hours"
        )
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}

function normalizeLegacyBlocklist(legacyBlocklist) {
  if (!legacyBlocklist) return new Set();
  if (legacyBlocklist instanceof Set) return legacyBlocklist;
  if (Array.isArray(legacyBlocklist)) return new Set(legacyBlocklist);
  if (Array.isArray(legacyBlocklist.blocked_slugs)) return new Set(legacyBlocklist.blocked_slugs);
  return new Set();
}

/**
 * Verify cross-audit operational & compliance guards (SM-01, SM-02, Stage 2/3 thresholds).
 */
export function verifyCrossAuditGuards(item, legacyBlocklist) {
  const errors = [];
  const checks = {};

  if (!item || typeof item !== "object") {
    errors.push(makeError("GUARD_INVALID_ITEM", "", "Item must be a non-null object"));
    return { passed: false, errors, checks };
  }

  // 1. SM-01: Legacy 48-slug blocklist check
  const blockedSet = normalizeLegacyBlocklist(legacyBlocklist);
  checks.legacy_blocklist_size = blockedSet.size;
  if (blockedSet.has(item.slug)) {
    errors.push(
      makeError(
        "SM01_LEGACY_BLOCKLIST_COLLISION",
        "slug",
        `Slug "${item.slug}" is in the 48-slug legacy ssalmeok-empire blocklist (SM-01 violation)`
      )
    );
  }

  // 2. Citations >= 2 with https:// URLs
  const citations = Array.isArray(item.citations) ? item.citations : [];
  checks.citations_count = citations.length;
  if (citations.length < 2) {
    errors.push(
      makeError(
        "GUARD_MIN_CITATIONS",
        "citations",
        `Item has ${citations.length} citations; minimum 2 official citations required`
      )
    );
  }
  for (let i = 0; i < citations.length; i += 1) {
    const url = citations[i]?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      errors.push(
        makeError(
          "GUARD_CITATION_HTTPS",
          `citations[${i}].url`,
          `Citation URL must start with https:// (got "${url}")`
        )
      );
    }
  }

  // 3. SM-02: price_mode === "msrp_benchmark_mode" & unique real ASINs across regions
  const offers = item.regional_offers && typeof item.regional_offers === "object" ? item.regional_offers : {};
  const asinOwners = new Map();
  let offerCount = 0;

  for (const [region, offer] of Object.entries(offers)) {
    if (!offer || typeof offer !== "object") continue;
    offerCount += 1;

    if (offer.price_mode !== "msrp_benchmark_mode") {
      errors.push(
        makeError(
          "SM02_PRICE_MODE_VIOLATION",
          `regional_offers.${region}.price_mode`,
          `Region "${region}" price_mode must be "msrp_benchmark_mode" (got "${offer.price_mode}")`
        )
      );
    }

    if (offer.asin !== null && offer.asin !== undefined && offer.asin !== "") {
      const asin = String(offer.asin).trim();
      const validFormat = REAL_ASIN_REGEX.test(asin);
      const isForbidden = FORBIDDEN_ASIN_PATTERNS.some((re) => re.test(asin));
      if (!validFormat || isForbidden) {
        errors.push(
          makeError(
            "SM02_FAKE_OR_INVALID_ASIN",
            `regional_offers.${region}.asin`,
            `Region "${region}" has invalid or placeholder ASIN "${asin}"`
          )
        );
      } else {
        const key = asin.toUpperCase();
        if (asinOwners.has(key)) {
          const prevRegion = asinOwners.get(key);
          errors.push(
            makeError(
              "SM02_DUPLICATE_CROSS_REGION_ASIN",
              `regional_offers.${region}.asin`,
              `ASIN "${asin}" is duplicated identically across regions "${prevRegion}" and "${region}" (SM-02 forbids cross-region ASIN copy-paste)`
            )
          );
        } else {
          asinOwners.set(key, region);
        }
      }
    }
  }

  checks.regional_offers_count = offerCount;
  if (offerCount === 0) {
    errors.push(
      makeError("SM02_NO_REGIONAL_OFFERS", "regional_offers", "At least us and kr regional_offers are required")
    );
  }

  // 4. Audit trust_score >= 95 & info_gain_score >= 75
  const audit = item.audit || {};
  checks.trust_score = audit.trust_score;
  checks.info_gain_score = audit.info_gain_score;

  if (audit.adversarial_pass !== true) {
    errors.push(
      makeError(
        "GUARD_ADVERSARIAL_PASS",
        "audit.adversarial_pass",
        "audit.adversarial_pass must be true"
      )
    );
  }

  if (typeof audit.trust_score !== "number" || audit.trust_score < 95 || audit.trust_score > 100) {
    errors.push(
      makeError(
        "GUARD_TRUST_SCORE",
        "audit.trust_score",
        `audit.trust_score (${audit.trust_score}) must be between 95 and 100`
      )
    );
  }

  if (
    typeof audit.info_gain_score !== "number" ||
    audit.info_gain_score < 75 ||
    audit.info_gain_score > 100
  ) {
    errors.push(
      makeError(
        "GUARD_INFO_GAIN_SCORE",
        "audit.info_gain_score",
        `audit.info_gain_score (${audit.info_gain_score}) must be between 75 and 100`
      )
    );
  }

  // 5. Available locales must have corresponding i18n blocks with >= 2 local_gotchas
  const locales = Array.isArray(item.available_locales) ? item.available_locales : [];
  for (const loc of locales) {
    const copy = item.i18n?.[loc];
    if (!copy) {
      errors.push(
        makeError(
          "GUARD_MISSING_LOCALE_COPY",
          `i18n.${loc}`,
          `Locale "${loc}" is in available_locales but missing from i18n`
        )
      );
    } else if (!Array.isArray(copy.local_gotchas) || copy.local_gotchas.length < 2) {
      errors.push(
        makeError(
          "GUARD_MIN_LOCAL_GOTCHAS",
          `i18n.${loc}.local_gotchas`,
          `Locale "${loc}" requires at least 2 local_gotchas`
        )
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}

/**
 * Dispatch vertical-specific physics verification by item.vertical.
 */
export function verifyItemPhysics(item) {
  switch (item?.vertical) {
    case "wattcheck":
      return verifyWattCheckPhysics(item);
    case "puregram":
      return verifyPureGramPhysics(item);
    case "cyclegear":
      return verifyCycleGearPhysics(item);
    default:
      return {
        passed: false,
        errors: [
          makeError(
            "UNKNOWN_VERTICAL",
            "vertical",
            `Unsupported vertical for physics verification: "${item?.vertical}"`
          ),
        ],
        checks: {},
      };
  }
}

/**
 * Combined physics + cross-audit verification helper.
 */
export function verifyItemComplete(item, legacyBlocklist) {
  const physics = verifyItemPhysics(item);
  const guards = verifyCrossAuditGuards(item, legacyBlocklist);
  return {
    passed: physics.passed && guards.passed,
    errors: [...physics.errors, ...guards.errors],
    checks: {
      ...physics.checks,
      ...guards.checks,
    },
  };
}
