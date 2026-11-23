/**
 * SpecMatrix Global — Stage 4 Deterministic Derived Metrics & VS Diff Table Engine
 *
 * Pure deterministic arithmetic so neither LLMs nor UI templates hallucinate numbers:
 *  - computeWattCheckDerived(item, fx)
 *  - computePureGramDerived(item, fx)
 *  - computeCycleGearDerived(item, fx)
 *  - computeHomeTechDerived(item, fx)
 *  - computeItemDerived(item, fx)
 *  - computeVsDiffTable(itemA, itemB, fx)
 */

export const DEFAULT_FX_RATES = {
  base: "USD",
  source: "fallback-baseline",
  updated_at: "2026-11-22",
  rates: {
    USD: 1.0,
    KRW: 1400.0,
    JPY: 154.0,
    EUR: 0.94,
    GBP: 0.79,
  },
};

export const WATTCHECK_REFERENCE_DEVICES = {
  iphone_16_pro: { label: "iPhone 16 Pro", wh: 13.8 },
  macbook_pro_16: { label: "MacBook Pro 16", wh: 100.0 },
  steam_deck_oled: { label: "Steam Deck OLED", wh: 50.0 },
};

function round(val, decimals = 2) {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  const factor = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

function getRatesMap(fx) {
  const raw = fx?.rates && typeof fx.rates === "object" ? fx.rates : fx;
  return {
    ...DEFAULT_FX_RATES.rates,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
}

export function convertCurrency(amount, fromCurrency, toCurrency, fx) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (fromCurrency === toCurrency) return amount;
  const rates = getRatesMap(fx);
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) {
    throw new Error(`Missing FX rate for currency conversion: ${fromCurrency} -> ${toCurrency}`);
  }
  const usd = fromCurrency === "USD" ? amount : amount / fromRate;
  return toCurrency === "USD" ? usd : usd * toRate;
}

function extractBenchmarkPrices(item, fx) {
  const usOffer = item?.regional_offers?.us;
  const krOffer = item?.regional_offers?.kr;

  let msrpUsd = null;
  let msrpKrw = null;

  if (usOffer && typeof usOffer.msrp === "number" && Number.isFinite(usOffer.msrp)) {
    msrpUsd = convertCurrency(usOffer.msrp, usOffer.currency || "USD", "USD", fx);
  }
  if (krOffer && typeof krOffer.msrp === "number" && Number.isFinite(krOffer.msrp)) {
    msrpKrw = convertCurrency(krOffer.msrp, krOffer.currency || "KRW", "KRW", fx);
  }

  if (msrpKrw === null && msrpUsd !== null) {
    msrpKrw = convertCurrency(msrpUsd, "USD", "KRW", fx);
  }
  if (msrpUsd === null && msrpKrw !== null) {
    msrpUsd = convertCurrency(msrpKrw, "KRW", "USD", fx);
  }

  const fxImpliedKrw = msrpUsd !== null ? Math.round(convertCurrency(msrpUsd, "USD", "KRW", fx)) : null;
  const krImportPremiumPct =
    msrpKrw !== null && fxImpliedKrw && fxImpliedKrw > 0
      ? round(((msrpKrw - fxImpliedKrw) / fxImpliedKrw) * 100, 1)
      : null;

  return {
    msrp_usd: round(msrpUsd, 2),
    msrp_krw: msrpKrw !== null ? Math.round(msrpKrw) : null,
    fx_implied_krw: fxImpliedKrw,
    kr_import_premium_pct: krImportPremiumPct,
  };
}

/**
 * Deterministic derived metrics for WattCheck (Power Banks, GaN Chargers, Power Stations).
 */
export function computeWattCheckDerived(item, fx = DEFAULT_FX_RATES) {
  const specs = item.specs;
  const prices = extractBenchmarkPrices(item, fx);

  const weightG = specs.weight_g;
  const maxTotalW = specs.max_total_output_w;
  const dims = specs.dimensions_mm;
  const volumeCm3 =
    dims && dims.l > 0 && dims.w > 0 && dims.h > 0
      ? round((dims.l * dims.w * dims.h) / 1000, 1)
      : null;

  const wPer100g = round((maxTotalW / weightG) * 100, 2);
  const wPer100cm3 = volumeCm3 ? round((maxTotalW / volumeCm3) * 100, 2) : null;
  const usdPer10w = prices.msrp_usd !== null ? round(prices.msrp_usd / (maxTotalW / 10), 2) : null;
  const krwPer10w = prices.msrp_krw !== null ? Math.round(prices.msrp_krw / (maxTotalW / 10)) : null;

  const certificationsCount = [
    specs.ul_etl_certified,
    specs.ce_certified,
    specs.ccc_certified,
    specs.pse_certified,
    specs.kc_certified,
  ].filter(Boolean).length;

  let usableWh = null;
  let whPer100g = null;
  let usableWhPer100g = null;
  let referenceDeviceCharges = null;
  let usdPer10wh = null;
  let krwPer10wh = null;

  if (specs.has_battery && typeof specs.battery_energy_wh === "number" && specs.battery_energy_wh > 0) {
    const wh = specs.battery_energy_wh;
    const effPct =
      typeof specs.conversion_efficiency_pct === "number" && specs.conversion_efficiency_pct > 0
        ? specs.conversion_efficiency_pct
        : 80;

    const rawUsableWh = wh * (effPct / 100);
    usableWh = round(rawUsableWh, 2);
    whPer100g = round((wh / weightG) * 100, 2);
    usableWhPer100g = round((rawUsableWh / weightG) * 100, 2);
    referenceDeviceCharges = {
      iphone_16_pro: round(rawUsableWh / WATTCHECK_REFERENCE_DEVICES.iphone_16_pro.wh, 2),
      macbook_pro_16: round(rawUsableWh / WATTCHECK_REFERENCE_DEVICES.macbook_pro_16.wh, 2),
      steam_deck_oled: round(rawUsableWh / WATTCHECK_REFERENCE_DEVICES.steam_deck_oled.wh, 2),
    };
    usdPer10wh = prices.msrp_usd !== null ? round(prices.msrp_usd / (wh / 10), 2) : null;
    krwPer10wh = prices.msrp_krw !== null ? Math.round(prices.msrp_krw / (wh / 10)) : null;
  }

  const isBattery = specs.has_battery === true && usableWh !== null;
  const coreDerivedMetrics = isBattery
    ? [usableWh, whPer100g, wPer100g, referenceDeviceCharges.iphone_16_pro, usdPer10wh, krwPer10wh]
    : [wPer100g, wPer100cm3, usdPer10w, krwPer10w, volumeCm3];

  return {
    vertical: "wattcheck",
    has_battery: specs.has_battery,
    ...prices,
    usable_wh: usableWh,
    wh_per_100g: whPer100g,
    usable_wh_per_100g: usableWhPer100g,
    w_per_100g: wPer100g,
    volume_cm3: volumeCm3,
    w_per_100cm3: wPer100cm3,
    reference_device_charges: referenceDeviceCharges,
    usd_per_10wh: usdPer10wh,
    krw_per_10wh: krwPer10wh,
    usd_per_10w: usdPer10w,
    krw_per_10w: krwPer10w,
    primary_cost_basis: isBattery ? "per_10wh" : "per_10w",
    primary_cost_usd: isBattery ? usdPer10wh : usdPer10w,
    primary_cost_krw: isBattery ? krwPer10wh : krwPer10w,
    ports_count: Array.isArray(specs.ports) ? specs.ports.length : 0,
    certifications_count: certificationsCount,
    derived_metric_count: coreDerivedMetrics.filter((v) => v !== null && v !== undefined).length,
  };
}

