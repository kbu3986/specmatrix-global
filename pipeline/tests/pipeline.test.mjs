import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WattCheckItemSchema,
  PureGramItemSchema,
  CycleGearItemSchema,
} from "../../schemas/ssot-schema.mjs";
import {
  verifyWattCheckPhysics,
  verifyPureGramPhysics,
  verifyCycleGearPhysics,
  verifyCrossAuditGuards,
  scanYmylForbiddenTerms,
} from "../physics-math.mjs";
import {
  DEFAULT_FX_RATES,
  computeWattCheckDerived,
  computePureGramDerived,
  computeCycleGearDerived,
  computeVsDiffTable,
} from "../derived-metrics.mjs";
import { validateFxRatesUpdate, updateFxSnapshot } from "../update-fx.mjs";
import {
  countStructuredFields,
  auditItemInformationGain,
  auditVsInformationGain,
  runIgAudit,
} from "../serp-ig-audit.mjs";
import { runValidation } from "../validate-all.mjs";
import {
  scanVisibleLeakTokens,
  extractInternalHrefs,
  resolveInternalHref,
  extractLinkTags,
  extractAffiliateLinks,
  extractJsonLdBlocks,
  validateSitemapXml,
  runStage6HtmlQa,
  REQUIRED_SPLIT_SITEMAPS,
} from "../stage6-html-qa.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const LEGACY_BLOCKLIST = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas", "legacy-blocklist.json"), "utf8")
);

function clone(obj) {
  return structuredClone(obj);
}

// =============================================================================
// Fixture Builders (Valid Baseline SKUs Matching schemas/ssot-schema.mjs)
// =============================================================================

function makeWattBatteryItem(overrides = {}) {
  const base = {
    schema_version: "2.0.0",
    vertical: "wattcheck",
    category: "power-bank",
    slug: "anker-prime-27650mah-250w",
    release_wave: 1,
    available_locales: ["en", "ko"],
    brand: "Anker",
    model_number: "A1340",
    origin_country: "CN",
    regional_offers: {
      us: {
        asin: "B0BYP2F3SG",
        sku: "A1340-US",
        msrp: 179.99,
        currency: "USD",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "Anker Prime 27650mAh 250W A1340",
        status: "IN_STOCK",
      },
      kr: {
        asin: null,
        sku: "A1340-KR",
        msrp: 249000,
        currency: "KRW",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "앤커 프라임 27650mAh 250W A1340",
        status: "IN_STOCK",
      },
    },
    i18n: {
      en: {
        name: "Anker Prime 27,650mAh 250W",
        title: "Anker Prime 27,650mAh 250W (99.54 Wh) Specs & Airline Guide",
        summary:
          "Engineered at 99.54 Wh just below the 100 Wh IATA approval cap with dual 140 W + 100 W USB-C output.",
        best_for: "Frequent flyers charging a MacBook Pro 16 and phone simultaneously.",
        local_gotchas: [
          "Requires a 240 W E-Marker USB-C cable to unlock 140 W PD 3.1 EPR output.",
          "Must be carried in cabin baggage only; never pack in checked luggage.",
        ],
      },
      ko: {
        name: "앤커 프라임 27,650mAh 250W",
        title: "앤커 프라임 27,650mAh 250W (99.54 Wh) 기내반입·출력 분배",
        summary:
          "99.54 Wh 정격 설계로 항공사 사전 승인 없이 기내 휴대가 가능하며 C1+C2 동시 240 W 출력을 제공합니다.",
        best_for: "맥북 프로 16인치와 스마트폰을 함께 고속 충전하는 출장객.",
        local_gotchas: [
          "한국 출발 항공편은 투명 지퍼백 보관 및 기내 선반 보관 금지 규정을 준수해야 합니다.",
          "140 W 단일 포트 출력을 위해서는 240 W E-Marker 지원 케이블이 필수입니다.",
        ],
      },
    },
    citations: [
      {
        label: "Anker A1340 Official Manual",
        url: "https://support.anker.com/s/product/a1340",
        source_tier: 1,
        verified_at: "2026-11-22",
      },
      {
        label: "IATA Lithium Battery Guidance",
        url: "https://www.iata.org/en/programs/cargo/dgr/lithium-batteries/",
        source_tier: 1,
        verified_at: "2026-11-22",
      },
    ],
    audit: {
      fact_checked_at: "2026-11-22",
      adversarial_pass: true,
      trust_score: 98,
      info_gain_score: 92,
      human_spot_checked: true,
    },
    specs: {
      has_battery: true,
      nominal_capacity_mah: 27650,
      rated_capacity_mah_5v: 15500,
      battery_energy_wh: 99.54,
      nominal_voltage_v: 3.6,
      cell_chemistry: "Li-ion 21700",
      conversion_efficiency_pct: 82,
      wh_printed_on_body: true,
      input_voltage_range: "5V-28V USB-C PD",
      japan_100v_output_limit_w: null,
      ul_etl_certified: true,
      ce_certified: true,
      ccc_certified: true,
      pse_certified: true,
      kc_certified: true,
      weight_g: 667,
      dimensions_mm: { l: 161.7, w: 57.0, h: 49.7 },
      max_total_output_w: 250,
      max_single_port_output_w: 140,
      max_input_w: 170,
      supports_pd_3_1_epr: true,
      supports_samsung_pps_45w: true,
      supports_pass_through: true,
      power_renegotiation_drop: false,
      ports: [
        { id: "C1", type: "USB-C", max_w: 140, protocols: ["PD 3.1", "PPS 5A"] },
        { id: "C2", type: "USB-C", max_w: 140, protocols: ["PD 3.1", "PPS 5A"] },
        { id: "A1", type: "USB-A", max_w: 65, protocols: ["QC 3.0"] },
      ],
      port_allocation_matrix: [
        { active_ports: ["C1"], output_w: { C1: 140 } },
        { active_ports: ["C1", "C2"], output_w: { C1: 140, C2: 100 } },
        { active_ports: ["C1", "C2", "A1"], output_w: { C1: 140, C2: 92, A1: 18 } },
      ],
    },
    airline_compliance_profile: {
      iata_tier: "under_100wh_no_approval",
      carryon_allowed: true,
      carryon_no_approval: true,
      checked_baggage: "prohibited",
      korea_molit_2026_notes: "Under 100Wh max 5 pcs, clear zip pouch required, no overhead bin.",
      china_domestic_ccc_ok: true,
    },
  };
  return Object.assign(base, overrides);
}

function makeWattGanItem(overrides = {}) {
  const base = clone(makeWattBatteryItem());
  base.category = "gan-charger";
  base.slug = "anker-prime-100w-gan-3port";
  base.model_number = "A2343";
  base.regional_offers.us.msrp = 84.99;
  base.regional_offers.us.asin = null;
  base.regional_offers.kr.msrp = 109000;
  base.specs = {
    ...base.specs,
    has_battery: false,
    nominal_capacity_mah: null,
    rated_capacity_mah_5v: null,
    battery_energy_wh: null,
    nominal_voltage_v: null,
    cell_chemistry: null,
    conversion_efficiency_pct: null,
    wh_printed_on_body: null,
    input_voltage_range: "100-240V ~ 50/60Hz",
    weight_g: 183,
    dimensions_mm: { l: 60.5, w: 42.0, h: 29.0 },
    max_total_output_w: 100,
    max_single_port_output_w: 100,
    max_input_w: 100,
    supports_pd_3_1_epr: false,
    ports: [
      { id: "C1", type: "USB-C", max_w: 100, protocols: ["PD 3.0", "PPS"] },
      { id: "C2", type: "USB-C", max_w: 100, protocols: ["PD 3.0", "PPS"] },
      { id: "A1", type: "USB-A", max_w: 22.5, protocols: ["QC 3.0"] },
    ],
    port_allocation_matrix: [
      { active_ports: ["C1"], output_w: { C1: 100 } },
      { active_ports: ["C1", "C2"], output_w: { C1: 65, C2: 35 } },
      { active_ports: ["C1", "C2", "A1"], output_w: { C1: 45, C2: 30, A1: 22.5 } },
    ],
  };
  base.airline_compliance_profile = {
    iata_tier: "no_battery_always_allowed",
    carryon_allowed: true,
    carryon_no_approval: true,
    checked_baggage: "allowed",
    korea_molit_2026_notes: "No lithium cells; allowed in both carry-on and checked baggage.",
    china_domestic_ccc_ok: true,
  };
  return Object.assign(base, overrides);
}

