import type {
  ActiveLocale,
  AnyItem,
  CycleGearItem,
  DerivedKpiCard,
  FxRates,
  PureGramItem,
  VsDiffResult,
  VsDimensionDef,
  VsMetricRow,
  WattCheckItem,
} from "./types";
import { formatCurrency, formatInt, formatNum } from "./i18n";

export const REFERENCE_DEVICES = [
  { id: "mbp16", name_en: "MacBook Pro 16\"", name_ko: "맥북 프로 16인치", wh: 100.0, max_w: 140 },
  { id: "iphone16pro", name_en: "iPhone 16 Pro", name_ko: "아이폰 16 프로", wh: 13.8, max_w: 30 },
  { id: "s25ultra", name_en: "Galaxy S25 Ultra", name_ko: "갤럭시 S25 울트라", wh: 19.4, max_w: 45 },
  { id: "steamdeck", name_en: "Steam Deck OLED", name_ko: "스팀덱 OLED", wh: 50.0, max_w: 45 },
  { id: "ipadpro13", name_en: "iPad Pro 13\" M4", name_ko: "아이패드 프로 13\"", wh: 39.0, max_w: 38 },
] as const;

export interface WattCheckDerived {
  usableWh: number | null;
  whPer100g: number | null;
  wPer100g: number;
  charges: {
    mbp16: number | null;
    iphone16pro: number | null;
    s25ultra: number | null;
    steamdeck: number | null;
    ipadpro13: number | null;
  };
  usdPer10Wh: number | null;
  krwPer10Wh: number | null;
  usdPer10W: number;
  krwPer10W: number;
  certCount: number;
  maxDualPortW: number;
}

export function computeWattCheckDerived(item: WattCheckItem, _fx: FxRates): WattCheckDerived {
  const s = item.specs;
  const eff = s.conversion_efficiency_pct ?? 82;
  const usableWh =
    s.has_battery && s.battery_energy_wh && s.battery_energy_wh > 0
      ? +(s.battery_energy_wh * (eff / 100)).toFixed(2)
      : null;

  const whPer100g =
    s.has_battery && s.battery_energy_wh && s.weight_g > 0
      ? +((s.battery_energy_wh / s.weight_g) * 100).toFixed(2)
      : null;

  const wPer100g = s.weight_g > 0 ? +((s.max_total_output_w / s.weight_g) * 100).toFixed(2) : 0;

  const charges = {
    mbp16: usableWh ? +(usableWh / 100.0).toFixed(2) : null,
    iphone16pro: usableWh ? +(usableWh / 13.8).toFixed(2) : null,
    s25ultra: usableWh ? +(usableWh / 19.4).toFixed(2) : null,
    steamdeck: usableWh ? +(usableWh / 50.0).toFixed(2) : null,
    ipadpro13: usableWh ? +(usableWh / 39.0).toFixed(2) : null,
  };

  const usMsrp = item.regional_offers.us.msrp;
  const krMsrp = item.regional_offers.kr.msrp;

  const usdPer10Wh =
    s.has_battery && s.battery_energy_wh && s.battery_energy_wh > 0
      ? +(usMsrp / (s.battery_energy_wh / 10)).toFixed(2)
      : null;
  const krwPer10Wh =
    s.has_battery && s.battery_energy_wh && s.battery_energy_wh > 0
      ? Math.round(krMsrp / (s.battery_energy_wh / 10))
      : null;

  const usdPer10W =
    s.max_total_output_w > 0 ? +(usMsrp / (s.max_total_output_w / 10)).toFixed(2) : 0;
  const krwPer10W =
    s.max_total_output_w > 0 ? Math.round(krMsrp / (s.max_total_output_w / 10)) : 0;

  const certCount = [
    s.ul_etl_certified,
    s.ce_certified,
    s.ccc_certified,
    s.pse_certified,
    s.kc_certified,
  ].filter(Boolean).length;

  let maxDualPortW = s.max_single_port_output_w;
  for (const row of s.port_allocation_matrix) {
    if (row.active_ports.length === 2) {
      const sum = Object.values(row.output_w).reduce((acc, w) => acc + w, 0);
      if (sum > maxDualPortW) maxDualPortW = sum;
    }
  }

  return {
    usableWh,
    whPer100g,
    wPer100g,
    charges,
    usdPer10Wh,
    krwPer10Wh,
    usdPer10W,
    krwPer10W,
    certCount,
    maxDualPortW,
  };
}

export interface PureGramDerived {
  totalPureActiveG: number;
  benchmarkUnitsPerPack: number;
  usdPerBenchmarkUnit: number;
  krwPerBenchmarkUnit: number;
  usdPerServing: number;
  krwPerServing: number;
  fillerTaxPct: number;
  servingsFor90gPerHour: number | null;
  raceCost90gPerHourUsd: number | null;
  raceCost90gPerHourKrw: number | null;
}