/**
 * Deterministic derived metrics for PureGram (Energy Gels, Electrolytes, Creatine, Carb Mixes).
 */
export function computePureGramDerived(item, fx = DEFAULT_FX_RATES) {
  const pkg = item.package_spec;
  const nut = item.nutrition_label;
  const dm = item.derived_math;
  const prices = extractBenchmarkPrices(item, fx);

  const benchmarkUnitsPerPack = dm.total_pure_active_g / dm.benchmark_unit_g;
  const trueCostUsd =
    prices.msrp_usd !== null && benchmarkUnitsPerPack > 0
      ? round(prices.msrp_usd / benchmarkUnitsPerPack, 2)
      : null;
  const trueCostKrw =
    prices.msrp_krw !== null && benchmarkUnitsPerPack > 0
      ? Math.round(prices.msrp_krw / benchmarkUnitsPerPack)
      : null;

  const costPerServingUsd =
    prices.msrp_usd !== null && pkg.total_servings > 0
      ? round(prices.msrp_usd / pkg.total_servings, 2)
      : null;
  const costPerServingKrw =
    prices.msrp_krw !== null && pkg.total_servings > 0
      ? Math.round(prices.msrp_krw / pkg.total_servings)
      : null;

  const purityPct = round(dm.purity_pct, 2);
  const fillerTaxPct = round(100 - dm.purity_pct, 2);

  let servingsPerHour90g = null;
  let raceFueling90gHrCostUsd = null;
  let raceFueling90gHrCostKrw = null;

  if (nut.active_ingredient_type === "carbohydrates" && nut.active_per_serving_g > 0) {
    const rawServings90 = 90 / nut.active_per_serving_g;
    servingsPerHour90g = round(rawServings90, 2);
    if (prices.msrp_usd !== null && pkg.total_servings > 0) {
      raceFueling90gHrCostUsd = round(rawServings90 * (prices.msrp_usd / pkg.total_servings), 2);
    }
    if (prices.msrp_krw !== null && pkg.total_servings > 0) {
      raceFueling90gHrCostKrw = Math.round(rawServings90 * (prices.msrp_krw / pkg.total_servings));
    }
  }

  const costPer30ServingsUsd =
    prices.msrp_usd !== null && pkg.total_servings > 0
      ? round((prices.msrp_usd / pkg.total_servings) * 30, 2)
      : null;
  const costPer30ServingsKrw =
    prices.msrp_krw !== null && pkg.total_servings > 0
      ? Math.round((prices.msrp_krw / pkg.total_servings) * 30)
      : null;

  const coreDerivedMetrics = [
    trueCostUsd,
    trueCostKrw,
    fillerTaxPct,
    costPerServingUsd,
    raceFueling90gHrCostUsd ?? costPer30ServingsUsd,
  ];

  return {
    vertical: "puregram",
    active_ingredient_type: nut.active_ingredient_type,
    benchmark_unit_g: dm.benchmark_unit_g,
    benchmark_units_per_pack: round(benchmarkUnitsPerPack, 2),
    ...prices,
    true_cost_per_benchmark_unit_usd: trueCostUsd,
    true_cost_per_benchmark_unit_krw: trueCostKrw,
    cost_per_serving_usd: costPerServingUsd,
    cost_per_serving_krw: costPerServingKrw,
    cost_per_30_servings_usd: costPer30ServingsUsd,
    cost_per_30_servings_krw: costPer30ServingsKrw,
    purity_pct: purityPct,
    filler_tax_pct: fillerTaxPct,
    servings_per_hour_90g: servingsPerHour90g,
    race_fueling_90g_hr_cost_usd: raceFueling90gHrCostUsd,
    race_fueling_90g_hr_cost_krw: raceFueling90gHrCostKrw,
    derived_metric_count: coreDerivedMetrics.filter((v) => v !== null && v !== undefined).length,
  };
}

/**
 * Compute deterministic safety tier badge for CycleGear SKUs.
 */