function makePureGramGelItem(overrides = {}) {
  const base = {
    schema_version: "2.0.0",
    vertical: "puregram",
    category: "energy-gel",
    slug: "maurten-gel-100",
    release_wave: 1,
    available_locales: ["en", "ko"],
    brand: "Maurten",
    model_number: "GEL100-12",
    origin_country: "SE",
    regional_offers: {
      us: {
        asin: null,
        sku: "MAURTEN-G100-12",
        msrp: 46.8,
        currency: "USD",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "Maurten Gel 100 Box of 12",
        status: "IN_STOCK",
      },
      kr: {
        asin: null,
        sku: "MAURTEN-G100-KR",
        msrp: 66000,
        currency: "KRW",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "모르텐 젤 100 12개입",
        status: "IN_STOCK",
      },
    },
    i18n: {
      en: {
        name: "Maurten Gel 100",
        title: "Maurten Gel 100: True Cost per 30 g Carbs & 0.8:1 Ratio Audit",
        summary:
          "Hydrogel-encapsulated 25 g carbohydrate energy gel with a 0.8:1 fructose-to-glucose ratio designed for race-pace absorption.",
        best_for: "Marathoners and road cyclists targeting 90 g/hr carbohydrate intake.",
        local_gotchas: [
          "Low sodium content (20 mg per packet) requires pairing with a separate electrolyte mix.",
          "Hydrogel texture is firm like soft jelly and secures cleanly without sticky residue.",
        ],
      },
      ko: {
        name: "모르텐 젤 100",
        title: "모르텐 젤 100: 순수 탄수화물 30g당 실단가 및 비율 분석",
        summary:
          "하이드로겔 구조로 포도당:과당 1:0.8 비율의 탄수화물 25 g을 위장 부담 없이 공급하는 지구력 에너지젤입니다.",
        best_for: "마라톤 풀코스 및 장거리 로드사이클링 고탄수화물 보급.",
        local_gotchas: [
          "나트륨 함량이 20 mg으로 매우 낮아 여름철 대회에서는 별도 전해질 보충이 필요합니다.",
          "포당 단가가 일반 젤보다 높아 실전 대회 위주로 활용하는 전략이 효율적입니다.",
        ],
      },
    },
    citations: [
      {
        label: "Maurten Gel 100 Official Nutrition Facts",
        url: "https://www.maurten.com/products/gel-100",
        source_tier: 1,
        verified_at: "2026-11-22",
      },
      {
        label: "Informed Sport Certified Products Database",
        url: "https://sport.wetestyoutrust.com/supplement-search",
        source_tier: 2,
        verified_at: "2026-11-22",
      },
    ],
    audit: {
      fact_checked_at: "2026-11-22",
      adversarial_pass: true,
      trust_score: 99,
      info_gain_score: 91,
      human_spot_checked: true,
    },
    package_spec: {
      net_weight_g: 480,
      total_servings: 12,
      serving_weight_g: 40,
      unit_type: "packet",
      flavors_tracked: ["Unflavored Hydrogel"],
    },
    nutrition_label: {
      calories_kcal: 100,
      active_ingredient_type: "carbohydrates",
      active_per_serving_g: 25,
      protein_g: 0,
      carbs_g: 25,
      fat_g: 0,
      sugar_g: 25,
      fiber_g: 0,
      carb_ratio_glucose_to_fructose: "1:0.8",
      caffeine_mg: 0,
      sodium_mg: 20,
      potassium_mg: 0,
      magnesium_mg: 0,
      creapure_certified: false,
      hydrogel_or_isotonic: "hydrogel",
      free_form_amino_listed: false,
      artificial_sweeteners_listed: false,
      sweetener_details: "No added artificial sweeteners; glucose and fructose only",
    },
    derived_math: {
      purity_pct: 62.5,
      total_pure_active_g: 300,
      benchmark_unit_g: 30,
      benchmark_label_en: "Per 30 g Pure Carbs",
      benchmark_label_ko: "순수 탄수화물 30g당",
      servings_for_90g_per_hour: 3.6,
      purity_grade: "A+",
    },
    certifications: ["Informed Sport", "Vegan"],
  };
  return Object.assign(base, overrides);
}

function makeCyclePowerMeterItem(overrides = {}) {
  const base = {
    schema_version: "2.0.0",
    vertical: "cyclegear",
    category: "power-meter",
    slug: "favero-assioma-pro-rs-2",
    release_wave: 1,
    available_locales: ["en", "ko"],
    brand: "Favero Electronics",
    model_number: "773-02-PRO-RS2",
    origin_country: "IT",
    regional_offers: {
      us: {
        asin: null,
        sku: "FAVERO-PRO-RS2-US",
        msrp: 759.0,
        currency: "USD",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "Favero Assioma PRO RS-2 Shimano SPD-SL power meter",
        status: "IN_STOCK",
      },
      kr: {
        asin: null,
        sku: "FAVERO-PRO-RS2-KR",
        msrp: 1080000,
        currency: "KRW",
        price_mode: "msrp_benchmark_mode",
        price_checked_at: "2026-11-22",
        search_query: "파베로 아시오마 프로 RS-2 파워미터",
        status: "IN_STOCK",
      },
    },
    i18n: {
      en: {
        name: "Favero Assioma PRO RS-2",
        title: "Favero Assioma PRO RS-2 Dual Power Meter Specs & Compatibility",
        summary:
          "Pod-free spindle-integrated Shimano SPD-SL dual-sided power meter pedals with 1.0% claimed accuracy and 247 g pair weight.",
        best_for: "Road cyclists switching bikes frequently on Shimano SPD-SL cleats.",
        local_gotchas: [
          "Uses Shimano SPD-SL cleats; not directly compatible with Look Keo cleats.",
          "Requires 35-40 Nm torque with an 8 mm hex wrench during pedal installation.",
        ],
      },
      ko: {
        name: "파베로 아시오마 프로 RS-2",
        title: "파베로 아시오마 프로 RS-2 (SPD-SL) 스펙·호환성 분석",
        summary:
          "스핀들 내장형 포드리스 시마노 SPD-SL 양발 파워미터로 ±1.0% 정확도와 247 g 페어 중량을 제공합니다.",
        best_for: "크랭크·BB 교체 없이 여러 로드바이크에 옮겨 달고 싶은 라이더.",
        local_gotchas: [
          "시마노 SPD-SL 전용 바디로 룩 케오(Look Keo) 클릿과 호환되지 않습니다.",
          "장착 시 8 mm 육각 렌치로 35-40 Nm 규정 토크를 준수해야 합니다.",
        ],
      },
    },
    citations: [
      {
        label: "Favero Assioma PRO RS Official Tech Sheet",
        url: "https://cycling.favero.com/en/assiomaprors",
        source_tier: 1,
        verified_at: "2026-11-22",
      },
      {
        label: "ANT+ Device Directory",
        url: "https://www.thisisant.com/directory/",
        source_tier: 2,
        verified_at: "2026-11-22",
      },
    ],
    audit: {
      fact_checked_at: "2026-11-22",
      adversarial_pass: true,
      trust_score: 98,
      info_gain_score: 95,
      human_spot_checked: true,
    },
    specs: {
      weight_g: 247,
      claimed_accuracy_pct: 1.0,
      left_right_balance: true,
      mount_or_form_factor: "Dual-sided pedal spindle (pod-free)",
      connectivity: ["ANT+", "Bluetooth 5.0"],
      battery_life_hours: 60,
      waterproof_rating: "IP67",
      tire_width_mm: null,
      hookless_compatible: null,
      hookless_max_psi: null,
      max_trainer_watts: null,
      max_trainer_grade_pct: null,
      trainer_noise_dba: null,
      drivetrain_speeds: null,
      key_specs_kv: [
        { key_en: "Cleat System", key_ko: "클릿 규격", value: "Shimano SPD-SL" },
        { key_en: "Stack Height", key_ko: "스택 높이", value: "10.5 mm" },
        { key_en: "Q-Factor", key_ko: "Q-팩터", value: "53 mm" },
        { key_en: "Oval Chainring", key_ko: "타원 체인링", value: "Supported (IAV)" },
        { key_en: "Battery Type", key_ko: "배터리", value: "Integrated Li-ion rechargeable" },
        { key_en: "Waterproof", key_ko: "방수 등급", value: "IP67" },
      ],
    },
    compatibility_graph: {
      bb_or_mount_standard: "Universal 9/16x20 TPI pedal thread",
      freehub_or_cleat_standard: "Shimano SPD-SL",
      drivetrain_compatible: ["Shimano Di2 12s", "Shimano 11s", "SRAM AXS 12s", "Campagnolo 12s"],
      head_unit_or_app_verified: ["COROS DURA", "Garmin Edge 840", "Garmin Edge 1050", "Wahoo ROAM V2"],
      incompatible_notes_en: ["Not compatible with Look Keo cleats without changing pedal body."],
      incompatible_notes_ko: ["룩 케오 클릿과는 바디 교체 없이 직접 호환되지 않습니다."],
    },
    safety_warning: {
      requires_hookless_warning: false,
      torque_or_install_note_en: "Tighten pedal spindles to 35-40 Nm with a calibrated 8 mm hex wrench.",
      torque_or_install_note_ko: "페달 스핀들은 8 mm 토크 렌치로 35-40 Nm 규정 토크로 체결하세요.",
    },
  };
  return Object.assign(base, overrides);
}

function makeCycleRoadTireItem(overrides = {}) {
  const base = clone(makeCyclePowerMeterItem());
  base.category = "road-tire";
  base.slug = "continental-gp5000-s-tr-28";
  base.brand = "Continental";
  base.model_number = "0101867";
  base.regional_offers.us.msrp = 99.95;
  base.regional_offers.kr.msrp = 115000;
  base.specs = {
    ...base.specs,
    weight_g: 280,
    claimed_accuracy_pct: null,
    left_right_balance: null,
    mount_or_form_factor: "700x28c Tubeless Ready Folding",
    connectivity: [],
    battery_life_hours: null,
    waterproof_rating: null,
    tire_width_mm: 28,
    hookless_compatible: true,
    hookless_max_psi: 72.5,
  };
  base.compatibility_graph.bb_or_mount_standard = "700c Hooked & Hookless TSS (19-25mm IW)";
  base.compatibility_graph.freehub_or_cleat_standard = "ETRTO 28-622 Tubeless Ready";
  base.safety_warning = {
    requires_hookless_warning: true,
    torque_or_install_note_en:
      "Never exceed 5.0 bar / 72.5 psi on hookless rims and verify rim maker approved tire list.",
    torque_or_install_note_ko:
      "후크리스 림에서는 절대 5.0 bar (72.5 psi)를 초과하지 말고 림 제조사 공식 승인 리스트를 확인하세요.",
  };
  return Object.assign(base, overrides);
}