export function computePureGramDerived(item: PureGramItem, _fx: FxRates): PureGramDerived {
  const pkg = item.package_spec;
  const dm = item.derived_math;
  const nl = item.nutrition_label;

  const totalPureActiveG =
    dm.total_pure_active_g > 0
      ? dm.total_pure_active_g
      : +(nl.active_per_serving_g * pkg.total_servings).toFixed(2);

  const benchmarkUnitsPerPack =
    dm.benchmark_unit_g > 0 ? totalPureActiveG / dm.benchmark_unit_g : pkg.total_servings;

  const usMsrp = item.regional_offers.us.msrp;
  const krMsrp = item.regional_offers.kr.msrp;

  const usdPerBenchmarkUnit =
    benchmarkUnitsPerPack > 0 ? +(usMsrp / benchmarkUnitsPerPack).toFixed(2) : 0;
  const krwPerBenchmarkUnit =
    benchmarkUnitsPerPack > 0 ? Math.round(krMsrp / benchmarkUnitsPerPack) : 0;

  const usdPerServing = pkg.total_servings > 0 ? +(usMsrp / pkg.total_servings).toFixed(2) : 0;
  const krwPerServing = pkg.total_servings > 0 ? Math.round(krMsrp / pkg.total_servings) : 0;

  const fillerTaxPct = +Math.max(0, 100 - dm.purity_pct).toFixed(1);

  const servingsFor90gPerHour =
    dm.servings_for_90g_per_hour ??
    (nl.carbs_g > 0 ? +(90 / nl.carbs_g).toFixed(2) : null);

  const raceCost90gPerHourUsd =
    servingsFor90gPerHour !== null ? +(usdPerServing * servingsFor90gPerHour).toFixed(2) : null;
  const raceCost90gPerHourKrw =
    servingsFor90gPerHour !== null ? Math.round(krwPerServing * servingsFor90gPerHour) : null;

  return {
    totalPureActiveG,
    benchmarkUnitsPerPack: +benchmarkUnitsPerPack.toFixed(2),
    usdPerBenchmarkUnit,
    krwPerBenchmarkUnit,
    usdPerServing,
    krwPerServing,
    fillerTaxPct,
    servingsFor90gPerHour,
    raceCost90gPerHourUsd,
    raceCost90gPerHourKrw,
  };
}

export interface CycleGearDerived {
  usdPer100g: number;
  krwPer100g: number;
  compatBreadthScore: number;
  safetyTier: "HOOKLESS_GUARD" | "TORQUE_SPEC";
  hooklessMaxBar: number | null;
}

export function computeCycleGearDerived(item: CycleGearItem, _fx: FxRates): CycleGearDerived {
  const s = item.specs;
  const cg = item.compatibility_graph;
  const usMsrp = item.regional_offers.us.msrp;
  const krMsrp = item.regional_offers.kr.msrp;

  const usdPer100g = s.weight_g > 0 ? +((usMsrp / s.weight_g) * 100).toFixed(2) : 0;
  const krwPer100g = s.weight_g > 0 ? Math.round((krMsrp / s.weight_g) * 100) : 0;

  const compatBreadthScore =
    (cg.drivetrain_compatible?.length ?? 0) +
    (cg.head_unit_or_app_verified?.length ?? 0) +
    (s.connectivity?.length ?? 0);

  const safetyTier = item.safety_warning.requires_hookless_warning
    ? "HOOKLESS_GUARD"
    : "TORQUE_SPEC";

  const hooklessMaxBar =
    s.hookless_max_psi !== null && s.hookless_max_psi > 0
      ? +(s.hookless_max_psi / 14.5038).toFixed(2)
      : null;

  return {
    usdPer100g,
    krwPer100g,
    compatBreadthScore,
    safetyTier,
    hooklessMaxBar,
  };
}