function classifyCycleGearSafetyTier(item) {
  if (item.safety_warning?.requires_hookless_warning === true) {
    return {
      code: "HOOKLESS_CRITICAL",
      level: "high",
      label_en: "Hookless Max Pressure Guard (≤ 5.0 bar / 72.5 psi)",
      label_ko: "후크리스 림 최대 공기압 주의 (5.0 bar / 72.5 psi 이하)",
    };
  }
  if (item.category === "drivetrain" || item.category === "power-meter") {
    return {
      code: "TORQUE_SPEC_REQUIRED",
      level: "moderate",
      label_en: "Calibrated Torque & Compatibility Check Required",
      label_ko: "규정 토크 준수 및 구동계 호환성 확인 필수",
    };
  }
  if (item.category === "smart-trainer") {
    return {
      code: "AXLE_FIT_CHECK",
      level: "moderate",
      label_en: "Thru-Axle Adapter & Frame Dropout Check",
      label_ko: "스루액슬 어댑터 및 프레임 간섭 확인",
    };
  }
  return {
    code: "STANDARD_MOUNT",
    level: "standard",
    label_en: "Standard Mount & Tether Recommended",
    label_ko: "표준 마운트 및 안전 스트랩 권장",
  };
}

/**
 * Deterministic derived metrics for CycleGear (Power Meters, GPS Computers, Smart Trainers, Tires, Drivetrains).
 */
export function computeCycleGearDerived(item, fx = DEFAULT_FX_RATES) {
  const specs = item.specs;
  const compat = item.compatibility_graph;
  const prices = extractBenchmarkPrices(item, fx);

  const weightG = specs.weight_g;
  const usdPer100g = prices.msrp_usd !== null ? round((prices.msrp_usd / weightG) * 100, 2) : null;
  const krwPer100g = prices.msrp_krw !== null ? Math.round((prices.msrp_krw / weightG) * 100) : null;

  // Deterministic compatibility breadth score (0–100)
  const drivetrainCount = Array.isArray(compat?.drivetrain_compatible) ? compat.drivetrain_compatible.length : 0;
  const headUnitCount = Array.isArray(compat?.head_unit_or_app_verified) ? compat.head_unit_or_app_verified.length : 0;
  const connectivityCount = Array.isArray(specs?.connectivity) ? specs.connectivity.length : 0;
  const mountStr = String(compat?.bb_or_mount_standard || "").toLowerCase();
  const isUniversalMount =
    mountStr.includes("universal") ||
    mountStr.includes("9/16") ||
    mountStr.includes("700c") ||
    mountStr.includes("quarter-turn") ||
    mountStr.includes("standard");

  const drivetrainPts = Math.min(40, drivetrainCount * 10);
  const headUnitPts = Math.min(35, headUnitCount * 7);
  const connectivityPts = Math.min(15, connectivityCount * 5);
  const mountBonus = isUniversalMount ? 10 : (compat?.incompatible_notes_en?.length ?? 2) <= 1 ? 5 : 0;
  const compatibilityBreadthScore = Math.min(100, drivetrainPts + headUnitPts + connectivityPts + mountBonus);

  const safetyTierBadge = classifyCycleGearSafetyTier(item);

  const usdPerBatteryHour =
    prices.msrp_usd !== null && typeof specs.battery_life_hours === "number" && specs.battery_life_hours > 0
      ? round(prices.msrp_usd / specs.battery_life_hours, 2)
      : null;

  const usdPer100wResistance =
    prices.msrp_usd !== null && typeof specs.max_trainer_watts === "number" && specs.max_trainer_watts > 0
      ? round(prices.msrp_usd / (specs.max_trainer_watts / 100), 2)
      : null;

  const coreDerivedMetrics = [
    usdPer100g,
    krwPer100g,
    compatibilityBreadthScore,
    safetyTierBadge.code,
    usdPerBatteryHour,
    usdPer100wResistance,
  ];

  return {
    vertical: "cyclegear",
    category: item.category,
    ...prices,
    weight_g: weightG,
    usd_per_100g: usdPer100g,
    krw_per_100g: krwPer100g,
    compatibility_breadth_score: compatibilityBreadthScore,
    compatibility_breakdown: {
      drivetrain_pts: drivetrainPts,
      head_unit_pts: headUnitPts,
      connectivity_pts: connectivityPts,
      mount_bonus: mountBonus,
    },
    safety_tier_badge: safetyTierBadge,
    usd_per_battery_hour: usdPerBatteryHour,
    usd_per_100w_resistance: usdPer100wResistance,
    derived_metric_count: coreDerivedMetrics.filter((v) => v !== null && v !== undefined).length,
  };
}

export const HOMETECH_ELEC_RATES = {
  usd_per_kwh: 0.17,
  krw_per_kwh: 214, // KEPCO tier 2 baseline 214 KRW/kWh
  eur_de_per_kwh: 0.38, // Germany €0.38/kWh
};

/**
 * Deterministic derived TCO & energy metrics for HomeTech (MiniPC, NAS, UPS, Robot Vacuum).
 */
