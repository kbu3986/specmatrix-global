/**
 * SpecMatrix Global — Client-Side Global Search Index Generator
 * Emits lean `web/dist/search-index.json` (<120 KB) covering SKUs, VS pairs,
 * matrices/compat guides, 30 airlines, and interactive lab tools.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_DIR, "..");
const DIST_DIR = path.join(WEB_DIR, "dist");

const VERTICALS = ["wattcheck", "puregram", "cyclegear", "hometech"];

const CATEGORY_KO = {
  "power-bank": "보조배터리",
  "gan-charger": "GaN 충전기",
  "power-station": "포터블 파워스테이션",
  "energy-gel": "에너지젤",
  electrolyte: "전해질",
  creatine: "크레아틴",
  "carb-mix": "카보 믹스",
  "power-meter": "파워미터",
  "gps-computer": "GPS 사이클링 컴퓨터",
  "smart-trainer": "스마트 트레이너",
  "road-tire": "로드 타이어",
  drivetrain: "전동 구동계",
  minipc: "미니 PC",
  nas: "NAS 서버",
  ups: "UPS 무정전 전원장치",
  "robot-vacuum": "로봇청소기",
};

function readJsonSafe(fullPath, fallback) {
  if (!fs.existsSync(fullPath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    return fallback;
  }
}

function fmtUsd(v) {
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(0)}` : "";
}

function fmtKrw(v) {
  return typeof v === "number" && Number.isFinite(v)
    ? `${new Intl.NumberFormat("ko-KR").format(Math.round(v))}원`
    : "";
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[search-index] dist directory not found: ${DIST_DIR}`);
    process.exit(1);
  }

  const cfg = readJsonSafe(path.join(REPO_ROOT, "config", "monetization-config.v2.json"), {});
  const gate = {
    releaseWaveMax: cfg?.releaseGate?.releaseWaveMax ?? 1,
    minTrustScore: cfg?.releaseGate?.minTrustScore ?? 95,
    minInfoGainScore: cfg?.releaseGate?.minInfoGainScore ?? 75,
    minCitations: cfg?.releaseGate?.minCitations ?? 2,
  };

  const itemsList = [];
  const vsList = [];
  const matricesList = [];
  const airlinesList = [];

  // 1. Interactive Lab Tools
  const toolsList = [
    {
      t: "tool",
      v: "tools",
      en: "Any-vs-Any 1:1 Live Compare Workbench",
      ko: "1:1 실시간 비교 스튜디오 (Any-vs-Any)",
      sub_en: "Compare any 2 verified SKUs with custom weights",
      sub_ko: "4대 버티컬 모든 모델 자유 비교 · 가중치 시뮬레이터",
      k: "compare vs workbench diff simulator 비교 스튜디오",
      p: "/compare/",
    },
    {
      t: "tool",
      v: "tools",
      en: "Interactive Lab Tools Hub",
      ko: "SpecMatrix 인터랙티브 도구 허브",
      sub_en: "All calculators, optimizers & comparison studios",
      sub_ko: "전용 계산기·최적화 스튜디오·항공사 체커 모음",
      k: "tools studio calculators hub 도구 계산기",
      p: "/tools/",
    },
    {
      t: "tool",
      v: "wattcheck",
      en: "Travel Power Kit & 30-Airline Optimizer",
      ko: "해외여행 충전 키트 · 30개 항공사 최적화기",
      sub_en: "Match multi-device wattage + airline Wh/CCC rules",
      sub_ko: "보유 기기 동시 충전 W · 기내반입 조건 맞춤 추천",
      k: "travel power kit flight airline usb-pd gan 여행 보조배터리 키트 기내반입",
      p: "/tools/travel-power-kit/",
    },
    {
      t: "tool",
      v: "puregram",
      en: "Endurance Race Fueling Mix Planner",
      ko: "마라톤·사이클 레이스 보급 조합 플래너",
      sub_en: "Build hourly carb, sodium & caffeine pack plan",
      sub_ko: "시간당 탄수화물·나트륨·카페인 목표 맞춤 보급 계산기",
      k: "fueling planner marathon cycling gel carb sodium caffeine 마라톤 보급 에너지젤",
      p: "/tools/fueling-planner/",
    },
    {
      t: "tool",
      v: "hometech",
      en: "HomeTech 3-Year TCO & UPS Runtime Studio",
      ko: "홈테크 3년 TCO 회수기간 · UPS 정전 런타임 스튜디오",
      sub_en: "Compare 24/7 idle electricity payback & multi-device UPS backup",
      sub_ko: "24시간 대기전력 손익분기점 및 NAS·미니PC UPS 백업 시간 계산",
      k: "hometech tco payback electricity kepco ups runtime nas minipc 전기요금 대기전력 정전 백업",
      p: "/tools/hometech-tco-studio/",
    },
    {
      t: "tool",
      v: "cyclegear",
      en: "Road Tire Pressure & Hookless 5.0 Bar Safety Guard",
      ko: "로드 타이어 공기압 · 후크리스 5.0 bar 안전 가드",
      sub_en: "Front/rear bar & psi calculator with ETRTO TSS rim-width checks",
      sub_ko: "체중·림폭·노면별 앞/뒤 공기압 및 후크리스 72.5 psi 한계 검증",
      k: "tire pressure hookless etrto tss bar psi road cycling tubeless 타이어 공기압 후크리스 튜블리스",
      p: "/tools/tire-pressure-guard/",
    },
  ];

  // 2. SKUs, VS pairs, and Matrices across all 4 verticals
  for (const v of VERTICALS) {
    const itemsDir = path.join(REPO_ROOT, "data", v, "items");
    const validSlugs = new Set();

    if (fs.existsSync(itemsDir)) {
      const files = fs
        .readdirSync(itemsDir)
        .filter((f) => f.endsWith(".json"))
        .sort();

      for (const f of files) {
        const item = readJsonSafe(path.join(itemsDir, f), null);
        if (!item || item.vertical !== v) continue;
        if (item.release_wave > gate.releaseWaveMax) continue;
        if (!item.audit?.adversarial_pass) continue;
        if (item.audit.trust_score < gate.minTrustScore) continue;
        if (item.audit.info_gain_score < gate.minInfoGainScore) continue;
        if (!Array.isArray(item.citations) || item.citations.length < gate.minCitations) continue;

        validSlugs.add(item.slug);
        const enName = item.i18n?.en?.name || item.slug;
        const koName = item.i18n?.ko?.name || enName;
        const catEn = String(item.category || "").replace(/-/g, " ");
        const catKo = CATEGORY_KO[item.category] || catEn;
        const usPrice = fmtUsd(item.regional_offers?.us?.msrp);
        const krPrice = fmtKrw(item.regional_offers?.kr?.msrp);

        itemsList.push({
          t: "sku",
          v,
          en: enName,
          ko: koName,
          sub_en: `${item.brand} · ${catEn}${usPrice ? ` · ${usPrice}` : ""}`,
          sub_ko: `${item.brand} · ${catKo}${krPrice ? ` · ${krPrice}` : ""}`,
          k: [item.brand, item.model_number, item.slug, item.category, v]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          p: `/${v}/item/${item.slug}/`,
        });
      }
    }

    // VS Insights
    const rawVs = readJsonSafe(path.join(REPO_ROOT, "data", v, "vs-insights.json"), []);
    const vsArr = Array.isArray(rawVs)
      ? rawVs
      : rawVs?.pairs || rawVs?.vs || rawVs?.insights || rawVs?.vs_insights || [];
    for (const vs of vsArr) {
      if (!vs || vs.vertical !== v) continue;
      if (vs.release_wave > gate.releaseWaveMax) continue;
      if (vs.info_gain_score < gate.minInfoGainScore) continue;
      if (!validSlugs.has(vs.slug_a) || !validSlugs.has(vs.slug_b)) continue;

      vsList.push({
        t: "vs",
        v,
        en: vs.verdict?.en?.headline || vs.pair_slug,
        ko: vs.verdict?.ko?.headline || vs.verdict?.en?.headline || vs.pair_slug,
        sub_en: `${v.toUpperCase()} 1:1 VS · IG ${vs.info_gain_score}`,
        sub_ko: `${v.toUpperCase()} 1:1 비교 · IG ${vs.info_gain_score}`,
        k: `${vs.pair_slug} ${vs.slug_a} ${vs.slug_b} ${v} vs`.toLowerCase(),
        p: `/${v}/vs/${vs.pair_slug}/`,
      });
    }

    // Matrices & Compat guides
    const rawMat = readJsonSafe(path.join(REPO_ROOT, "data", v, "matrices.json"), []);
    const matArr = Array.isArray(rawMat)
      ? rawMat
      : rawMat?.matrices || rawMat?.pages || rawMat?.matrix_pages || [];
    for (const m of matArr) {
      if (!m || m.vertical !== v) continue;
      if (m.release_wave > gate.releaseWaveMax) continue;

      matricesList.push({
        t: "matrix",
        v,
        en: m.i18n?.en?.title || m.slug,
        ko: m.i18n?.ko?.title || m.i18n?.en?.title || m.slug,
        sub_en: `${v.toUpperCase()} · ${m.archetype === "compat" ? "Compatibility Matrix" : "Filter Matrix"}`,
        sub_ko: `${v.toUpperCase()} · ${m.archetype === "compat" ? "호환성 매트릭스" : "비교 매트릭스"}`,
        k: `${m.slug} ${m.filter_category || ""} ${m.archetype} ${v}`.toLowerCase(),
        p: `/${v}/${m.archetype}/${m.slug}/`,
      });
    }
  }

  // 3. 30 Airlines
  const rawAirlines = readJsonSafe(path.join(REPO_ROOT, "data", "wattcheck", "airlines.json"), []);
  const airlines = Array.isArray(rawAirlines) ? rawAirlines : rawAirlines?.airlines || [];
  for (const a of airlines) {
    if (!a || !a.iata_code) continue;
    airlinesList.push({
      t: "airline",
      v: "wattcheck",
      en: `${a.name_en} (${a.iata_code}) — Battery Rules`,
      ko: `${a.name_ko} (${a.iata_code}) — 기내 보조배터리 규정`,
      sub_en: `<100Wh max ${a.under_100wh_max_pcs} pcs · ${a.region}`,
      sub_ko: `100Wh 이하 최대 ${a.under_100wh_max_pcs}개 · ${a.region}`,
      k: `${a.iata_code} ${a.slug} ${a.name_en} ${a.name_ko} airline flight 항공사 기내`.toLowerCase(),
      p: `/wattcheck/matrix/airlines-30/#${a.iata_code}`,
    });
  }

  const counts = {
    items: itemsList.length,
    vs: vsList.length,
    matrices: matricesList.length,
    airlines: airlinesList.length,
    tools: toolsList.length,
  };
  const totalCount =
    counts.items + counts.vs + counts.matrices + counts.airlines + counts.tools;

  const payload = {
    generated_at: new Date().toISOString().slice(0, 10),
    counts,
    items: itemsList,
    vs: vsList,
    matrices: matricesList,
    airlines: airlinesList,
    tools: toolsList,
  };

  const json = JSON.stringify(payload);
  const outPath = path.join(DIST_DIR, "search-index.json");
  fs.writeFileSync(outPath, json, "utf8");

  const kb = (Buffer.byteLength(json, "utf8") / 1024).toFixed(1);
  console.log(
    `[search-index] Wrote web/dist/search-index.json (${totalCount} entries: ${counts.items} SKUs, ${counts.vs} VS, ${counts.matrices} matrices, ${counts.airlines} airlines, ${counts.tools} tools | ${kb} KB)`
  );
}

main();