export function getItemDerivedKpis(
  item: AnyItem,
  fx: FxRates,
  locale: ActiveLocale
): DerivedKpiCard[] {
  if (item.vertical === "wattcheck") {
    const d = computeWattCheckDerived(item, fx);
    const s = item.specs;
    const isKo = locale === "ko";
    const cards: DerivedKpiCard[] = [];

    if (s.has_battery && d.usableWh !== null) {
      cards.push({
        label: isKo ? "실가용 에너지 (변환효율 반영)" : "Real Usable Energy",
        value: `${formatNum(d.usableWh, 1)} Wh`,
        sublabel: isKo
          ? `정격 ${formatNum(s.battery_energy_wh, 2)} Wh × ${s.conversion_efficiency_pct ?? 82}% 효율`
          : `Rated ${formatNum(s.battery_energy_wh, 2)} Wh × ${s.conversion_efficiency_pct ?? 82}% eff.`,
        tone: "info",
      });
      cards.push({
        label: isKo ? "기내 반입 등급 (IATA/국토부)" : "Cabin Flight Status",
        value:
          item.airline_compliance_profile.iata_tier === "under_100wh_no_approval"
            ? isKo
              ? "무승인 기내 가능"
              : "Cabin OK (<100Wh)"
            : item.airline_compliance_profile.iata_tier === "100_to_160wh_approval_required"
              ? isKo
                ? "항공사 승인 필요"
                : "Approval Needed"
              : isKo
                ? "항공 반입 불가"
                : "Flight Prohibited",
        sublabel: isKo
          ? `위탁수하물: ${item.airline_compliance_profile.checked_baggage === "allowed" ? "가능" : "금지"}`
          : `Checked bag: ${item.airline_compliance_profile.checked_baggage}`,
        tone:
          item.airline_compliance_profile.iata_tier === "under_100wh_no_approval"
            ? "pass"
            : item.airline_compliance_profile.iata_tier === "over_160wh_prohibited"
              ? "fail"
              : "caution",
      });
      cards.push({
        label: isKo ? "10 Wh당 기준 단가 (MSRP)" : "Benchmark Cost / 10 Wh",
        value: isKo
          ? formatCurrency(d.krwPer10Wh, "KRW", "ko")
          : formatCurrency(d.usdPer10Wh, "USD", "en"),
        sublabel: isKo
          ? `아이폰 16 프로 약 ${formatNum(d.charges.iphone16pro, 1)}회 완충`
          : `~${formatNum(d.charges.iphone16pro, 1)}× iPhone 16 Pro charges`,
        tone: "default",
      });
      cards.push({
        label: isKo ? "무게당 출력 밀도" : "Power Density",
        value: `${formatNum(d.wPer100g, 1)} W/100g`,
        sublabel: isKo
          ? `에너지 밀도 ${formatNum(d.whPer100g, 1)} Wh/100g (${formatInt(s.weight_g)}g)`
          : `Energy ${formatNum(d.whPer100g, 1)} Wh/100g (${formatInt(s.weight_g)}g)`,
        tone: "default",
      });
    } else {
      cards.push({
        label: isKo ? "최대 출력 밀도" : "Output Power Density",
        value: `${formatNum(d.wPer100g, 1)} W/100g`,
        sublabel: isKo
          ? `총 ${formatInt(s.max_total_output_w)} W / ${formatInt(s.weight_g)} g`
          : `${formatInt(s.max_total_output_w)} W total / ${formatInt(s.weight_g)} g`,
        tone: "info",
      });
      cards.push({
        label: isKo ? "10 W당 기준 단가 (MSRP)" : "Benchmark Cost / 10 W",
        value: isKo
          ? formatCurrency(d.krwPer10W, "KRW", "ko")
          : formatCurrency(d.usdPer10W, "USD", "en"),
        sublabel: isKo
          ? `단일 포트 최대 ${formatInt(s.max_single_port_output_w)} W`
          : `Single-port max ${formatInt(s.max_single_port_output_w)} W`,
        tone: "default",
      });
      cards.push({
        label: isKo ? "기내·위탁 반입" : "Flight Travel Status",
        value: isKo ? "배터리 없음 · 제한 없음" : "No Battery · Always OK",
        sublabel: isKo
          ? `안전인증 ${d.certCount}종 (KC:${s.kc_certified ? "O" : "X"} · PSE:${s.pse_certified ? "O" : "X"})`
          : `${d.certCount} regional certs (UL/CE/KC/PSE/CCC)`,
        tone: "pass",
      });
      cards.push({
        label: isKo ? "멀티포트 순간 단절" : "Port Renegotiation",
        value: s.power_renegotiation_drop
          ? isKo
            ? "단절 발생 (주의)"
            : "Drop Occurs"
          : isKo
            ? "무단절 / 동적 배분"
            : "Seamless / Stable",
        sublabel: isKo
          ? `PD 3.1 EPR: ${s.supports_pd_3_1_epr ? "지원" : "미지원"} · 삼성 PPS 45W: ${s.supports_samsung_pps_45w ? "지원" : "미지원"}`
          : `PD 3.1 EPR: ${s.supports_pd_3_1_epr ? "Yes" : "No"} · PPS 45W: ${s.supports_samsung_pps_45w ? "Yes" : "No"}`,
        tone: s.power_renegotiation_drop ? "caution" : "pass",
      });
    }
    return cards;
  }

  if (item.vertical === "puregram") {
    const d = computePureGramDerived(item, fx);
    const isKo = locale === "ko";
    const benchLabel = isKo
      ? item.derived_math.benchmark_label_ko
      : item.derived_math.benchmark_label_en;

    const cards: DerivedKpiCard[] = [
      {
        label: isKo ? `기준 단가 (${benchLabel})` : `True Cost (${benchLabel})`,
        value: isKo
          ? formatCurrency(d.krwPerBenchmarkUnit, "KRW", "ko")
          : formatCurrency(d.usdPerBenchmarkUnit, "USD", "en"),
        sublabel: isKo
          ? `1회분 ${formatCurrency(d.krwPerServing, "KRW", "ko")} (팩당 ${formatNum(d.benchmarkUnitsPerPack, 1)}단위)`
          : `${formatCurrency(d.usdPerServing, "USD", "en")}/serving (${formatNum(d.benchmarkUnitsPerPack, 1)} units/pack)`,
        tone: "info",
      },
      {
        label: isKo ? "유효성분 순도 (중량비)" : "Active Purity Ratio",
        value: `${formatNum(item.derived_math.purity_pct, 1)}%`,
        sublabel: isKo
          ? `등급 ${item.derived_math.purity_grade} · 비유효 중량(수분/부형제) ${formatNum(d.fillerTaxPct, 1)}%`
          : `Grade ${item.derived_math.purity_grade} · Carrier/water weight ${formatNum(d.fillerTaxPct, 1)}%`,
        tone: item.derived_math.purity_pct >= 70 ? "pass" : "default",
      },
      {
        label:
          d.raceCost90gPerHourUsd !== null
            ? isKo
              ? "시간당 90g 보급 비용"
              : "90g/hr Race Fuel Cost"
            : isKo
              ? "총 순수 유효성분"
              : "Total Pure Active",
        value:
          d.raceCost90gPerHourUsd !== null
            ? isKo
              ? formatCurrency(d.raceCost90gPerHourKrw, "KRW", "ko")
              : formatCurrency(d.raceCost90gPerHourUsd, "USD", "en")
            : `${formatNum(d.totalPureActiveG, 1)} g`,
        sublabel:
          d.servingsFor90gPerHour !== null
            ? isKo
              ? `시간당 ${formatNum(d.servingsFor90gPerHour, 1)}개 필요 (당 비율 ${item.nutrition_label.carb_ratio_glucose_to_fructose ?? "단일"})`
              : `${formatNum(d.servingsFor90gPerHour, 1)} servings/hr (ratio ${item.nutrition_label.carb_ratio_glucose_to_fructose ?? "single"})`
            : isKo
              ? `총 ${formatInt(item.package_spec.total_servings)}회분 × ${formatNum(item.nutrition_label.active_per_serving_g, 1)}g`
              : `${formatInt(item.package_spec.total_servings)} servings × ${formatNum(item.nutrition_label.active_per_serving_g, 1)}g`,
        tone: "default",
      },
      {
        label: isKo ? "나트륨 · 카페인 / 회" : "Sodium & Caffeine / Serving",
        value: `${formatInt(item.nutrition_label.sodium_mg)} mg / ${formatInt(item.nutrition_label.caffeine_mg)} mg`,
        sublabel: isKo
          ? `인증: ${item.certifications.slice(0, 2).join(", ")}`
          : `Certs: ${item.certifications.slice(0, 2).join(", ")}`,
        tone: item.nutrition_label.caffeine_mg > 0 ? "caution" : "pass",
      },
    ];
    return cards;
  }

  // CycleGear
  const d = computeCycleGearDerived(item, fx);
  const s = item.specs;
  const isKo = locale === "ko";
  return [
    {
      label: isKo ? "100g당 기준 단가 (MSRP)" : "Benchmark Cost / 100g",
      value: isKo
        ? formatCurrency(d.krwPer100g, "KRW", "ko")
        : formatCurrency(d.usdPer100g, "USD", "en"),
      sublabel: isKo
        ? `공식 중량 ${formatInt(s.weight_g)} g`
        : `Official weight ${formatInt(s.weight_g)} g`,
      tone: "info",
    },
    {
      label:
        s.claimed_accuracy_pct !== null
          ? isKo
            ? "제조사 공칭 정확도"
            : "Claimed Accuracy"
          : s.battery_life_hours !== null
            ? isKo
              ? "배터리 구동 시간"
              : "Rated Battery Life"
            : s.tire_width_mm !== null
              ? isKo
                ? "후크리스 호환 · 상한"
                : "Hookless Spec"
              : isKo
                ? "구동계 단수"
                : "Drivetrain Speeds",
      value:
        s.claimed_accuracy_pct !== null
          ? `±${formatNum(s.claimed_accuracy_pct, 1)}%`
          : s.battery_life_hours !== null
            ? `${formatInt(s.battery_life_hours)} hr`
            : s.tire_width_mm !== null
              ? s.hookless_compatible
                ? `${formatNum(d.hooklessMaxBar ?? 5.0, 1)} bar (${formatNum(s.hookless_max_psi ?? 72.5, 1)} psi)`
                : isKo
                  ? "후크리스 비권장"
                  : "Hooked Only"
              : s.drivetrain_speeds !== null
                ? `${s.drivetrain_speeds}-Speed`
                : s.mount_or_form_factor,
      sublabel:
        s.left_right_balance !== null
          ? isKo
            ? `좌우 밸런스: ${s.left_right_balance ? "독립 계측 지원" : "단측 추정"}`
            : `L/R Balance: ${s.left_right_balance ? "Dual Independent" : "Single-Sided"}`
          : s.max_trainer_watts !== null
            ? isKo
              ? `최대 ${formatInt(s.max_trainer_watts)} W · 경사도 ${formatNum(s.max_trainer_grade_pct, 0)}%`
              : `Max ${formatInt(s.max_trainer_watts)} W · ${formatNum(s.max_trainer_grade_pct, 0)}% grade`
            : s.mount_or_form_factor,
      tone: s.hookless_compatible === false ? "caution" : "pass",
    },
    {
      label: isKo ? "생태계 호환 지수" : "Ecosystem Breadth",
      value: `${d.compatBreadthScore} pts`,
      sublabel: isKo
        ? `통신 ${s.connectivity.slice(0, 3).join(" · ") || "기계식"}`
        : `${s.connectivity.slice(0, 3).join(" · ") || "Mechanical"}`,
      tone: "default",
    },
    {
      label: isKo ? "안전 검증 등급" : "Safety Gate",
      value:
        d.safetyTier === "HOOKLESS_GUARD"
          ? isKo
            ? "후크리스 5 bar 경고"
            : "Hookless 5 bar Guard"
          : isKo
            ? "토크 규격 필수 확인"
            : "Torque Spec Required",
      sublabel: isKo
        ? `규격: ${item.compatibility_graph.bb_or_mount_standard}`
        : `Mount: ${item.compatibility_graph.bb_or_mount_standard}`,
      tone: d.safetyTier === "HOOKLESS_GUARD" ? "caution" : "default",
    },
  ];
}