export function computeHomeTechDerived(item, fx = DEFAULT_FX_RATES) {
  const specs = item.specs;
  const tco = item.tco_profile || {};
  const prices = extractBenchmarkPrices(item, fx);

  const h = specs.default_daily_hours_active;
  const rawWeightedAvgW = (specs.typical_load_w * h + specs.idle_power_w * (24 - h)) / 24;
  const rawAnnualKwh = rawWeightedAvgW * 8.76;

  const weightedAvgW = round(rawWeightedAvgW, 2);
  const annualKwh = round(rawAnnualKwh, 2);
  const annualElecUsd = round(rawAnnualKwh * HOMETECH_ELEC_RATES.usd_per_kwh, 2);
  const annualElecKrw = Math.round(rawAnnualKwh * HOMETECH_ELEC_RATES.krw_per_kwh);
  const annualElecEurDe = round(rawAnnualKwh * HOMETECH_ELEC_RATES.eur_de_per_kwh, 2);

  const consumablesUsd = typeof specs.annual_consumables_usd === "number" ? specs.annual_consumables_usd : 0;
  const consumablesKrw = typeof specs.annual_consumables_krw === "number" ? specs.annual_consumables_krw : 0;

  const annualOperatingUsd = round(annualElecUsd + consumablesUsd, 2);
  const annualOperatingKrw = Math.round(annualElecKrw + consumablesKrw);

  const tco3yrUsd =
    prices.msrp_usd !== null
      ? round(prices.msrp_usd + 3 * (annualElecUsd + consumablesUsd), 2)
      : null;
  const tco3yrKrw =
    prices.msrp_krw !== null
      ? Math.round(prices.msrp_krw + 3 * (annualElecKrw + consumablesKrw))
      : null;

  const lifespanYears =
    typeof tco.expected_lifespan_years === "number" && tco.expected_lifespan_years > 0
      ? tco.expected_lifespan_years
      : null;
  const tcoLifespanUsd =
    prices.msrp_usd !== null && lifespanYears !== null
      ? round(prices.msrp_usd + lifespanYears * (annualElecUsd + consumablesUsd), 2)
      : null;
  const tcoLifespanKrw =
    prices.msrp_krw !== null && lifespanYears !== null
      ? Math.round(prices.msrp_krw + lifespanYears * (annualElecKrw + consumablesKrw))
      : null;

  const dims = specs.dimensions_mm;
  const volumeCm3 =
    dims && dims.l > 0 && dims.w > 0 && dims.h > 0
      ? round((dims.l * dims.w * dims.h) / 1000, 1)
      : null;

  const upsPowerFactor =
    typeof specs.ups_va_rating === "number" &&
    specs.ups_va_rating > 0 &&
    typeof specs.ups_watt_rating === "number" &&
    specs.ups_watt_rating > 0
      ? round(specs.ups_watt_rating / specs.ups_va_rating, 2)
      : null;

  const coreDerivedMetrics = [
    weightedAvgW,
    annualKwh,
    annualElecUsd,
    annualElecKrw,
    annualElecEurDe,
    tco3yrUsd,
    tco3yrKrw,
  ];

  return {
    vertical: "hometech",
    category: item.category,
    ...prices,
    weighted_avg_w: weightedAvgW,
    annual_kwh: annualKwh,
    annual_elec_usd: annualElecUsd,
    annual_elec_krw: annualElecKrw,
    annual_elec_eur_de: annualElecEurDe,
    annual_consumables_usd: round(consumablesUsd, 2),
    annual_consumables_krw: Math.round(consumablesKrw),
    annual_operating_usd: annualOperatingUsd,
    annual_operating_krw: annualOperatingKrw,
    tco_3yr_usd: tco3yrUsd,
    tco_3yr_krw: tco3yrKrw,
    tco_lifespan_usd: tcoLifespanUsd,
    tco_lifespan_krw: tcoLifespanKrw,
    expected_lifespan_years: lifespanYears,
    volume_cm3: volumeCm3,
    ups_power_factor: upsPowerFactor,
    derived_metric_count: coreDerivedMetrics.filter((v) => v !== null && v !== undefined).length,
  };
}

/**
 * Dispatch derived metric computation by vertical.
 */
export function computeItemDerived(item, fx = DEFAULT_FX_RATES) {
  switch (item?.vertical) {
    case "wattcheck":
      return computeWattCheckDerived(item, fx);
    case "puregram":
      return computePureGramDerived(item, fx);
    case "cyclegear":
      return computeCycleGearDerived(item, fx);
    case "hometech":
      return computeHomeTechDerived(item, fx);
    default:
      throw new Error(`Unsupported vertical for derived metrics: "${item?.vertical}"`);
  }
}

function buildDiffRow({
  key,
  label_en,
  label_ko,
  unit,
  value_a,
  value_b,
  higher_is_better,
  decimals = 2,
}) {
  const numA = typeof value_a === "number" && Number.isFinite(value_a) ? value_a : null;
  const numB = typeof value_b === "number" && Number.isFinite(value_b) ? value_b : null;

  let deltaAMinusB = null;
  let deltaPct = null;
  let winner = "n/a";

  if (numA !== null && numB !== null) {
    deltaAMinusB = round(numA - numB, decimals);
    if (numB !== 0) {
      deltaPct = round(((numA - numB) / Math.abs(numB)) * 100, 1);
    }
    if (higher_is_better === null || higher_is_better === undefined) {
      winner = "n/a";
    } else if (Math.abs(numA - numB) < 1e-9) {
      winner = "tie";
    } else if (higher_is_better) {
      winner = numA > numB ? "a" : "b";
    } else {
      winner = numA < numB ? "a" : "b";
    }
  }

  return {
    key,
    label_en,
    label_ko,
    unit,
    value_a: numA !== null ? round(numA, decimals) : value_a ?? null,
    value_b: numB !== null ? round(numB, decimals) : value_b ?? null,
    delta_a_minus_b: deltaAMinusB,
    delta_pct: deltaPct,
    higher_is_better,
    winner,
  };
}

/**
 * Deterministic 1:1 VS quantitative diff table with numeric deltas and metric-by-metric winners.
 */