function makeCycleTrainerItem(overrides = {}) {
  const base = clone(makeCyclePowerMeterItem());
  base.category = "smart-trainer";
  base.slug = "wahoo-kickr-core";
  base.brand = "Wahoo Fitness";
  base.model_number = "WFBKTR4";
  base.regional_offers.us.msrp = 499.99;
  base.regional_offers.kr.msrp = 790000;
  base.specs = {
    ...base.specs,
    weight_g: 18144,
    claimed_accuracy_pct: 2.0,
    left_right_balance: false,
    mount_or_form_factor: "Direct-drive smart trainer",
    battery_life_hours: null,
    max_trainer_watts: 1800,
    max_trainer_grade_pct: 16,
    trainer_noise_dba: 58,
  };
  return Object.assign(base, overrides);
}

function makeAuditLog(slug, vertical) {
  return {
    sku_slug: slug,
    vertical,
    audited_at: "2026-11-22",
    trust_score: 98,
    evidence_quotes: [
      {
        field: "primary_spec",
        quote: "Verified directly from official manufacturer specification sheet.",
        source_url: "https://example.com/official-spec",
        source_tier: 1,
      },
      {
        field: "secondary_spec",
        quote: "Cross-checked with official regulatory compliance listing.",
        source_url: "https://example.com/regulatory-db",
        source_tier: 2,
      },
    ],
    adversarial_checks: [
      "Checked generation confusion against previous model year.",
      "Verified units, regional certifications, and MSRP benchmark pricing.",
    ],
    contradictions: [],
    verdict: "PASS",
  };
}

function makeAirline(index, region) {
  const code = `A${String(index).padStart(2, "0")}`.slice(0, 3);
  return {
    slug: `test-airline-${index}`,
    iata_code: code,
    region,
    name_en: `Test Airline ${index}`,
    name_ko: `테스트 항공 ${index}`,
    under_100wh_max_pcs: 5,
    between_100_160wh_max_pcs: 2,
    between_100_160wh_requires_approval: true,
    over_160wh_allowed: false,
    overhead_bin_prohibited: region === "KR",
    inflight_charging_prohibited: region === "KR",
    terminal_insulation_pouch_required: region === "KR",
    wh_marking_strict: true,
    ccc_marking_required_domestic: false,
    notes_en: "Carry lithium power banks in cabin baggage only following IATA rules.",
    notes_ko: "리튬 보조배터리는 반드시 기내 수하물로만 휴대해야 합니다.",
    official_policy_url: `https://airline-${index}.example.com/baggage/batteries`,
    verified_at: "2026-11-22",
  };
}

function makeVsInsight(vertical, slugA, slugB) {
  return {
    pair_slug: `${slugA}-vs-${slugB}`,
    vertical,
    slug_a: slugA,
    slug_b: slugB,
    release_wave: 1,
    info_gain_score: 88,
    serp_gaps_captured: [
      "Side-by-side deterministic cost-efficiency delta across US and KR benchmarks.",
      "Multi-scenario engineering edge cases absent from retail spec pages.",
      "Region-specific regulatory and compatibility warning comparison.",
    ],
    verdict: {
      en: {
        headline: `${slugA} vs ${slugB}: Quantitative Engineering Breakdown`,
        choose_a_if: [
          "You prioritize higher peak output and headroom for heavy loads.",
          "You want the broadest multi-region safety certification coverage.",
        ],
        choose_b_if: [
          "You want lower upfront MSRP benchmark cost and lighter travel weight.",
          "You primarily charge mid-wattage devices on short trips.",
        ],
        bottom_line:
          "Both models pass strict verification; choose based on weight-to-output ratio and benchmark cost delta.",
      },
      ko: {
        headline: `${slugA} vs ${slugB}: 정량 스펙 및 실효 단가 비교`,
        choose_a_if: [
          "고출력 여유분과 확장성을 최우선으로 고려하는 경우.",
          "글로벌 주요 안전인증이 모두 필요한 해외 출장 환경.",
        ],
        choose_b_if: [
          "초기 출고가 부담을 낮추고 휴대 무게를 줄이고 싶은 경우.",
          "중출력 기기 위주의 일상·단기 출장 활용이 목적인 경우.",
        ],
        bottom_line:
          "두 제품 모두 교차검증을 통과했으며 무게 대비 출력 밀도와 기준 단가 격차에 따라 선택이 갈립니다.",
      },
    },
  };
}

function makeMatrixPage(vertical, archetype, slug, featuredSlugs) {
  return {
    slug,
    vertical,
    archetype,
    release_wave: 1,
    filter_category: null,
    featured_item_slugs: featuredSlugs,
    i18n: {
      en: {
        title: `Verified ${vertical} ${slug} Comparison Matrix`,
        subtitle: "Deterministic multi-facet filter table built from official manufacturer specifications.",
        intro:
          "Compare verified products side by side using deterministic derived metrics, official citations, and region-specific compliance checks.",
        methodology_note: "All metrics are calculated deterministically from official Tier 1–2 datasheets.",
        key_takeaways: [
          "Filter by benchmark cost, weight, and safety certification with zero latency.",
          "Every displayed number is cross-checked against physics and label math invariants.",
          "Click any pair to open the canonical deterministic VS diff breakdown.",
        ],
      },
      ko: {
        title: `검증 완료 ${vertical} ${slug} 비교 매트릭스`,
        subtitle: "공식 제조사 스펙시트 기반 결정론적 다중 필터·정렬 비교표입니다.",
        intro:
          "공식 출처로 교차 검증된 제품들의 실효 파생 지표와 국가별 규정·호환성 조건을 한눈에 비교할 수 있습니다.",
        methodology_note: "모든 수치는 공식 1·2등급 문서를 기반으로 코드가 결정론적으로 계산합니다.",
        key_takeaways: [
          "기준 단가·무게·인증 조건으로 무지연 실시간 필터링이 가능합니다.",
          "모든 수치는 물리·성분표 검산 불변 조건을 100% 통과했습니다.",
          "비교하고 싶은 두 모델의 1:1 정밀 VS 페이지로 바로 이동할 수 있습니다.",
        ],
      },
    },
  };
}

// =============================================================================
// 1. Physics & Math Invariants Tests
// =============================================================================

describe("physics-math: WattCheck invariants", () => {
  it("passes valid <100Wh battery power bank and satisfies Zod schema", () => {
    const item = makeWattBatteryItem();
    assert.equal(WattCheckItemSchema.safeParse(item).success, true);
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, true, JSON.stringify(res.errors));
    assert.ok(res.checks.wh_deviation_ratio <= 0.05);
  });

  it("passes valid >160Wh power station with carryon_allowed=false and over_160wh_prohibited", () => {
    const station = makeWattBatteryItem({
      category: "power-station",
      slug: "ecoflow-river-3-245wh",
    });
    station.specs.nominal_capacity_mah = 76560;
    station.specs.nominal_voltage_v = 3.2; // 76560 * 3.2 / 1000 = 244.992 Wh
    station.specs.battery_energy_wh = 245;
    station.specs.max_total_output_w = 300;
    station.specs.max_single_port_output_w = 300;
    station.airline_compliance_profile.iata_tier = "over_160wh_prohibited";
    station.airline_compliance_profile.carryon_allowed = false;
    station.airline_compliance_profile.carryon_no_approval = false;
    station.airline_compliance_profile.checked_baggage = "prohibited";

    const res = verifyWattCheckPhysics(station);
    assert.equal(res.passed, true, JSON.stringify(res.errors));
  });

  it("passes valid GaN charger (has_battery=false)", () => {
    const gan = makeWattGanItem();
    assert.equal(WattCheckItemSchema.safeParse(gan).success, true);
    const res = verifyWattCheckPhysics(gan);
    assert.equal(res.passed, true, JSON.stringify(res.errors));
  });

  it("rejects battery Wh mismatch > 5% (e.g. 5V rated capacity confused for cell capacity)", () => {
    const item = makeWattBatteryItem();
    item.specs.nominal_capacity_mah = 15500; // 15500 * 3.6 / 1000 = 55.8 Wh vs 99.54 Wh
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_WH_FORMULA_MISMATCH"));
  });

  it("rejects port_allocation_matrix row sum exceeding max_total_output_w", () => {
    const item = makeWattBatteryItem();
    item.specs.port_allocation_matrix.push({
      active_ports: ["C1", "C2", "A1"],
      output_w: { C1: 140, C2: 140, A1: 65 }, // 345W > 250W
    });
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_PORT_SUM_EXCEEDS_MAX"));
  });

  it("rejects unknown port ID in active_ports or output_w", () => {
    const item = makeWattBatteryItem();
    item.specs.port_allocation_matrix.push({
      active_ports: ["C1", "C99"],
      output_w: { C1: 100, C99: 45 },
    });
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_UNKNOWN_ACTIVE_PORT"));
  });

  it("rejects >100Wh battery claiming carryon_no_approval=true", () => {
    const item = makeWattBatteryItem();
    item.specs.nominal_capacity_mah = 32000;
    item.specs.nominal_voltage_v = 3.7;
    item.specs.battery_energy_wh = 118.4;
    item.airline_compliance_profile.carryon_no_approval = true;
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_IATA_OVER_100WH_APPROVAL"));
  });

  it("rejects >160Wh battery claiming carryon_allowed=true", () => {
    const item = makeWattBatteryItem();
    item.specs.nominal_capacity_mah = 90000;
    item.specs.nominal_voltage_v = 3.2;
    item.specs.battery_energy_wh = 288;
    item.airline_compliance_profile.carryon_no_approval = false;
    item.airline_compliance_profile.carryon_allowed = true;
    item.airline_compliance_profile.iata_tier = "100_to_160wh_approval_required";
    const res = verifyWattCheckPhysics(item);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_IATA_OVER_160WH_CARRYON"));
  });

  it("rejects GaN charger (has_battery=false) with wrong iata_tier", () => {
    const gan = makeWattGanItem();
    gan.airline_compliance_profile.iata_tier = "under_100wh_no_approval";
    const res = verifyWattCheckPhysics(gan);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "WATT_GAN_IATA_TIER"));
  });

  it("passes 100–160Wh battery with approval-required profile and rejects single-port > max-total or port > max_w", () => {
    const mid = makeWattBatteryItem();
    mid.specs.nominal_capacity_mah = 35000;
    mid.specs.nominal_voltage_v = 3.7;
    mid.specs.battery_energy_wh = 129.5;
    mid.airline_compliance_profile.iata_tier = "100_to_160wh_approval_required";
    mid.airline_compliance_profile.carryon_allowed = true;
    mid.airline_compliance_profile.carryon_no_approval = false;
    assert.equal(verifyWattCheckPhysics(mid).passed, true);

    const badPortCap = makeWattBatteryItem();
    badPortCap.specs.port_allocation_matrix[0] = {
      active_ports: ["C1"],
      output_w: { C1: 180 }, // exceeds C1 max_w of 140
    };
    assert.ok(
      verifyWattCheckPhysics(badPortCap).errors.some((e) => e.code === "WATT_PORT_EXCEEDS_MAX_W")
    );
  });
});