function makeMetricRow(opts: {
  key: string;
  label: string;
  unit: string;
  rawA: number | null;
  rawB: number | null;
  displayA: string;
  displayB: string;
  higherIsBetter: boolean;
  locale: ActiveLocale;
  formatDelta?: (diff: number) => string;
}): VsMetricRow {
  const { key, label, unit, rawA, rawB, displayA, displayB, higherIsBetter, locale, formatDelta } =
    opts;
  let winner: "a" | "b" | "tie" | "neutral" = "neutral";
  let deltaText = "—";
  let barPctA = 50;
  let barPctB = 50;

  if (rawA !== null && rawB !== null && Number.isFinite(rawA) && Number.isFinite(rawB)) {
    const maxVal = Math.max(Math.abs(rawA), Math.abs(rawB), 0.0001);
    barPctA = Math.max(8, Math.min(100, Math.round((Math.abs(rawA) / maxVal) * 100)));
    barPctB = Math.max(8, Math.min(100, Math.round((Math.abs(rawB) / maxVal) * 100)));

    const diff = rawA - rawB;
    if (Math.abs(diff) < 0.005) {
      winner = "tie";
      deltaText = locale === "ko" ? "동일" : "Tie";
    } else {
      const aWins = higherIsBetter ? diff > 0 : diff < 0;
      winner = aWins ? "a" : "b";
      const absDiff = Math.abs(diff);
      const formatted = formatDelta ? formatDelta(absDiff) : `${formatNum(absDiff, 1)}${unit ? ` ${unit}` : ""}`;
      if (locale === "ko") {
        deltaText = aWins ? `A 우세 (${formatted})` : `B 우세 (${formatted})`;
      } else {
        deltaText = aWins ? `A leads by ${formatted}` : `B leads by ${formatted}`;
      }
    }
  }

  return {
    key,
    label,
    unit,
    rawA,
    rawB,
    displayA,
    displayB,
    deltaText,
    winner,
    barPctA,
    barPctB,
    higherIsBetter,
  };
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(15, Math.min(100, Math.round(v)));
}