export function computeVsDiffTable(itemA, itemB, fx = DEFAULT_FX_RATES) {
  if (!itemA || !itemB) {
    throw new Error("computeVsDiffTable requires both itemA and itemB");
  }
  if (itemA.vertical !== itemB.vertical) {
    throw new Error(
      `Cannot build VS diff table across different verticals: "${itemA.vertical}" vs "${itemB.vertical}"`
    );
  }

  const derivedA = computeItemDerived(itemA, fx);
  const derivedB = computeItemDerived(itemB, fx);
  const rows = [];

  if (itemA.vertical === "wattcheck") {
    rows.push(
      buildDiffRow({
        key: "msrp_usd",
        label_en: "US MSRP Benchmark",
        label_ko: "미국 공식 출고가 (USD)",
        unit: "USD",
        value_a: derivedA.msrp_usd,
        value_b: derivedB.msrp_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "msrp_krw",
        label_en: "KR MSRP Benchmark",
        label_ko: "한국 공식 출고가 (KRW)",
        unit: "KRW",
        value_a: derivedA.msrp_krw,
        value_b: derivedB.msrp_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "weight_g",
        label_en: "Weight",
        label_ko: "무게",
        unit: "g",
        value_a: itemA.specs.weight_g,
        value_b: itemB.specs.weight_g,
        higher_is_better: false,
        decimals: 1,
      }),
      buildDiffRow({
        key: "max_total_output_w",
        label_en: "Max Total Output",
        label_ko: "최대 합산 출력",
        unit: "W",
        value_a: itemA.specs.max_total_output_w,
        value_b: itemB.specs.max_total_output_w,
        higher_is_better: true,
        decimals: 1,
      }),
      buildDiffRow({
        key: "max_single_port_output_w",
        label_en: "Max Single-Port Output",
        label_ko: "단일 포트 최대 출력",
        unit: "W",
        value_a: itemA.specs.max_single_port_output_w,
        value_b: itemB.specs.max_single_port_output_w,
        higher_is_better: true,
        decimals: 1,
      }),
      buildDiffRow({
        key: "w_per_100g",
        label_en: "Power Density (W / 100g)",
        label_ko: "무게당 출력 밀도 (W/100g)",
        unit: "W/100g",
        value_a: derivedA.w_per_100g,
        value_b: derivedB.w_per_100g,
        higher_is_better: true,
      })
    );

    if (itemA.specs.has_battery && itemB.specs.has_battery) {
      rows.push(
        buildDiffRow({
          key: "battery_energy_wh",
          label_en: "Rated Energy Capacity",
          label_ko: "배터리 정격 에너지",
          unit: "Wh",
          value_a: itemA.specs.battery_energy_wh,
          value_b: itemB.specs.battery_energy_wh,
          higher_is_better: true,
        }),
        buildDiffRow({
          key: "usable_wh",
          label_en: "Usable Energy (Efficiency Adjusted)",
          label_ko: "실가용 에너지 (효율 반영)",
          unit: "Wh",
          value_a: derivedA.usable_wh,
          value_b: derivedB.usable_wh,
          higher_is_better: true,
        }),
        buildDiffRow({
          key: "wh_per_100g",
          label_en: "Energy Density (Wh / 100g)",
          label_ko: "무게당 에너지 밀도 (Wh/100g)",
          unit: "Wh/100g",
          value_a: derivedA.wh_per_100g,
          value_b: derivedB.wh_per_100g,
          higher_is_better: true,
        }),
        buildDiffRow({
          key: "usd_per_10wh",
          label_en: "Cost per 10 Wh (USD)",
          label_ko: "10 Wh당 단가 (USD)",
          unit: "USD/10Wh",
          value_a: derivedA.usd_per_10wh,
          value_b: derivedB.usd_per_10wh,
          higher_is_better: false,
        }),
        buildDiffRow({
          key: "krw_per_10wh",
          label_en: "Cost per 10 Wh (KRW)",
          label_ko: "10 Wh당 단가 (KRW)",
          unit: "KRW/10Wh",
          value_a: derivedA.krw_per_10wh,
          value_b: derivedB.krw_per_10wh,
          higher_is_better: false,
          decimals: 0,
        }),
        buildDiffRow({
          key: "iphone_16_pro_charges",
          label_en: "iPhone 16 Pro Full Charges",
          label_ko: "아이폰 16 프로 완충 횟수",
          unit: "charges",
          value_a: derivedA.reference_device_charges?.iphone_16_pro ?? null,
          value_b: derivedB.reference_device_charges?.iphone_16_pro ?? null,
          higher_is_better: true,
        })
      );
    } else {
      rows.push(
        buildDiffRow({
          key: "usd_per_10w",
          label_en: "Cost per 10 W (USD)",
          label_ko: "10 W당 단가 (USD)",
          unit: "USD/10W",
          value_a: derivedA.usd_per_10w,
          value_b: derivedB.usd_per_10w,
          higher_is_better: false,
        }),
        buildDiffRow({
          key: "krw_per_10w",
          label_en: "Cost per 10 W (KRW)",
          label_ko: "10 W당 단가 (KRW)",
          unit: "KRW/10W",
          value_a: derivedA.krw_per_10w,
          value_b: derivedB.krw_per_10w,
          higher_is_better: false,
          decimals: 0,
        })
      );
    }

    rows.push(
      buildDiffRow({
        key: "ports_count",
        label_en: "Output Ports",
        label_ko: "출력 포트 수",
        unit: "ports",
        value_a: derivedA.ports_count,
        value_b: derivedB.ports_count,
        higher_is_better: true,
        decimals: 0,
      }),
      buildDiffRow({
        key: "certifications_count",
        label_en: "Safety Certifications (UL/CE/CCC/PSE/KC)",
        label_ko: "글로벌 안전인증 보유 수",
        unit: "certs",
        value_a: derivedA.certifications_count,
        value_b: derivedB.certifications_count,
        higher_is_better: true,
        decimals: 0,
      })
    );
  } else if (itemA.vertical === "puregram") {
    const sameBenchmarkUnit =
      itemA.derived_math.benchmark_unit_g === itemB.derived_math.benchmark_unit_g &&
      itemA.nutrition_label.active_ingredient_type === itemB.nutrition_label.active_ingredient_type;

    rows.push(
      buildDiffRow({
        key: "msrp_usd",
        label_en: "US MSRP Benchmark",
        label_ko: "미국 공식 출고가 (USD)",
        unit: "USD",
        value_a: derivedA.msrp_usd,
        value_b: derivedB.msrp_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "msrp_krw",
        label_en: "KR MSRP Benchmark",
        label_ko: "한국 공식 출고가 (KRW)",
        unit: "KRW",
        value_a: derivedA.msrp_krw,
        value_b: derivedB.msrp_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "true_cost_per_benchmark_unit_usd",
        label_en: "True Cost per Benchmark Unit (USD)",
        label_ko: "기준 유효성분당 실단가 (USD)",
        unit: "USD",
        value_a: derivedA.true_cost_per_benchmark_unit_usd,
        value_b: derivedB.true_cost_per_benchmark_unit_usd,
        higher_is_better: sameBenchmarkUnit ? false : null,
      }),
      buildDiffRow({
        key: "true_cost_per_benchmark_unit_krw",
        label_en: "True Cost per Benchmark Unit (KRW)",
        label_ko: "기준 유효성분당 실단가 (KRW)",
        unit: "KRW",
        value_a: derivedA.true_cost_per_benchmark_unit_krw,
        value_b: derivedB.true_cost_per_benchmark_unit_krw,
        higher_is_better: sameBenchmarkUnit ? false : null,
        decimals: 0,
      }),
      buildDiffRow({
        key: "purity_pct",
        label_en: "Active Purity",
        label_ko: "유효성분 순도",
        unit: "%",
        value_a: derivedA.purity_pct,
        value_b: derivedB.purity_pct,
        higher_is_better: true,
      }),
      buildDiffRow({
        key: "filler_tax_pct",
        label_en: "Filler Tax",
        label_ko: "필러세 비율",
        unit: "%",
        value_a: derivedA.filler_tax_pct,
        value_b: derivedB.filler_tax_pct,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "active_per_serving_g",
        label_en: "Active per Serving",
        label_ko: "1회분 유효성분",
        unit: "g",
        value_a: itemA.nutrition_label.active_per_serving_g,
        value_b: itemB.nutrition_label.active_per_serving_g,
        higher_is_better: sameBenchmarkUnit ? true : null,
      }),
      buildDiffRow({
        key: "sodium_mg",
        label_en: "Sodium per Serving",
        label_ko: "1회분 나트륨",
        unit: "mg",
        value_a: itemA.nutrition_label.sodium_mg,
        value_b: itemB.nutrition_label.sodium_mg,
        higher_is_better:
          itemA.category === "electrolyte" && itemB.category === "electrolyte" ? true : null,
        decimals: 0,
      }),
      buildDiffRow({
        key: "caffeine_mg",
        label_en: "Caffeine per Serving",
        label_ko: "1회분 카페인",
        unit: "mg",
        value_a: itemA.nutrition_label.caffeine_mg,
        value_b: itemB.nutrition_label.caffeine_mg,
        higher_is_better: null,
        decimals: 0,
      })
    );

    if (
      derivedA.race_fueling_90g_hr_cost_usd !== null &&
      derivedB.race_fueling_90g_hr_cost_usd !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "race_fueling_90g_hr_cost_usd",
          label_en: "90 g/hr Race Fueling Cost (USD)",
          label_ko: "시간당 90g 보급 비용 (USD)",
          unit: "USD/hr",
          value_a: derivedA.race_fueling_90g_hr_cost_usd,
          value_b: derivedB.race_fueling_90g_hr_cost_usd,
          higher_is_better: false,
        }),
        buildDiffRow({
          key: "race_fueling_90g_hr_cost_krw",
          label_en: "90 g/hr Race Fueling Cost (KRW)",
          label_ko: "시간당 90g 보급 비용 (KRW)",
          unit: "KRW/hr",
          value_a: derivedA.race_fueling_90g_hr_cost_krw,
          value_b: derivedB.race_fueling_90g_hr_cost_krw,
          higher_is_better: false,
          decimals: 0,
        }),
        buildDiffRow({
          key: "servings_per_hour_90g",
          label_en: "Servings Required for 90 g/hr",
          label_ko: "시간당 90g 달성 필요 개수",
          unit: "servings/hr",
          value_a: derivedA.servings_per_hour_90g,
          value_b: derivedB.servings_per_hour_90g,
          higher_is_better: false,
        })
      );
    }
  } else if (itemA.vertical === "cyclegear") {
    rows.push(
      buildDiffRow({
        key: "msrp_usd",
        label_en: "US MSRP Benchmark",
        label_ko: "미국 공식 출고가 (USD)",
        unit: "USD",
        value_a: derivedA.msrp_usd,
        value_b: derivedB.msrp_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "msrp_krw",
        label_en: "KR MSRP Benchmark",
        label_ko: "한국 공식 출고가 (KRW)",
        unit: "KRW",
        value_a: derivedA.msrp_krw,
        value_b: derivedB.msrp_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "weight_g",
        label_en: "Weight",
        label_ko: "무게",
        unit: "g",
        value_a: itemA.specs.weight_g,
        value_b: itemB.specs.weight_g,
        higher_is_better: false,
        decimals: 1,
      }),
      buildDiffRow({
        key: "usd_per_100g",
        label_en: "Cost per 100 g (USD)",
        label_ko: "100g당 비용 (USD)",
        unit: "USD/100g",
        value_a: derivedA.usd_per_100g,
        value_b: derivedB.usd_per_100g,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "krw_per_100g",
        label_en: "Cost per 100 g (KRW)",
        label_ko: "100g당 비용 (KRW)",
        unit: "KRW/100g",
        value_a: derivedA.krw_per_100g,
        value_b: derivedB.krw_per_100g,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "compatibility_breadth_score",
        label_en: "Compatibility Breadth Score",
        label_ko: "호환성 확장 점수",
        unit: "pts",
        value_a: derivedA.compatibility_breadth_score,
        value_b: derivedB.compatibility_breadth_score,
        higher_is_better: true,
        decimals: 0,
      })
    );

    if (
      itemA.specs.claimed_accuracy_pct !== null &&
      itemB.specs.claimed_accuracy_pct !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "claimed_accuracy_pct",
          label_en: "Claimed Accuracy Error (±%)",
          label_ko: "공식 정확도 오차 (±%)",
          unit: "%",
          value_a: itemA.specs.claimed_accuracy_pct,
          value_b: itemB.specs.claimed_accuracy_pct,
          higher_is_better: false,
        })
      );
    }

    if (
      itemA.specs.battery_life_hours !== null &&
      itemB.specs.battery_life_hours !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "battery_life_hours",
          label_en: "Battery Life",
          label_ko: "배터리 사용 시간",
          unit: "hr",
          value_a: itemA.specs.battery_life_hours,
          value_b: itemB.specs.battery_life_hours,
          higher_is_better: true,
          decimals: 1,
        })
      );
    }

    if (
      itemA.specs.max_trainer_watts !== null &&
      itemB.specs.max_trainer_watts !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "max_trainer_watts",
          label_en: "Max Resistance Power",
          label_ko: "최대 부하 출력",
          unit: "W",
          value_a: itemA.specs.max_trainer_watts,
          value_b: itemB.specs.max_trainer_watts,
          higher_is_better: true,
          decimals: 0,
        })
      );
    }

    if (
      itemA.specs.trainer_noise_dba !== null &&
      itemB.specs.trainer_noise_dba !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "trainer_noise_dba",
          label_en: "Operating Noise",
          label_ko: "구동 소음",
          unit: "dBA",
          value_a: itemA.specs.trainer_noise_dba,
          value_b: itemB.specs.trainer_noise_dba,
          higher_is_better: false,
          decimals: 1,
        })
      );
    }

    if (
      itemA.specs.hookless_max_psi !== null &&
      itemB.specs.hookless_max_psi !== null
    ) {
      rows.push(
        buildDiffRow({
          key: "hookless_max_psi",
          label_en: "Hookless Max Pressure",
          label_ko: "후크리스 최대 공기압",
          unit: "psi",
          value_a: itemA.specs.hookless_max_psi,
          value_b: itemB.specs.hookless_max_psi,
          higher_is_better: null,
          decimals: 1,
        })
      );
    }
  } else if (itemA.vertical === "hometech") {
    rows.push(
      buildDiffRow({
        key: "msrp_usd",
        label_en: "US MSRP Benchmark",
        label_ko: "미국 공식 출고가 (USD)",
        unit: "USD",
        value_a: derivedA.msrp_usd,
        value_b: derivedB.msrp_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "msrp_krw",
        label_en: "KR MSRP Benchmark",
        label_ko: "한국 공식 출고가 (KRW)",
        unit: "KRW",
        value_a: derivedA.msrp_krw,
        value_b: derivedB.msrp_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "tco_3yr_usd",
        label_en: "3-Year Total Cost of Ownership (USD)",
        label_ko: "3년 총소유비용 TCO (USD)",
        unit: "USD",
        value_a: derivedA.tco_3yr_usd,
        value_b: derivedB.tco_3yr_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "tco_3yr_krw",
        label_en: "3-Year Total Cost of Ownership (KRW)",
        label_ko: "3년 총소유비용 TCO (KRW)",
        unit: "KRW",
        value_a: derivedA.tco_3yr_krw,
        value_b: derivedB.tco_3yr_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "idle_power_w",
        label_en: "Idle Power Draw",
        label_ko: "유휴 소비전력",
        unit: "W",
        value_a: itemA.specs.idle_power_w,
        value_b: itemB.specs.idle_power_w,
        higher_is_better: false,
        decimals: 1,
      }),
      buildDiffRow({
        key: "typical_load_w",
        label_en: "Typical Load Power",
        label_ko: "실사용 소비전력",
        unit: "W",
        value_a: itemA.specs.typical_load_w,
        value_b: itemB.specs.typical_load_w,
        higher_is_better: false,
        decimals: 1,
      }),
      buildDiffRow({
        key: "weighted_avg_w",
        label_en: "Daily Weighted Average Power",
        label_ko: "일평균 가중 소비전력",
        unit: "W",
        value_a: derivedA.weighted_avg_w,
        value_b: derivedB.weighted_avg_w,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "annual_kwh",
        label_en: "Estimated Annual Energy",
        label_ko: "연간 예상 전력량",
        unit: "kWh/yr",
        value_a: derivedA.annual_kwh,
        value_b: derivedB.annual_kwh,
        higher_is_better: false,
        decimals: 1,
      }),
      buildDiffRow({
        key: "annual_elec_usd",
        label_en: "Annual Electricity Cost (US $0.17/kWh)",
        label_ko: "연간 전기요금 (미국 기준)",
        unit: "USD/yr",
        value_a: derivedA.annual_elec_usd,
        value_b: derivedB.annual_elec_usd,
        higher_is_better: false,
      }),
      buildDiffRow({
        key: "annual_elec_krw",
        label_en: "Annual Electricity Cost (KR ₩214/kWh)",
        label_ko: "연간 전기요금 (한전 누진 2단계)",
        unit: "KRW/yr",
        value_a: derivedA.annual_elec_krw,
        value_b: derivedB.annual_elec_krw,
        higher_is_better: false,
        decimals: 0,
      }),
      buildDiffRow({
        key: "weight_g",
        label_en: "Weight",
        label_ko: "무게",
        unit: "g",
        value_a: itemA.specs.weight_g,
        value_b: itemB.specs.weight_g,
        higher_is_better: false,
        decimals: 0,
      })
    );

    if (
      (itemA.specs.annual_consumables_usd > 0 || itemB.specs.annual_consumables_usd > 0) &&
      typeof itemA.specs.annual_consumables_usd === "number" &&
      typeof itemB.specs.annual_consumables_usd === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "annual_consumables_usd",
          label_en: "Annual Consumables (USD)",
          label_ko: "연간 소모품 비용 (USD)",
          unit: "USD/yr",
          value_a: itemA.specs.annual_consumables_usd,
          value_b: itemB.specs.annual_consumables_usd,
          higher_is_better: false,
        }),
        buildDiffRow({
          key: "annual_consumables_krw",
          label_en: "Annual Consumables (KRW)",
          label_ko: "연간 소모품 비용 (KRW)",
          unit: "KRW/yr",
          value_a: itemA.specs.annual_consumables_krw,
          value_b: itemB.specs.annual_consumables_krw,
          higher_is_better: false,
          decimals: 0,
        })
      );
    }

    if (
      typeof itemA.specs.noise_idle_dba === "number" &&
      typeof itemB.specs.noise_idle_dba === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "noise_idle_dba",
          label_en: "Idle Acoustic Noise",
          label_ko: "유휴 소음",
          unit: "dBA",
          value_a: itemA.specs.noise_idle_dba,
          value_b: itemB.specs.noise_idle_dba,
          higher_is_better: false,
          decimals: 1,
        })
      );
    }

    if (
      typeof itemA.specs.noise_load_dba === "number" &&
      typeof itemB.specs.noise_load_dba === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "noise_load_dba",
          label_en: "Load Acoustic Noise",
          label_ko: "부하 소음",
          unit: "dBA",
          value_a: itemA.specs.noise_load_dba,
          value_b: itemB.specs.noise_load_dba,
          higher_is_better: false,
          decimals: 1,
        })
      );
    }

    if (
      typeof itemA.specs.lan_speed_gbps === "number" &&
      typeof itemB.specs.lan_speed_gbps === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "lan_speed_gbps",
          label_en: "LAN Ethernet Speed",
          label_ko: "유선 랜 속도",
          unit: "Gbps",
          value_a: itemA.specs.lan_speed_gbps,
          value_b: itemB.specs.lan_speed_gbps,
          higher_is_better: true,
          decimals: 1,
        })
      );
    }

    if (
      typeof itemA.specs.drive_bays === "number" &&
      typeof itemB.specs.drive_bays === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "drive_bays",
          label_en: "Drive Bays",
          label_ko: "드라이브 베이 수",
          unit: "bays",
          value_a: itemA.specs.drive_bays,
          value_b: itemB.specs.drive_bays,
          higher_is_better: true,
          decimals: 0,
        })
      );
    }

    if (
      typeof itemA.specs.ups_watt_rating === "number" &&
      typeof itemB.specs.ups_watt_rating === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "ups_watt_rating",
          label_en: "UPS Active Power Rating",
          label_ko: "UPS 실출력 용량",
          unit: "W",
          value_a: itemA.specs.ups_watt_rating,
          value_b: itemB.specs.ups_watt_rating,
          higher_is_better: true,
          decimals: 0,
        })
      );
    }

    if (
      typeof itemA.specs.ups_runtime_half_load_min === "number" &&
      typeof itemB.specs.ups_runtime_half_load_min === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "ups_runtime_half_load_min",
          label_en: "UPS Half-Load Runtime",
          label_ko: "UPS 50% 부하 백업 시간",
          unit: "min",
          value_a: itemA.specs.ups_runtime_half_load_min,
          value_b: itemB.specs.ups_runtime_half_load_min,
          higher_is_better: true,
          decimals: 1,
        })
      );
    }

    if (
      typeof derivedA.ups_power_factor === "number" &&
      typeof derivedB.ups_power_factor === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "ups_power_factor",
          label_en: "UPS Power Factor (W / VA)",
          label_ko: "UPS 역률 (W / VA)",
          unit: "PF",
          value_a: derivedA.ups_power_factor,
          value_b: derivedB.ups_power_factor,
          higher_is_better: true,
          decimals: 2,
        })
      );
    }

    if (
      typeof itemA.specs.suction_pa === "number" &&
      typeof itemB.specs.suction_pa === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "suction_pa",
          label_en: "Max Suction Power",
          label_ko: "최대 흡입력",
          unit: "Pa",
          value_a: itemA.specs.suction_pa,
          value_b: itemB.specs.suction_pa,
          higher_is_better: true,
          decimals: 0,
        })
      );
    }

    if (
      typeof itemA.specs.dustbag_capacity_l === "number" &&
      typeof itemB.specs.dustbag_capacity_l === "number"
    ) {
      rows.push(
        buildDiffRow({
          key: "dustbag_capacity_l",
          label_en: "Dock Dustbag Capacity",
          label_ko: "스테이션 더스트백 용량",
          unit: "L",
          value_a: itemA.specs.dustbag_capacity_l,
          value_b: itemB.specs.dustbag_capacity_l,
          higher_is_better: true,
          decimals: 2,
        })
      );
    }
  }

  const aWinKeys = [];
  const bWinKeys = [];
  let ties = 0;

  for (const row of rows) {
    if (row.winner === "a") aWinKeys.push(row.key);
    else if (row.winner === "b") bWinKeys.push(row.key);
    else if (row.winner === "tie") ties += 1;
  }

  const overallLeader =
    aWinKeys.length > bWinKeys.length ? "a" : bWinKeys.length > aWinKeys.length ? "b" : "tie";

  return {
    pair_slug: `${itemA.slug}-vs-${itemB.slug}`,
    vertical: itemA.vertical,
    slug_a: itemA.slug,
    slug_b: itemB.slug,
    canonical_order_valid: itemA.slug < itemB.slug,
    derived_a: derivedA,
    derived_b: derivedB,
    rows,
    summary: {
      a_wins: aWinKeys.length,
      b_wins: bWinKeys.length,
      ties,
      total_scored_metrics: aWinKeys.length + bWinKeys.length + ties,
      overall_numeric_leader: overallLeader,
      a_win_keys: aWinKeys,
      b_win_keys: bWinKeys,
    },
  };
}