describe("physics-math: PureGram invariants & YMYL filter", () => {
  it("passes valid energy gel and satisfies Zod schema", () => {
    const gel = makePureGramGelItem();
    assert.equal(PureGramItemSchema.safeParse(gel).success, true);
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, true, JSON.stringify(res.errors));
  });

  it("skips calorie check cleanly on zero-calorie electrolyte (calories_kcal < 20)", () => {
    const elec = makePureGramGelItem({
      category: "electrolyte",
      slug: "precision-ph-1500-electrolyte",
    });
    elec.package_spec = {
      net_weight_g: 60,
      total_servings: 10,
      serving_weight_g: 6,
      unit_type: "packet",
      flavors_tracked: ["Mild Citrus"],
    };
    elec.nutrition_label = {
      ...elec.nutrition_label,
      calories_kcal: 10,
      active_ingredient_type: "electrolytes_sodium_potassium",
      active_per_serving_g: 1.75,
      protein_g: 0,
      carbs_g: 1.5,
      fat_g: 0,
      sugar_g: 1.0,
      sodium_mg: 1500,
      potassium_mg: 250,
      carb_ratio_glucose_to_fructose: null,
      hydrogel_or_isotonic: "none",
    };
    elec.derived_math = {
      purity_pct: 29.17,
      total_pure_active_g: 17.5,
      benchmark_unit_g: 1,
      benchmark_label_en: "Per 1,000 mg Na+K",
      benchmark_label_ko: "순수 Na+K 1,000mg당",
      servings_for_90g_per_hour: null,
      purity_grade: "A",
    };

    const res = verifyPureGramPhysics(elec);
    assert.equal(res.passed, true, JSON.stringify(res.errors));
    assert.equal(res.checks.kcal_check_skipped, true);
  });

  it("rejects net_weight mismatch > 5%", () => {
    const gel = makePureGramGelItem();
    gel.package_spec.net_weight_g = 600; // 40 * 12 = 480 vs 600 (20% off)
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_NET_WEIGHT_MISMATCH"));
  });

  it("rejects macros exceeding serving_weight_g", () => {
    const gel = makePureGramGelItem();
    gel.nutrition_label.carbs_g = 35;
    gel.nutrition_label.protein_g = 10; // 45 > 40g serving
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_MACRO_EXCEEDS_SERVING"));
  });

  it("rejects active_per_serving_g exceeding serving_weight_g", () => {
    const gel = makePureGramGelItem();
    gel.nutrition_label.active_per_serving_g = 45;
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_ACTIVE_EXCEEDS_SERVING"));
  });

  it("rejects purity_pct mismatch > 0.5 percentage points", () => {
    const gel = makePureGramGelItem();
    gel.derived_math.purity_pct = 65.0; // expected 62.5%
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_PURITY_MISMATCH"));
  });

  it("rejects total_pure_active_g mismatch > 2%", () => {
    const gel = makePureGramGelItem();
    gel.derived_math.total_pure_active_g = 340; // expected 300g
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_TOTAL_ACTIVE_MISMATCH"));
  });

  it("rejects calorie deviation > 15% when calories_kcal >= 20", () => {
    const gel = makePureGramGelItem();
    gel.nutrition_label.calories_kcal = 150; // 4*25 = 100 vs 150 (33% deviation)
    const res = verifyPureGramPhysics(gel);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "PURE_CALORIE_MISMATCH"));
  });

  it("rejects all forbidden YMYL terms while allowing benign words like 'secures'", () => {
    const forbiddenSamples = [
      "이 제품은 아미노 스파이킹 의혹이 제기되었습니다.",
      "Known amino spiking scam among budget supplements.",
      "This electrolyte formula cures chronic dehydration.",
      "Scientifically proven that it treats disease rapidly.",
    ];

    for (const phrase of forbiddenSamples) {
      const gel = makePureGramGelItem();
      gel.i18n.en.summary = phrase;
      const res = verifyPureGramPhysics(gel);
      assert.equal(res.passed, false, `Expected YMYL rejection for: "${phrase}"`);
      assert.ok(res.errors.some((e) => e.code === "PURE_YMYL_FORBIDDEN_TERM"));
    }

    // Benign text containing "secures" and factual label phrasing must pass
    const cleanGel = makePureGramGelItem();
    cleanGel.i18n.en.summary =
      "Packet cap secures tightly in jersey pockets; objective label confirms zero added free-form amino acids.";
    assert.equal(scanYmylForbiddenTerms(cleanGel).length, 0);
    assert.equal(verifyPureGramPhysics(cleanGel).passed, true);
  });
});

describe("physics-math: CycleGear invariants", () => {
  it("passes valid power meter, road tire, and smart trainer", () => {
    const pm = makeCyclePowerMeterItem();
    const tire = makeCycleRoadTireItem();
    const trainer = makeCycleTrainerItem();

    assert.equal(CycleGearItemSchema.safeParse(pm).success, true);
    assert.equal(CycleGearItemSchema.safeParse(tire).success, true);
    assert.equal(CycleGearItemSchema.safeParse(trainer).success, true);

    assert.equal(verifyCycleGearPhysics(pm).passed, true);
    assert.equal(verifyCycleGearPhysics(tire).passed, true);
    assert.equal(verifyCycleGearPhysics(trainer).passed, true);
  });

  it("rejects power meter accuracy outside 0.5–3.0%", () => {
    const pmLow = makeCyclePowerMeterItem();
    pmLow.specs.claimed_accuracy_pct = 0.2;
    assert.equal(verifyCycleGearPhysics(pmLow).passed, false);

    const pmHigh = makeCyclePowerMeterItem();
    pmHigh.specs.claimed_accuracy_pct = 4.5;
    const res = verifyCycleGearPhysics(pmHigh);
    assert.equal(res.passed, false);
    assert.ok(res.errors.some((e) => e.code === "CYCLE_POWER_METER_ACCURACY"));
  });

  it("rejects road tire width outside 23–45mm, missing hookless warning, or hookless_max_psi > 73", () => {
    const narrow = makeCycleRoadTireItem();
    narrow.specs.tire_width_mm = 19;
    assert.ok(verifyCycleGearPhysics(narrow).errors.some((e) => e.code === "CYCLE_TIRE_WIDTH_RANGE"));

    const noWarn = makeCycleRoadTireItem();
    noWarn.safety_warning.requires_hookless_warning = false;
    assert.ok(
      verifyCycleGearPhysics(noWarn).errors.some((e) => e.code === "CYCLE_HOOKLESS_WARNING_REQUIRED")
    );

    const highPsi = makeCycleRoadTireItem();
    highPsi.specs.hookless_max_psi = 85;
    assert.ok(verifyCycleGearPhysics(highPsi).errors.some((e) => e.code === "CYCLE_HOOKLESS_MAX_PSI"));
  });

  it("rejects smart trainer noise outside 15–85 dBA", () => {
    const tooQuiet = makeCycleTrainerItem();
    tooQuiet.specs.trainer_noise_dba = 10;
    assert.ok(
      verifyCycleGearPhysics(tooQuiet).errors.some((e) => e.code === "CYCLE_TRAINER_NOISE_RANGE")
    );

    const tooLoud = makeCycleTrainerItem();
    tooLoud.specs.trainer_noise_dba = 92;
    assert.ok(
      verifyCycleGearPhysics(tooLoud).errors.some((e) => e.code === "CYCLE_TRAINER_NOISE_RANGE")
    );
  });
});