function pairRelativeScores(
  a: number,
  b: number,
  higherIsBetter: boolean
): [number, number] {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [50, 50];
  if (Math.abs(a - b) < 0.0001) return [80, 80];
  const maxV = Math.max(a, b, 0.0001);
  const minV = Math.min(a, b);
  if (higherIsBetter) {
    return [
      clampScore((a / maxV) * 95),
      clampScore((b / maxV) * 95),
    ];
  }
  return [
    clampScore((minV / Math.max(a, 0.0001)) * 95),
    clampScore((minV / Math.max(b, 0.0001)) * 95),
  ];
}

export function computeVsDiff(
  itemA: AnyItem,
  itemB: AnyItem,
  fx: FxRates,
  locale: ActiveLocale
): VsDiffResult {
  const isKo = locale === "ko";
  const rows: VsMetricRow[] = [];

  const priceA = isKo ? itemA.regional_offers.kr.msrp : itemA.regional_offers.us.msrp;
  const priceB = isKo ? itemB.regional_offers.kr.msrp : itemB.regional_offers.us.msrp;
  const currency = isKo ? "KRW" : "USD";

  rows.push(
    makeMetricRow({
      key: "msrp",
      label: isKo ? "MSRP 참고가" : "MSRP Reference",
      unit: currency,
      rawA: priceA,
      rawB: priceB,
      displayA: formatCurrency(priceA, currency, locale),
      displayB: formatCurrency(priceB, currency, locale),
      higherIsBetter: false,
      locale,
      formatDelta: (d) => formatCurrency(d, currency, locale),
    })
  );

  if (itemA.vertical === "wattcheck" && itemB.vertical === "wattcheck") {
    const dA = computeWattCheckDerived(itemA, fx);
    const dB = computeWattCheckDerived(itemB, fx);
    const sA = itemA.specs;
    const sB = itemB.specs;

    rows.push(
      makeMetricRow({
        key: "max_total_output_w",
        label: isKo ? "최대 합산 출력" : "Max Total Output",
        unit: "W",
        rawA: sA.max_total_output_w,
        rawB: sB.max_total_output_w,
        displayA: `${formatInt(sA.max_total_output_w)} W`,
        displayB: `${formatInt(sB.max_total_output_w)} W`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)} W`,
      }),
      makeMetricRow({
        key: "max_single_port_output_w",
        label: isKo ? "단일 포트 최대 출력" : "Max Single-Port Output",
        unit: "W",
        rawA: sA.max_single_port_output_w,
        rawB: sB.max_single_port_output_w,
        displayA: `${formatInt(sA.max_single_port_output_w)} W`,
        displayB: `${formatInt(sB.max_single_port_output_w)} W`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)} W`,
      })
    );

    if (sA.has_battery && sB.has_battery) {
      rows.push(
        makeMetricRow({
          key: "battery_energy_wh",
          label: isKo ? "정격 에너지 (Wh)" : "Rated Energy (Wh)",
          unit: "Wh",
          rawA: sA.battery_energy_wh,
          rawB: sB.battery_energy_wh,
          displayA: `${formatNum(sA.battery_energy_wh, 2)} Wh`,
          displayB: `${formatNum(sB.battery_energy_wh, 2)} Wh`,
          higherIsBetter: true,
          locale,
        }),
        makeMetricRow({
          key: "usable_wh",
          label: isKo ? "실가용 에너지 (변환효율 반영)" : "Real Usable Energy",
          unit: "Wh",
          rawA: dA.usableWh,
          rawB: dB.usableWh,
          displayA: `${formatNum(dA.usableWh, 1)} Wh`,
          displayB: `${formatNum(dB.usableWh, 1)} Wh`,
          higherIsBetter: true,
          locale,
        }),
        makeMetricRow({
          key: "cost_per_10wh",
          label: isKo ? "10 Wh당 기준 단가" : "Cost per 10 Wh",
          unit: currency,
          rawA: isKo ? dA.krwPer10Wh : dA.usdPer10Wh,
          rawB: isKo ? dB.krwPer10Wh : dB.usdPer10Wh,
          displayA: formatCurrency(isKo ? dA.krwPer10Wh : dA.usdPer10Wh, currency, locale),
          displayB: formatCurrency(isKo ? dB.krwPer10Wh : dB.usdPer10Wh, currency, locale),
          higherIsBetter: false,
          locale,
          formatDelta: (d) => formatCurrency(d, currency, locale),
        })
      );
    } else {
      rows.push(
        makeMetricRow({
          key: "cost_per_10w",
          label: isKo ? "10 W당 기준 단가" : "Cost per 10 W",
          unit: currency,
          rawA: isKo ? dA.krwPer10W : dA.usdPer10W,
          rawB: isKo ? dB.krwPer10W : dB.usdPer10W,
          displayA: formatCurrency(isKo ? dA.krwPer10W : dA.usdPer10W, currency, locale),
          displayB: formatCurrency(isKo ? dB.krwPer10W : dB.usdPer10W, currency, locale),
          higherIsBetter: false,
          locale,
          formatDelta: (d) => formatCurrency(d, currency, locale),
        })
      );
    }

    rows.push(
      makeMetricRow({
        key: "weight_g",
        label: isKo ? "본체 무게 (경량 우세)" : "Weight (Lighter Wins)",
        unit: "g",
        rawA: sA.weight_g,
        rawB: sB.weight_g,
        displayA: `${formatInt(sA.weight_g)} g`,
        displayB: `${formatInt(sB.weight_g)} g`,
        higherIsBetter: false,
        locale,
        formatDelta: (d) => `${formatInt(d)} g`,
      }),
      makeMetricRow({
        key: "w_per_100g",
        label: isKo ? "출력 밀도 (W/100g)" : "Power Density (W/100g)",
        unit: "W/100g",
        rawA: dA.wPer100g,
        rawB: dB.wPer100g,
        displayA: `${formatNum(dA.wPer100g, 1)} W/100g`,
        displayB: `${formatNum(dB.wPer100g, 1)} W/100g`,
        higherIsBetter: true,
        locale,
      }),
      makeMetricRow({
        key: "ports",
        label: isKo ? "출력 포트 수" : "Output Ports",
        unit: isKo ? "개" : "ports",
        rawA: sA.ports.length,
        rawB: sB.ports.length,
        displayA: `${sA.ports.length}`,
        displayB: `${sB.ports.length}`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)}`,
      })
    );

    const [valA, valB] = pairRelativeScores(
      sA.has_battery && dA.usdPer10Wh && dB.usdPer10Wh ? dA.usdPer10Wh : dA.usdPer10W,
      sB.has_battery && dA.usdPer10Wh && dB.usdPer10Wh ? dB.usdPer10Wh : dB.usdPer10W,
      false
    );
    const [portA, portB] = pairRelativeScores(sA.weight_g, sB.weight_g, false);
    const [perfA, perfB] = pairRelativeScores(
      sA.max_total_output_w + sA.max_single_port_output_w + (dA.usableWh ?? 0),
      sB.max_total_output_w + sB.max_single_port_output_w + (dB.usableWh ?? 0),
      true
    );
    const pracScoreRaw = (it: WattCheckItem, d: WattCheckDerived) =>
      d.certCount * 12 +
      it.specs.ports.length * 8 +
      (it.specs.supports_pd_3_1_epr ? 12 : 0) +
      (it.specs.supports_samsung_pps_45w ? 10 : 0) +
      (!it.specs.power_renegotiation_drop ? 12 : 0) +
      (it.airline_compliance_profile.carryon_no_approval ? 15 : 0);
    const [pracA, pracB] = pairRelativeScores(pracScoreRaw(itemA, dA), pracScoreRaw(itemB, dB), true);

    const dimensions: VsDimensionDef[] = [
      {
        id: "value",
        label: isKo ? "가성비 (Wh·W당 단가)" : "Value (Cost / Wh or W)",
        hint: isKo ? "동일 출력·용량 대비 지출 최소화" : "Lower MSRP per Wh or W",
        defaultWeight: 30,
      },
      {
        id: "portability",
        label: isKo ? "휴대성·경량" : "Weight & Portability",
        hint: isKo ? "출장·여행 가방 무게 절감" : "Lighter carry weight",
        defaultWeight: 25,
      },
      {
        id: "performance",
        label: isKo ? "출력·용량 성능" : "Output & Energy Performance",
        hint: isKo ? "노트북 고속충전·실가용 Wh 우선" : "Peak W, EPR & usable Wh",
        defaultWeight: 25,
      },
      {
        id: "practicality",
        label: isKo ? "안전인증·기내·멀티포트 실용성" : "Flight, Certs & Practicality",
        hint: isKo ? "기내 무승인·KC/PSE·무단절·포트 수" : "Cabin OK, certs, seamless PD",
        defaultWeight: 20,
      },
    ];

    return {
      rows,
      scoresA: { value: valA, portability: portA, performance: perfA, practicality: pracA },
      scoresB: { value: valB, portability: portB, performance: perfB, practicality: pracB },
      dimensions,
    };
  }

  if (itemA.vertical === "puregram" && itemB.vertical === "puregram") {
    const dA = computePureGramDerived(itemA, fx);
    const dB = computePureGramDerived(itemB, fx);
    const nlA = itemA.nutrition_label;
    const nlB = itemB.nutrition_label;

    rows.push(
      makeMetricRow({
        key: "cost_per_benchmark",
        label: isKo
          ? `순수 유효성분 기준 단가 (${itemA.derived_math.benchmark_label_ko})`
          : `Cost per Benchmark (${itemA.derived_math.benchmark_label_en})`,
        unit: currency,
        rawA: isKo ? dA.krwPerBenchmarkUnit : dA.usdPerBenchmarkUnit,
        rawB: isKo ? dB.krwPerBenchmarkUnit : dB.usdPerBenchmarkUnit,
        displayA: formatCurrency(isKo ? dA.krwPerBenchmarkUnit : dA.usdPerBenchmarkUnit, currency, locale),
        displayB: formatCurrency(isKo ? dB.krwPerBenchmarkUnit : dB.usdPerBenchmarkUnit, currency, locale),
        higherIsBetter: false,
        locale,
        formatDelta: (d) => formatCurrency(d, currency, locale),
      }),
      makeMetricRow({
        key: "purity_pct",
        label: isKo ? "유효성분 순도 (%)" : "Active Purity (%)",
        unit: "%",
        rawA: itemA.derived_math.purity_pct,
        rawB: itemB.derived_math.purity_pct,
        displayA: `${formatNum(itemA.derived_math.purity_pct, 1)}%`,
        displayB: `${formatNum(itemB.derived_math.purity_pct, 1)}%`,
        higherIsBetter: true,
        locale,
      }),
      makeMetricRow({
        key: "active_per_serving",
        label: isKo ? "1회 제공량당 유효성분" : "Active per Serving",
        unit: "g",
        rawA: nlA.active_per_serving_g,
        rawB: nlB.active_per_serving_g,
        displayA: `${formatNum(nlA.active_per_serving_g, 1)} g`,
        displayB: `${formatNum(nlB.active_per_serving_g, 1)} g`,
        higherIsBetter: true,
        locale,
      }),
      makeMetricRow({
        key: "cost_per_serving",
        label: isKo ? "1회분 기준 단가" : "Cost per Serving",
        unit: currency,
        rawA: isKo ? dA.krwPerServing : dA.usdPerServing,
        rawB: isKo ? dB.krwPerServing : dB.usdPerServing,
        displayA: formatCurrency(isKo ? dA.krwPerServing : dA.usdPerServing, currency, locale),
        displayB: formatCurrency(isKo ? dB.krwPerServing : dB.usdPerServing, currency, locale),
        higherIsBetter: false,
        locale,
        formatDelta: (d) => formatCurrency(d, currency, locale),
      }),
      makeMetricRow({
        key: "sodium_mg",
        label: isKo ? "나트륨 함량 / 회" : "Sodium per Serving",
        unit: "mg",
        rawA: nlA.sodium_mg,
        rawB: nlB.sodium_mg,
        displayA: `${formatInt(nlA.sodium_mg)} mg`,
        displayB: `${formatInt(nlB.sodium_mg)} mg`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)} mg`,
      }),
      makeMetricRow({
        key: "servings",
        label: isKo ? "패키지 총 서빙 수" : "Total Servings / Pack",
        unit: isKo ? "회" : "servings",
        rawA: itemA.package_spec.total_servings,
        rawB: itemB.package_spec.total_servings,
        displayA: `${formatInt(itemA.package_spec.total_servings)}`,
        displayB: `${formatInt(itemB.package_spec.total_servings)}`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)}`,
      })
    );

    if (dA.raceCost90gPerHourUsd !== null && dB.raceCost90gPerHourUsd !== null) {
      rows.push(
        makeMetricRow({
          key: "race_90g_cost",
          label: isKo ? "시간당 90g 레이스 보급비" : "90g/hr Race Fueling Cost",
          unit: currency,
          rawA: isKo ? dA.raceCost90gPerHourKrw : dA.raceCost90gPerHourUsd,
          rawB: isKo ? dB.raceCost90gPerHourKrw : dB.raceCost90gPerHourUsd,
          displayA: formatCurrency(isKo ? dA.raceCost90gPerHourKrw : dA.raceCost90gPerHourUsd, currency, locale),
          displayB: formatCurrency(isKo ? dB.raceCost90gPerHourKrw : dB.raceCost90gPerHourUsd, currency, locale),
          higherIsBetter: false,
          locale,
          formatDelta: (d) => formatCurrency(d, currency, locale),
        })
      );
    }

    const [valA, valB] = pairRelativeScores(dA.usdPerBenchmarkUnit, dB.usdPerBenchmarkUnit, false);
    const [portA, portB] = pairRelativeScores(
      itemA.derived_math.purity_pct,
      itemB.derived_math.purity_pct,
      true
    );
    const perfRaw = (it: PureGramItem) =>
      it.nutrition_label.active_per_serving_g * 2 +
      (it.nutrition_label.carb_ratio_glucose_to_fructose === "1:0.8" ? 18 : 6) +
      (it.nutrition_label.hydrogel_or_isotonic === "hydrogel"
        ? 16
        : it.nutrition_label.hydrogel_or_isotonic === "isotonic"
          ? 12
          : 4) +
      (it.nutrition_label.creapure_certified ? 20 : 0) +
      Math.min(20, it.nutrition_label.sodium_mg / 50);
    const [perfA, perfB] = pairRelativeScores(perfRaw(itemA), perfRaw(itemB), true);
    const pracRaw = (it: PureGramItem) =>
      it.certifications.length * 14 +
      (!it.nutrition_label.artificial_sweeteners_listed ? 16 : 0) +
      (!it.nutrition_label.free_form_amino_listed ? 12 : 0) +
      Math.min(20, it.package_spec.total_servings);
    const [pracA, pracB] = pairRelativeScores(pracRaw(itemA), pracRaw(itemB), true);

    const dimensions: VsDimensionDef[] = [
      {
        id: "value",
        label: isKo ? "순수 유효성분 가성비" : "Value (Cost / Pure Active)",
        hint: isKo ? "기준 단위당 실질 비용 절감" : "Lowest true cost per benchmark unit",
        defaultWeight: 35,
      },
      {
        id: "portability",
        label: isKo ? "순도·저필러 밀도" : "Purity & Concentration",
        hint: isKo ? "불필요한 부형제·중량 최소화" : "Higher active-to-serving weight ratio",
        defaultWeight: 20,
      },
      {
        id: "performance",
        label: isKo ? "보급 효율·배합 설계" : "Fueling & Formulation",
        hint: isKo ? "1:0.8 비율·하이드로젤·나트륨/Creapure" : "Carb ratio, hydrogel, electrolytes, Creapure",
        defaultWeight: 25,
      },
      {
        id: "practicality",
        label: isKo ? "안티도핑 인증·클린 라벨" : "Certifications & Clean Label",
        hint: isKo ? "Informed Sport·무인공감미료·보관 편의" : "Third-party testing & clean excipients",
        defaultWeight: 20,
      },
    ];

    return {
      rows,
      scoresA: { value: valA, portability: portA, performance: perfA, practicality: pracA },
      scoresB: { value: valB, portability: portB, performance: perfB, practicality: pracB },
      dimensions,
    };
  }

  // CycleGear
  const cgA = itemA as CycleGearItem;
  const cgB = itemB as CycleGearItem;
  const dA = computeCycleGearDerived(cgA, fx);
  const dB = computeCycleGearDerived(cgB, fx);
  const sA = cgA.specs;
  const sB = cgB.specs;

  rows.push(
    makeMetricRow({
      key: "weight_g",
      label: isKo ? "공식 중량 (경량 우세)" : "Official Weight (Lighter Wins)",
      unit: "g",
      rawA: sA.weight_g,
      rawB: sB.weight_g,
      displayA: `${formatInt(sA.weight_g)} g`,
      displayB: `${formatInt(sB.weight_g)} g`,
      higherIsBetter: false,
      locale,
      formatDelta: (d) => `${formatInt(d)} g`,
    }),
    makeMetricRow({
      key: "cost_per_100g",
      label: isKo ? "100g당 기준 단가" : "Cost per 100g",
      unit: currency,
      rawA: isKo ? dA.krwPer100g : dA.usdPer100g,
      rawB: isKo ? dB.krwPer100g : dB.usdPer100g,
      displayA: formatCurrency(isKo ? dA.krwPer100g : dA.usdPer100g, currency, locale),
      displayB: formatCurrency(isKo ? dB.krwPer100g : dB.usdPer100g, currency, locale),
      higherIsBetter: false,
      locale,
      formatDelta: (d) => formatCurrency(d, currency, locale),
    })
  );

  if (sA.claimed_accuracy_pct !== null && sB.claimed_accuracy_pct !== null) {
    rows.push(
      makeMetricRow({
        key: "accuracy",
        label: isKo ? "공칭 정확도 오차 (낮을수록 우세)" : "Accuracy Error (Lower Wins)",
        unit: "%",
        rawA: sA.claimed_accuracy_pct,
        rawB: sB.claimed_accuracy_pct,
        displayA: `±${formatNum(sA.claimed_accuracy_pct, 1)}%`,
        displayB: `±${formatNum(sB.claimed_accuracy_pct, 1)}%`,
        higherIsBetter: false,
        locale,
      })
    );
  }

  if (sA.battery_life_hours !== null && sB.battery_life_hours !== null) {
    rows.push(
      makeMetricRow({
        key: "battery_life_hours",
        label: isKo ? "배터리 구동 시간" : "Battery Life",
        unit: "hr",
        rawA: sA.battery_life_hours,
        rawB: sB.battery_life_hours,
        displayA: `${formatInt(sA.battery_life_hours)} hr`,
        displayB: `${formatInt(sB.battery_life_hours)} hr`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)} hr`,
      })
    );
  }

  if (sA.max_trainer_watts !== null && sB.max_trainer_watts !== null) {
    rows.push(
      makeMetricRow({
        key: "max_trainer_watts",
        label: isKo ? "최대 부하 출력" : "Max Resistance Output",
        unit: "W",
        rawA: sA.max_trainer_watts,
        rawB: sB.max_trainer_watts,
        displayA: `${formatInt(sA.max_trainer_watts)} W`,
        displayB: `${formatInt(sB.max_trainer_watts)} W`,
        higherIsBetter: true,
        locale,
        formatDelta: (d) => `${formatInt(d)} W`,
      })
    );
  }

  rows.push(
    makeMetricRow({
      key: "compat_breadth",
      label: isKo ? "생태계 호환 지수" : "Ecosystem Compatibility Score",
      unit: "pts",
      rawA: dA.compatBreadthScore,
      rawB: dB.compatBreadthScore,
      displayA: `${dA.compatBreadthScore} pts`,
      displayB: `${dB.compatBreadthScore} pts`,
      higherIsBetter: true,
      locale,
      formatDelta: (d) => `${formatInt(d)} pts`,
    })
  );

  const [valA, valB] = pairRelativeScores(
    cgA.regional_offers.us.msrp,
    cgB.regional_offers.us.msrp,
    false
  );
  const [portA, portB] = pairRelativeScores(sA.weight_g, sB.weight_g, false);
  const perfRaw = (it: CycleGearItem) =>
    (it.specs.claimed_accuracy_pct !== null ? (3.5 - it.specs.claimed_accuracy_pct) * 25 : 40) +
    (it.specs.left_right_balance ? 18 : 0) +
    (it.specs.battery_life_hours ? Math.min(35, it.specs.battery_life_hours / 3) : 0) +
    (it.specs.max_trainer_watts ? it.specs.max_trainer_watts / 60 : 0) +
    (it.specs.hookless_compatible ? 15 : 0);
  const [perfA, perfB] = pairRelativeScores(perfRaw(cgA), perfRaw(cgB), true);
  const [pracA, pracB] = pairRelativeScores(dA.compatBreadthScore, dB.compatBreadthScore, true);

  const dimensions: VsDimensionDef[] = [
    {
      id: "value",
      label: isKo ? "가성비 (MSRP 기준)" : "Value (MSRP Benchmark)",
      hint: isKo ? "초기 장비 도입 비용 절감" : "Lower upfront MSRP",
      defaultWeight: 30,
    },
    {
      id: "portability",
      label: isKo ? "경량성 (g)" : "Weight Savings (g)",
      hint: isKo ? "업힐·레이스 경량화 우선" : "Lighter component mass",
      defaultWeight: 25,
    },
    {
      id: "performance",
      label: isKo ? "정밀도·배터리·성능" : "Precision & Performance",
      hint: isKo ? "오차율·좌우밸런스·배터리·최대부하" : "Accuracy, L/R balance, battery, watts",
      defaultWeight: 25,
    },
    {
      id: "practicality",
      label: isKo ? "호환성·생태계 확장성" : "Ecosystem Compatibility",
      hint: isKo ? "구동계·BB·헤드유닛 호환 범위" : "Drivetrain, BB, head-unit support",
      defaultWeight: 20,
    },
  ];

  return {
    rows,
    scoresA: { value: valA, portability: portA, performance: perfA, practicality: pracA },
    scoresB: { value: valB, portability: portB, performance: perfB, practicality: pracB },
    dimensions,
  };
}