describe("physics-math: Cross-Audit Guards (SM-01, SM-02, citations, scores)", () => {
  it("passes clean item and rejects ALL 48 legacy ssalmeok-empire blocklisted slugs", () => {
    assert.equal(LEGACY_BLOCKLIST.blocked_slugs.length, 48);

    const clean = makePureGramGelItem();
    assert.equal(verifyCrossAuditGuards(clean, LEGACY_BLOCKLIST).passed, true);

    for (const blockedSlug of LEGACY_BLOCKLIST.blocked_slugs) {
      const collision = makePureGramGelItem({ slug: blockedSlug });
      const res = verifyCrossAuditGuards(collision, LEGACY_BLOCKLIST);
      assert.equal(res.passed, false);
      assert.ok(res.errors.some((e) => e.code === "SM01_LEGACY_BLOCKLIST_COLLISION"));
    }
  });

  it("rejects placeholder/fake ASINs and identical cross-region duplicated ASINs", () => {
    const fakeAsinItem = makeCyclePowerMeterItem();
    fakeAsinItem.regional_offers.us.asin = "B0F1ASSIOMA";
    const fakeRes = verifyCrossAuditGuards(fakeAsinItem, LEGACY_BLOCKLIST);
    assert.equal(fakeRes.passed, false);
    assert.ok(fakeRes.errors.some((e) => e.code === "SM02_FAKE_OR_INVALID_ASIN"));

    const dupAsinItem = makeWattBatteryItem();
    dupAsinItem.regional_offers.us.asin = "B0BYP2F3SG";
    dupAsinItem.regional_offers.de = {
      asin: "B0BYP2F3SG",
      msrp: 189.99,
      currency: "EUR",
      price_mode: "msrp_benchmark_mode",
      price_checked_at: "2026-11-22",
      search_query: "Anker Prime DE",
      status: "IN_STOCK",
    };
    const dupRes = verifyCrossAuditGuards(dupAsinItem, LEGACY_BLOCKLIST);
    assert.equal(dupRes.passed, false);
    assert.ok(dupRes.errors.some((e) => e.code === "SM02_DUPLICATE_CROSS_REGION_ASIN"));

    // Distinct valid ASINs across regions pass
    dupAsinItem.regional_offers.de.asin = "B0C9UNIQUE";
    assert.equal(verifyCrossAuditGuards(dupAsinItem, LEGACY_BLOCKLIST).passed, true);
  });

  it("rejects wrong price_mode, <2 citations, trust_score < 95, and info_gain_score < 75", () => {
    const bad = makeWattBatteryItem();
    bad.regional_offers.us.price_mode = "live_amazon_price";
    bad.citations = [bad.citations[0]];
    bad.audit.trust_score = 92;
    bad.audit.info_gain_score = 70;

    const res = verifyCrossAuditGuards(bad, LEGACY_BLOCKLIST);
    assert.equal(res.passed, false);
    const codes = new Set(res.errors.map((e) => e.code));
    assert.ok(codes.has("SM02_PRICE_MODE_VIOLATION"));
    assert.ok(codes.has("GUARD_MIN_CITATIONS"));
    assert.ok(codes.has("GUARD_TRUST_SCORE"));
    assert.ok(codes.has("GUARD_INFO_GAIN_SCORE"));
  });
});

// =============================================================================
// 2. Derived Metrics & VS Diff Table Tests
// =============================================================================

describe("derived-metrics: deterministic vertical calculations & VS diff table", () => {
  it("computes WattCheck battery derived metrics accurately", () => {
    const bank = makeWattBatteryItem();
    const d = computeWattCheckDerived(bank, DEFAULT_FX_RATES);

    assert.equal(d.usable_wh, 81.62); // 99.54 * 0.82 = 81.6228 -> 81.62
    assert.equal(d.wh_per_100g, 14.92); // 99.54 / 667 * 100
    assert.equal(d.w_per_100g, 37.48); // 250 / 667 * 100
    assert.equal(d.reference_device_charges.iphone_16_pro, 5.91); // 81.6228 / 13.8
    assert.equal(d.reference_device_charges.macbook_pro_16, 0.82); // 81.6228 / 100
    assert.equal(d.reference_device_charges.steam_deck_oled, 1.63); // 81.6228 / 50
    assert.equal(d.usd_per_10wh, 18.08); // 179.99 / 9.954
    assert.equal(d.krw_per_10wh, 25015); // round(249000 / 9.954)
    assert.equal(d.primary_cost_basis, "per_10wh");
    assert.ok(d.derived_metric_count >= 5);
  });

  it("computes WattCheck GaN derived metrics using per_10w basis and null battery fields", () => {
    const gan = makeWattGanItem();
    const d = computeWattCheckDerived(gan, DEFAULT_FX_RATES);

    assert.equal(d.usable_wh, null);
    assert.equal(d.reference_device_charges, null);
    assert.equal(d.w_per_100g, 54.64); // 100 / 183 * 100
    assert.equal(d.usd_per_10w, 8.5); // 84.99 / 10
    assert.equal(d.krw_per_10w, 10900); // 109000 / 10
    assert.equal(d.primary_cost_basis, "per_10w");
    assert.ok(d.derived_metric_count >= 4);
  });

  it("computes PureGram carb gel derived metrics including filler tax & 90g/hr race fueling cost", () => {
    const gel = makePureGramGelItem();
    const d = computePureGramDerived(gel, DEFAULT_FX_RATES);

    // 300g pure carbs / 30g benchmark = 10 units
    assert.equal(d.true_cost_per_benchmark_unit_usd, 4.68); // 46.80 / 10
    assert.equal(d.true_cost_per_benchmark_unit_krw, 6600); // 66000 / 10
    assert.equal(d.filler_tax_pct, 37.5); // 100 - 62.5
    assert.equal(d.servings_per_hour_90g, 3.6); // 90 / 25
    assert.equal(d.race_fueling_90g_hr_cost_usd, 14.04); // 3.6 * 3.90
    assert.equal(d.race_fueling_90g_hr_cost_krw, 19800); // 3.6 * 5500
    assert.ok(d.derived_metric_count >= 4);
  });

  it("computes CycleGear derived metrics, compatibility breadth score, and safety badges", () => {
    const pm = makeCyclePowerMeterItem();
    const dPm = computeCycleGearDerived(pm, DEFAULT_FX_RATES);
    assert.equal(dPm.usd_per_100g, 307.29); // 759 / 247 * 100
    assert.equal(dPm.krw_per_100g, 437247); // round(1080000 / 247 * 100)
    assert.ok(dPm.compatibility_breadth_score >= 70 && dPm.compatibility_breadth_score <= 100);
    assert.equal(dPm.safety_tier_badge.code, "TORQUE_SPEC_REQUIRED");

    const tire = makeCycleRoadTireItem();
    const dTire = computeCycleGearDerived(tire, DEFAULT_FX_RATES);
    assert.equal(dTire.safety_tier_badge.code, "HOOKLESS_CRITICAL");
    assert.equal(dTire.safety_tier_badge.level, "high");
  });

  it("computes deterministic VS diff table with accurate deltas and winners", () => {
    const itemA = makeWattBatteryItem({ slug: "anker-737-powercore-24k-140w" });
    itemA.regional_offers.us.msrp = 109.99;
    itemA.regional_offers.kr.msrp = 169000;
    itemA.specs.weight_g = 630;
    itemA.specs.battery_energy_wh = 86.4;
    itemA.specs.nominal_capacity_mah = 24000;
    itemA.specs.max_total_output_w = 140;

    const itemB = makeWattBatteryItem({ slug: "anker-prime-27650mah-250w" });

    const diff = computeVsDiffTable(itemA, itemB, DEFAULT_FX_RATES);
    assert.equal(diff.canonical_order_valid, true);
    assert.equal(diff.pair_slug, "anker-737-powercore-24k-140w-vs-anker-prime-27650mah-250w");

    const rowByKey = new Map(diff.rows.map((r) => [r.key, r]));
    assert.equal(rowByKey.get("msrp_usd").winner, "a"); // 109.99 < 179.99
    assert.equal(rowByKey.get("msrp_usd").delta_a_minus_b, -70);
    assert.equal(rowByKey.get("weight_g").winner, "a"); // 630 < 667
    assert.equal(rowByKey.get("max_total_output_w").winner, "b"); // 140 < 250
    assert.equal(rowByKey.get("max_total_output_w").delta_a_minus_b, -110);
    assert.equal(rowByKey.get("usable_wh").winner, "b");

    // Cross-vertical diff must throw
    const gel = makePureGramGelItem();
    assert.throws(() => computeVsDiffTable(itemA, gel, DEFAULT_FX_RATES), /different verticals/i);
  });

  it("computes PureGram creatine derived metrics and PureGram/CycleGear/GaN VS diff tables", () => {
    const creatine = makePureGramGelItem({ category: "creatine", slug: "momentous-creatine-creapure" });
    creatine.package_spec = {
      net_weight_g: 450,
      total_servings: 90,
      serving_weight_g: 5,
      unit_type: "scoop",
      flavors_tracked: ["Unflavored"],
    };
    creatine.nutrition_label = {
      ...creatine.nutrition_label,
      calories_kcal: 0,
      active_ingredient_type: "creatine_monohydrate",
      active_per_serving_g: 5,
      carbs_g: 0,
      sugar_g: 0,
      carb_ratio_glucose_to_fructose: null,
      creapure_certified: true,
      hydrogel_or_isotonic: "none",
    };
    creatine.derived_math = {
      purity_pct: 100,
      total_pure_active_g: 450,
      benchmark_unit_g: 5,
      benchmark_label_en: "Per 5 g Creatine",
      benchmark_label_ko: "크레아틴 5g당",
      servings_for_90g_per_hour: null,
      purity_grade: "A+",
    };
    creatine.regional_offers.us.msrp = 39.95;
    delete creatine.regional_offers.kr; // verify FX conversion fallback when KR offer absent

    const dc = computePureGramDerived(creatine, { rates: { USD: 1, KRW: 1450 } });
    assert.equal(dc.filler_tax_pct, 0);
    assert.equal(dc.race_fueling_90g_hr_cost_usd, null);
    assert.equal(dc.true_cost_per_benchmark_unit_usd, 0.44); // 39.95 / 90
    assert.equal(dc.msrp_krw, Math.round(39.95 * 1450));

    // PureGram VS diff (gel vs gel)
    const gelA = makePureGramGelItem({ slug: "maurten-gel-100" });
    const gelB = makePureGramGelItem({ slug: "sis-beta-fuel-gel" });
    gelB.regional_offers.us.msrp = 36.0;
    gelB.regional_offers.kr.msrp = 48000;
    gelB.package_spec = { net_weight_g: 720, total_servings: 12, serving_weight_g: 60, unit_type: "packet", flavors_tracked: ["Orange"] };
    gelB.nutrition_label.active_per_serving_g = 40;
    gelB.nutrition_label.carbs_g = 40;
    gelB.nutrition_label.calories_kcal = 160;
    gelB.derived_math.purity_pct = 66.67;
    gelB.derived_math.total_pure_active_g = 480;
    gelB.derived_math.servings_for_90g_per_hour = 2.25;

    const gelDiff = computeVsDiffTable(gelA, gelB, DEFAULT_FX_RATES);
    const gelRows = new Map(gelDiff.rows.map((r) => [r.key, r]));
    assert.equal(gelRows.get("race_fueling_90g_hr_cost_usd").winner, "b");
    assert.equal(gelRows.get("servings_per_hour_90g").winner, "b");
    assert.equal(gelRows.get("purity_pct").winner, "b");

    // CycleGear VS diff (power meter accuracy: lower % wins)
    const pmA = makeCyclePowerMeterItem({ slug: "favero-assioma-pro-rs-2" });
    const pmB = makeCyclePowerMeterItem({ slug: "magene-pes-p505-base" });
    pmB.regional_offers.us.msrp = 299;
    pmB.regional_offers.kr.msrp = 420000;
    pmB.specs.weight_g = 650;
    pmB.specs.claimed_accuracy_pct = 1.5;

    const pmDiff = computeVsDiffTable(pmA, pmB, DEFAULT_FX_RATES);
    const pmRows = new Map(pmDiff.rows.map((r) => [r.key, r]));
    assert.equal(pmRows.get("claimed_accuracy_pct").winner, "a"); // 1.0% < 1.5%
    assert.equal(pmRows.get("weight_g").winner, "a"); // 247g < 650g
    assert.equal(pmRows.get("msrp_usd").winner, "b"); // $299 < $759

    // GaN vs GaN uses per_10w metrics
    const ganA = makeWattGanItem({ slug: "anker-prime-100w-gan-3port" });
    const ganB = makeWattGanItem({ slug: "ugreen-nexode-pro-100w-gan-3port" });
    ganB.regional_offers.us.msrp = 74.99;
    const ganDiff = computeVsDiffTable(ganA, ganB, DEFAULT_FX_RATES);
    const ganRows = new Map(ganDiff.rows.map((r) => [r.key, r]));
    assert.equal(ganRows.get("usd_per_10w").winner, "b");
  });
});

// =============================================================================
// 3. FX Snapshot Updater Tests
// =============================================================================

describe("update-fx: ±15% anomaly guardrail & graceful offline fallback", () => {
  it("accepts clean rates within ±15% and rejects spikes/drops > 15%", () => {
    const ok = validateFxRatesUpdate(DEFAULT_FX_RATES, {
      USD: 1.0,
      KRW: 1450.0,
      JPY: 158.0,
      EUR: 0.92,
      GBP: 0.8,
    });
    assert.equal(ok.passed, true);
    assert.equal(ok.anomalies.length, 0);

    const spike = validateFxRatesUpdate(DEFAULT_FX_RATES, {
      USD: 1.0,
      KRW: 1700.0, // +21.43% anomaly
      JPY: 154.0,
      EUR: 0.94,
      GBP: 0.79,
    });
    assert.equal(spike.passed, false);
    assert.equal(spike.anomalies.length, 1);
    assert.equal(spike.anomalies[0].currency, "KRW");
  });

  it("writes updated FX snapshot on valid fetch and preserves existing on anomaly/offline/timeout", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-fx-test-"));
    const snapPath = path.join(tmpDir, "fx-rates.json");
    fs.writeFileSync(snapPath, JSON.stringify(DEFAULT_FX_RATES, null, 2));

    try {
      // 1. Offline / network error fallback
      const offlineRes = await updateFxSnapshot({
        snapshotPath: snapPath,
        fetchImpl: async () => {
          throw new Error("ENOTFOUND open.er-api.com");
        },
      });
      assert.equal(offlineRes.updated, false);
      assert.equal(offlineRes.fallback, true);
      assert.equal(offlineRes.reason, "network_error");
      assert.equal(JSON.parse(fs.readFileSync(snapPath, "utf8")).rates.KRW, 1400);

      // 2. Anomaly guardrail fallback (>15% KRW move)
      const anomalyRes = await updateFxSnapshot({
        snapshotPath: snapPath,
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            result: "success",
            rates: { USD: 1, KRW: 1800, JPY: 154, EUR: 0.94, GBP: 0.79 },
          }),
        }),
      });
      assert.equal(anomalyRes.updated, false);
      assert.equal(anomalyRes.fallback, true);
      assert.equal(anomalyRes.reason, "anomaly_guardrail_triggered");
      assert.equal(JSON.parse(fs.readFileSync(snapPath, "utf8")).rates.KRW, 1400);

      // 3. Timeout fallback (AbortController fires)
      const timeoutRes = await updateFxSnapshot({
        snapshotPath: snapPath,
        timeoutMs: 25,
        fetchImpl: (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      });
      assert.equal(timeoutRes.updated, false);
      assert.equal(timeoutRes.fallback, true);
      assert.equal(timeoutRes.reason, "timeout");
      assert.equal(JSON.parse(fs.readFileSync(snapPath, "utf8")).rates.KRW, 1400);

      // 4. Clean pass updates file
      const passRes = await updateFxSnapshot({
        snapshotPath: snapPath,
        nowDate: "2026-11-23T03:00:00Z",
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            result: "success",
            rates: { USD: 1, KRW: 1412.5, JPY: 155.2, EUR: 0.935, GBP: 0.788 },
          }),
        }),
      });
      assert.equal(passRes.updated, true);
      assert.equal(passRes.fallback, false);
      const saved = JSON.parse(fs.readFileSync(snapPath, "utf8"));
      assert.equal(saved.updated_at, "2026-11-23");
      assert.equal(saved.rates.KRW, 1412.5);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// 4. SERP IG Audit & Master Validator Tests (including 15% Circuit Breaker)
// =============================================================================

describe("serp-ig-audit & validate-all: IG compliance and 15% circuit breaker", () => {
  it("counts >=15 structured fields and passes IG audit on valid items & VS pairs", () => {
    const bank = makeWattBatteryItem();
    const gan = makeWattGanItem();
    const gel = makePureGramGelItem();
    const pm = makeCyclePowerMeterItem();

    for (const item of [bank, gan, gel, pm]) {
      assert.ok(
        countStructuredFields(item) >= 15,
        `${item.slug} structured fields = ${countStructuredFields(item)}`
      );
      const ig = auditItemInformationGain(item, DEFAULT_FX_RATES);
      assert.equal(ig.passed, true, JSON.stringify(ig.errors));
    }

    // Thin item fails IG audit
    const thin = makeCyclePowerMeterItem();
    thin.specs.key_specs_kv = [];
    thin.specs.claimed_accuracy_pct = null;
    thin.specs.left_right_balance = null;
    thin.specs.battery_life_hours = null;
    thin.specs.waterproof_rating = null;
    thin.specs.connectivity = [];
    thin.i18n.en.local_gotchas = ["Only one gotcha"];
    thin.audit.info_gain_score = 60;
    const thinIg = auditItemInformationGain(thin, DEFAULT_FX_RATES);
    assert.equal(thinIg.passed, false);
    assert.ok(thinIg.errors.length >= 3);

    // VS IG audit
    const bankA = makeWattBatteryItem({ slug: "alpha-bank" });
    const bankB = makeWattBatteryItem({ slug: "beta-bank" });
    const vs = makeVsInsight("wattcheck", "alpha-bank", "beta-bank");
    const vsIg = auditVsInformationGain(vs, bankA, bankB, DEFAULT_FX_RATES);
    assert.equal(vsIg.passed, true, JSON.stringify(vsIg.errors));
  });

  it("runValidation passes 100% on complete workspace and triggers 15% circuit breaker on quarantine spike", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sm-validate-test-"));

    try {
      fs.mkdirSync(path.join(tmpRoot, "config"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "schemas"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "wattcheck", "items"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "puregram", "items"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "cyclegear", "items"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "audit", "wattcheck"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "audit", "puregram"), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, "data", "audit", "cyclegear"), { recursive: true });

      fs.copyFileSync(
        path.join(REPO_ROOT, "config", "monetization-config.v2.json"),
        path.join(tmpRoot, "config", "monetization-config.v2.json")
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "schemas", "legacy-blocklist.json"),
        path.join(tmpRoot, "schemas", "legacy-blocklist.json")
      );

      // Build mini complete manifest (10 items total so 2 failures = 20% > 15% triggers circuit breaker)
      const wattSlugs = ["w-item-1", "w-item-2", "w-item-3", "w-item-4"];
      const pureSlugs = ["p-item-1", "p-item-2", "p-item-3"];
      const cycleSlugs = ["c-item-1", "c-item-2", "c-item-3"];

      const miniManifest = {
        pilot_version: "test-mini",
        active_locales: ["en", "ko"],
        target_core_pages: 20,
        items: { wattcheck: wattSlugs, puregram: pureSlugs, cyclegear: cycleSlugs },
        vs_pairs: {
          wattcheck: [["w-item-1", "w-item-2"]],
          puregram: [["p-item-1", "p-item-2"]],
          cyclegear: [["c-item-1", "c-item-2"]],
        },
        matrix_compat: {
          wattcheck: [{ archetype: "matrix", slug: "power-banks" }],
          puregram: [{ archetype: "matrix", slug: "energy-gels" }],
          cyclegear: [{ archetype: "matrix", slug: "power-meters" }],
        },
      };
      fs.writeFileSync(
        path.join(tmpRoot, "data", "pilot-manifest.json"),
        JSON.stringify(miniManifest, null, 2)
      );

      for (const s of wattSlugs) {
        fs.writeFileSync(
          path.join(tmpRoot, "data", "wattcheck", "items", `${s}.json`),
          JSON.stringify(makeWattBatteryItem({ slug: s }), null, 2)
        );
        fs.writeFileSync(
          path.join(tmpRoot, "data", "audit", "wattcheck", `${s}.audit.json`),
          JSON.stringify(makeAuditLog(s, "wattcheck"), null, 2)
        );
      }
      for (const s of pureSlugs) {
        fs.writeFileSync(
          path.join(tmpRoot, "data", "puregram", "items", `${s}.json`),
          JSON.stringify(makePureGramGelItem({ slug: s }), null, 2)
        );
        fs.writeFileSync(
          path.join(tmpRoot, "data", "audit", "puregram", `${s}.audit.json`),
          JSON.stringify(makeAuditLog(s, "puregram"), null, 2)
        );
      }
      for (const s of cycleSlugs) {
        fs.writeFileSync(
          path.join(tmpRoot, "data", "cyclegear", "items", `${s}.json`),
          JSON.stringify(makeCyclePowerMeterItem({ slug: s }), null, 2)
        );
        fs.writeFileSync(
          path.join(tmpRoot, "data", "audit", "cyclegear", `${s}.audit.json`),
          JSON.stringify(makeAuditLog(s, "cyclegear"), null, 2)
        );
      }

      // 30 airlines covering all 5 regions
      const regions = ["KR", "NA", "EU", "APAC", "ME"];
      const airlines = Array.from({ length: 30 }, (_, idx) =>
        makeAirline(idx + 1, regions[idx % regions.length])
      );
      fs.writeFileSync(
        path.join(tmpRoot, "data", "wattcheck", "airlines.json"),
        JSON.stringify(airlines, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpRoot, "data", "wattcheck", "vs-insights.json"),
        JSON.stringify([makeVsInsight("wattcheck", "w-item-1", "w-item-2")], null, 2)
      );
      fs.writeFileSync(
        path.join(tmpRoot, "data", "puregram", "vs-insights.json"),
        JSON.stringify([makeVsInsight("puregram", "p-item-1", "p-item-2")], null, 2)
      );
      fs.writeFileSync(
        path.join(tmpRoot, "data", "cyclegear", "vs-insights.json"),
        JSON.stringify([makeVsInsight("cyclegear", "c-item-1", "c-item-2")], null, 2)
      );

      fs.writeFileSync(
        path.join(tmpRoot, "data", "wattcheck", "matrices.json"),
        JSON.stringify([makeMatrixPage("wattcheck", "matrix", "power-banks", wattSlugs.slice(0, 3))], null, 2)
      );
      fs.writeFileSync(
        path.join(tmpRoot, "data", "puregram", "matrices.json"),
        JSON.stringify([makeMatrixPage("puregram", "matrix", "energy-gels", pureSlugs)], null, 2)
      );
      fs.writeFileSync(
        path.join(tmpRoot, "data", "cyclegear", "matrices.json"),
        JSON.stringify([makeMatrixPage("cyclegear", "matrix", "power-meters", cycleSlugs)], null, 2)
      );

      // Clean 100% pass + runIgAudit end-to-end check
      const passReport = runValidation({ rootDir: tmpRoot, writeReport: true });
      assert.equal(passReport.overall_passed, true, JSON.stringify(passReport.failures));
      assert.equal(passReport.circuit_breaker.triggered, false);
      assert.equal(passReport.circuit_breaker.status, "GREEN");
      assert.ok(fs.existsSync(path.join(tmpRoot, "data", "audit", "validation-report.json")));

      const igReport = runIgAudit({ rootDir: tmpRoot, writeReport: true });
      assert.equal(igReport.overall_passed, true, JSON.stringify(igReport.items.filter((i) => !i.passed)));
      assert.equal(igReport.summary.items_passed, 10);
      assert.equal(igReport.summary.vs_passed, 3);
      assert.ok(fs.existsSync(path.join(tmpRoot, "data", "audit", "ig-audit-report.json")));

      // Break 2 out of 10 items (20% > 15%) -> circuit breaker triggers!
      const badWatt = makeWattBatteryItem({ slug: "w-item-3" });
      badWatt.specs.nominal_capacity_mah = 10000; // Wh mismatch
      fs.writeFileSync(
        path.join(tmpRoot, "data", "wattcheck", "items", "w-item-3.json"),
        JSON.stringify(badWatt, null, 2)
      );
      const badPure = makePureGramGelItem({ slug: "p-item-3" });
      badPure.i18n.en.summary = "This product cures fatigue and treats disease.";
      fs.writeFileSync(
        path.join(tmpRoot, "data", "puregram", "items", "p-item-3.json"),
        JSON.stringify(badPure, null, 2)
      );

      const failReport = runValidation({ rootDir: tmpRoot, writeReport: false });
      assert.equal(failReport.overall_passed, false);
      assert.equal(failReport.circuit_breaker.quarantined_count, 2);
      assert.equal(failReport.circuit_breaker.quarantine_ratio_pct, 20);
      assert.equal(failReport.circuit_breaker.triggered, true);
      assert.equal(failReport.circuit_breaker.status, "RED_CIRCUIT_BREAKER");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// 5. Stage 6 HTML QA Helpers & Full Dist Audit Tests
// =============================================================================

describe("stage6-html-qa: helpers & end-to-end static dist verification", () => {
  it("detects visible leak tokens while ignoring script keywords & benign words", () => {
    const cleanHtml = `<!doctype html><html><head>
      <script>if (typeof x === "undefined" || Number.isNaN(y)) { console.log("ok"); }</script>
      <style>.box { content: "undefined"; }</style>
    </head><body><p>Banana flavor secures finance and maintenance specs cleanly.</p></body></html>`;
    assert.equal(scanVisibleLeakTokens(cleanHtml).length, 0);

    const leakyHtml = `<html><body>
      <p>Cost: $NaN | Status: undefined | Data: [object Object] | Code: PENDING_FILL</p>
    </body></html>`;
    const hits = scanVisibleLeakTokens(leakyHtml);
    assert.equal(hits.length, 4);
    assert.deepEqual(
      hits.map((h) => h.token),
      ["NaN", "undefined", "[object Object]", "PENDING_FILL"]
    );
  });

  it("extracts & verifies affiliate link rel attributes and JSON-LD blocks", () => {
    const html = `<html><body>
      <a href="https://www.amazon.com/dp/B0BYP2F3SG?tag=kbu3986-20" rel="noopener sponsored nofollow">Buy US</a>
      <a href="https://link.coupang.com/a/search?q=anker&lptag=AF2200875&subid=sm-watt-kr" rel="nofollow">Buy KR</a>
      <a href="https://www.anker.com/products/a1340">Official Spec</a>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Anker"}</script>
      <script type="application/ld+json">{ invalid json</script>
    </body></html>`;

    const aff = extractAffiliateLinks(html);
    assert.equal(aff.length, 2);
    assert.equal(aff[0].validRel, true);
    assert.equal(aff[1].validRel, false);
    assert.deepEqual(aff[1].missingRel, ["sponsored", "noopener"]);

    const jsonld = extractJsonLdBlocks(html);
    assert.equal(jsonld.length, 2);
    assert.equal(jsonld[0].valid, true);
    assert.equal(jsonld[1].valid, false);
  });

  it("extracts canonical/hreflang links regardless of attribute order and validates sitemap XML", () => {
    const html = `<head>
      <link href="https://specmatrix.io/en/about" rel="canonical" />
      <link hreflang="ko" rel="alternate" href="https://specmatrix.io/ko/about" />
      <link rel="alternate" href="https://specmatrix.io/en/about" hreflang="en" />
      <link rel="alternate" hreflang="x-default" href="https://specmatrix.io/en/about" />
    </head>`;
    const { canonicals, alternates } = extractLinkTags(html);
    assert.deepEqual(canonicals, ["https://specmatrix.io/en/about"]);
    assert.equal(alternates.length, 3);

    const goodXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://specmatrix.io/en/wattcheck/item/anker-prime-27650mah-250w</loc></url>
      </urlset>`;
    assert.equal(
      validateSitemapXml(goodXml, {
        kind: "urlset",
        siteUrl: "https://specmatrix.io",
        requiredPrefix: "https://specmatrix.io/en/wattcheck/",
      }).valid,
      true
    );

    const badXml = `<urlset><url><loc>http://specmatrix.io/ko/wattcheck/item/foo</loc></url></urlset>`;
    assert.equal(
      validateSitemapXml(badXml, {
        kind: "urlset",
        siteUrl: "https://specmatrix.io",
        requiredPrefix: "https://specmatrix.io/en/wattcheck/",
      }).valid,
      false
    );
  });

  it("runs full Stage 6 HTML QA on mock built dist (pass + targeted failure detection)", () => {
    const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), "sm-stage6-dist-"));
    const siteUrl = "https://specmatrix.io";

    function writePage(routePath, { locale = null, extraBody = "", includeJsonLd = true, omitKoHreflang = false } = {}) {
      const rest = locale ? routePath.replace(new RegExp(`^/${locale}`), "") : "";
      const dir = routePath === "/" ? tmpDist : path.join(tmpDist, routePath.replace(/^\//, ""));
      fs.mkdirSync(dir, { recursive: true });

      const disclosure =
        locale === "ko"
          ? "고지: 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다."
          : "Disclosure: As an Amazon Associate and affiliate partner, SpecMatrix earns from qualifying purchases.";

      const headLinks = locale
        ? `
          <link rel="canonical" href="${siteUrl}/${locale}${rest}" />
          <link rel="alternate" hreflang="en" href="${siteUrl}/en${rest}" />
          ${omitKoHreflang ? "" : `<link rel="alternate" hreflang="ko" href="${siteUrl}/ko${rest}" />`}
          <link rel="alternate" hreflang="x-default" href="${siteUrl}/en${rest}" />
        `
        : "";

      const jsonLd = includeJsonLd
        ? `<script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: routePath,
          })}</script>`
        : "";

      const html = `<!doctype html><html lang="${locale || "en"}"><head>
        <meta charset="utf-8" />
        ${headLinks}
        ${jsonLd}
      </head><body>
        <nav><a href="/">Home</a><a href="/en">EN</a><a href="/ko">KO</a></nav>
        <main>
          <h1>${routePath}</h1>
          ${extraBody}
        </main>
        <footer><p>${disclosure}</p></footer>
      </body></html>`;

      fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
    }

    try {
      // Build a complete small dist covering root, en/ko portals, and all 6 vertical-locale pairs
      writePage("/");
      writePage("/en", { locale: "en" });
      writePage("/ko", { locale: "ko" });

      const sampleRoutes = [
        "/wattcheck/item/anker-prime-27650mah-250w",
        "/puregram/item/maurten-gel-100",
        "/cyclegear/item/favero-assioma-pro-rs-2",
      ];

      for (const r of sampleRoutes) {
        writePage(`/en${r}`, {
          locale: "en",
          extraBody: `<a href="https://www.amazon.com/s?k=test&tag=kbu3986-20" rel="sponsored nofollow noopener">Check Amazon</a>`,
        });
        writePage(`/ko${r}`, {
          locale: "ko",
          extraBody: `<a href="https://www.coupang.com/np/search?q=test&lptag=AF2200875&subid=sm-watt-kr" rel="sponsored nofollow noopener">쿠팡 확인</a>`,
        });
      }

      // ads.txt & robots.txt
      fs.writeFileSync(
        path.join(tmpDist, "ads.txt"),
        "google.com, pub-8587506565277191, DIRECT, f08c47fec0942fa0\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(tmpDist, "robots.txt"),
        `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap-index.xml\n`,
        "utf8"
      );

      // 6 split sitemaps + sitemap-index.xml
      const indexEntries = REQUIRED_SPLIT_SITEMAPS.map(
        (s) => `<sitemap><loc>${siteUrl}/${s.file}</loc></sitemap>`
      ).join("\n");
      fs.writeFileSync(
        path.join(tmpDist, "sitemap-index.xml"),
        `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEntries}\n</sitemapindex>`,
        "utf8"
      );

      const itemSlugByVertical = {
        wattcheck: "anker-prime-27650mah-250w",
        puregram: "maurten-gel-100",
        cyclegear: "favero-assioma-pro-rs-2",
      };
      for (const s of REQUIRED_SPLIT_SITEMAPS) {
        const pageUrl = `${siteUrl}/${s.locale}/${s.vertical}/item/${itemSlugByVertical[s.vertical]}`;
        fs.writeFileSync(
          path.join(tmpDist, s.file),
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${pageUrl}</loc></url></urlset>`,
          "utf8"
        );
      }

      // 1. Passing run (using minCorePages: 9 for the small fixture)
      const passQa = runStage6HtmlQa({ distDir: tmpDist, minCorePages: 9 });
      assert.equal(passQa.overall_passed, true, JSON.stringify(passQa.failures, null, 2));
      assert.equal(passQa.stats.html_files, 9);
      assert.equal(passQa.stats.affiliate_links_checked, 6);

      // 2. Verify resolveInternalHref helper
      assert.equal(resolveInternalHref(tmpDist, "/en/wattcheck/item/anker-prime-27650mah-250w"), true);
      assert.equal(resolveInternalHref(tmpDist, "/en/does-not-exist"), false);
      assert.equal(resolveInternalHref(tmpDist, "/../../etc/passwd"), false);

      // 3. Inject defects: broken internal link, visible NaN, missing JSON-LD, asymmetric hreflang
      writePage("/en/wattcheck/item/anker-prime-27650mah-250w", {
        locale: "en",
        extraBody: `<a href="/en/broken-page">Broken</a><p>Weight: NaN g</p>`,
        includeJsonLd: false,
        omitKoHreflang: true,
      });

      const failQa = runStage6HtmlQa({ distDir: tmpDist, minCorePages: 9 });
      assert.equal(failQa.overall_passed, false);
      const checks = new Set(failQa.failures.map((f) => f.check));
      assert.ok(checks.has("broken_internal_link"));
      assert.ok(checks.has("forbidden_leak_token"));
      assert.ok(checks.has("jsonld_missing_on_content_page"));
      assert.ok(checks.has("hreflang_missing"));
      assert.ok(checks.has("hreflang_asymmetric_backlink"));

      // 4. Verify minCorePages enforcement (default 200 fails when only 9 pages built) & maxTotalFiles cap
      const underCapQa = runStage6HtmlQa({ distDir: tmpDist });
      assert.ok(underCapQa.failures.some((f) => f.check === "min_core_pages"));

      const overCapQa = runStage6HtmlQa({ distDir: tmpDist, minCorePages: 1, maxTotalFiles: 5 });
      assert.ok(overCapQa.failures.some((f) => f.check === "file_count_cap"));

      // 5. Verify extractInternalHrefs ignores <script> JS strings and protocol-relative URLs
      const scriptHtml = `<html><body>
        <script>const html = '<a href="/should-not-be-checked">x</a>';</script>
        <a href="//cdn.example.com/lib.js">CDN</a>
        <a href="/en/about#faq">About</a>
      </body></html>`;
      assert.deepEqual(extractInternalHrefs(scriptHtml), ["/en/about#faq"]);

      // 6. Verify missing ads.txt, robots.txt, and split sitemap are caught
      fs.unlinkSync(path.join(tmpDist, "ads.txt"));
      fs.unlinkSync(path.join(tmpDist, "robots.txt"));
      fs.unlinkSync(path.join(tmpDist, "sitemap-puregram-ko.xml"));
      const missingMetaQa = runStage6HtmlQa({ distDir: tmpDist, minCorePages: 9 });
      const missingChecks = new Set(missingMetaQa.failures.map((f) => f.check));
      assert.ok(missingChecks.has("ads_txt_missing"));
      assert.ok(missingChecks.has("robots_txt_missing"));
      assert.ok(missingChecks.has("split_sitemap_missing"));
    } finally {
      fs.rmSync(tmpDist, { recursive: true, force: true });
    }
  });
});
