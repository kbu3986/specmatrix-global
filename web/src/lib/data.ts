import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ActiveLocale,
  AirlineRecord,
  AnyItem,
  CycleGearItem,
  FxRates,
  MatrixPage,
  MonetizationConfig,
  PilotVertical,
  PureGramItem,
  VsInsight,
  WattCheckItem,
} from "./types";
import { PILOT_VERTICALS } from "./i18n";

function resolveRepoRoot(): string {
  const candidates: string[] = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(
      path.resolve(here, "../../.."),
      path.resolve(here, "../../../.."),
      path.resolve(here, "../..")
    );
  } catch {
    // ignore
  }
  const cwd = process.cwd();
  candidates.push(cwd, path.resolve(cwd, ".."), path.resolve(cwd, "../.."));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "config", "monetization-config.v2.json"))) {
      return dir;
    }
  }
  return path.resolve(cwd, "..");
}

const REPO_ROOT = resolveRepoRoot();

function readJsonSafe<T>(relPath: string, fallback: T): T {
  const fullPath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

let cachedConfig: MonetizationConfig | null = null;
export function getMonetizationConfig(): MonetizationConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = readJsonSafe<MonetizationConfig>("config/monetization-config.v2.json", {
    schemaVersion: "2.0",
    siteUrl: "https://specmatrix.io",
    siteName: "SpecMatrix Global",
    pricingMode: "msrp_benchmark_mode",
    adsenseId: "ca-pub-8587506565277191",
    adsTxtLine: "google.com, pub-8587506565277191, DIRECT, f08c47fec0942fa0",
    adsenseSlots: {},
    coupang: {
      partnersId: "AF2200875",
      defaultSubId: "ssalmeok-kr",
      redirectUrl: "",
      iframeUrl: "",
      verticalSubIds: {
        wattcheck: "sm-watt-kr",
        puregram: "sm-pure-kr",
        cyclegear: "sm-cycle-kr",
        hometech: "sm-home-kr",
      },
    },
    amazonOneLink: { us: "kbu3986-20" },
    globalAffiliates: {},
    analytics: {
      ga4MeasurementId: "",
      clarityProjectId: "",
      cfBeaconToken: "",
    },
    verification: {
      gsc: "srNR80vNCy3sBgCrxGn_bZLwTPgwsvqmdTxF4arEhw4",
      naver: "8c10763f9e41c812023c31dc42cce3517af9ad25",
      indexNowKey: "",
    },
    releaseGate: {
      activeLocales: ["en", "ko"],
      releaseWaveMax: 1,
      maxPublishedPages: 200,
      quarantineCircuitBreakerPct: 15,
      minTrustScore: 95,
      minInfoGainScore: 75,
      minCitations: 2,
    },
    compliance: {
      euCmpReady: true,
      disclosures: {
        en: "Disclosure: As an Amazon Associate and affiliate partner, SpecMatrix Global earns from qualifying purchases at no extra cost to you. Prices shown are manufacturer MSRP benchmarks; verify live checkout pricing on official stores.",
        ko: "고지: 이 페이지는 쿠팡 파트너스 및 아마존 어소시에이트 등 글로벌 제휴 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. 표기 가격은 제조사 공식 출고가(MSRP) 기준 참고가이며, 실제 결제가는 공식 판매처에서 확인해 주세요.",
      },
    },
    updatedAt: "2026-11-22",
  });
  return cachedConfig;
}

let cachedCoupangDeeplinks: Record<string, string> | null = null;
export function getCoupangDeeplinks(): Record<string, string> {
  if (cachedCoupangDeeplinks) return cachedCoupangDeeplinks;
  const parsed = readJsonSafe<{ links?: Record<string, string> }>(
    "config/coupang-deeplinks.json",
    { links: {} }
  );
  cachedCoupangDeeplinks = parsed.links || {};
  return cachedCoupangDeeplinks;
}

let cachedFx: FxRates | null = null;
export function getFxRates(): FxRates {
  if (cachedFx) return cachedFx;
  cachedFx = readJsonSafe<FxRates>("data/snapshots/fx-rates.json", {
    base: "USD",
    source: "ECB / open.er-api baseline",
    updated_at: "2026-11-22",
    rates: { USD: 1, KRW: 1400, JPY: 154, EUR: 0.94, GBP: 0.79 },
  });
  return cachedFx;
}

const itemsCache = new Map<PilotVertical, AnyItem[]>();

function loadItemsDir<T extends AnyItem>(vertical: PilotVertical): T[] {
  const existing = itemsCache.get(vertical);
  if (existing) return existing as T[];

  const config = getMonetizationConfig();
  const gate = config.releaseGate;
  const dirPath = path.join(REPO_ROOT, "data", vertical, "items");
  if (!fs.existsSync(dirPath)) {
    itemsCache.set(vertical, []);
    return [];
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const list: T[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf-8")) as T;
      if (!parsed || parsed.vertical !== vertical) continue;
      if (parsed.release_wave > gate.releaseWaveMax) continue;
      if (!parsed.audit?.adversarial_pass) continue;
      if (parsed.audit.trust_score < gate.minTrustScore) continue;
      if (parsed.audit.info_gain_score < gate.minInfoGainScore) continue;
      if (!Array.isArray(parsed.citations) || parsed.citations.length < gate.minCitations) continue;
      list.push(parsed);
    } catch {
      // skip invalid file
    }
  }

  itemsCache.set(vertical, list);
  return list;
}

export function getWattCheckItems(): WattCheckItem[] {
  return loadItemsDir<WattCheckItem>("wattcheck");
}

export function getPureGramItems(): PureGramItem[] {
  return loadItemsDir<PureGramItem>("puregram");
}

export function getCycleGearItems(): CycleGearItem[] {
  return loadItemsDir<CycleGearItem>("cyclegear");
}

export function getVerticalItems(vertical: PilotVertical): AnyItem[] {
  return loadItemsDir<AnyItem>(vertical);
}

export function getAllItems(): AnyItem[] {
  return PILOT_VERTICALS.flatMap((v) => getVerticalItems(v));
}

export function getItemBySlug(vertical: PilotVertical, slug: string): AnyItem | null {
  const list = getVerticalItems(vertical);
  return list.find((item) => item.slug === slug) ?? null;
}

let cachedAirlines: AirlineRecord[] | null = null;
export function getAirlines(): AirlineRecord[] {
  if (cachedAirlines) return cachedAirlines;
  const raw = readJsonSafe<AirlineRecord[] | { airlines?: AirlineRecord[] }>(
    "data/wattcheck/airlines.json",
    []
  );
  if (Array.isArray(raw)) {
    cachedAirlines = raw;
  } else if (raw && Array.isArray(raw.airlines)) {
    cachedAirlines = raw.airlines;
  } else {
    cachedAirlines = [];
  }
  return cachedAirlines;
}

const vsCache = new Map<PilotVertical, VsInsight[]>();

export function getVerticalVsInsights(vertical: PilotVertical): VsInsight[] {
  const existing = vsCache.get(vertical);
  if (existing) return existing;

  const config = getMonetizationConfig();
  const gate = config.releaseGate;
  const raw = readJsonSafe<
    VsInsight[] | { pairs?: VsInsight[]; vs?: VsInsight[]; insights?: VsInsight[]; vs_insights?: VsInsight[] }
  >(`data/${vertical}/vs-insights.json`, []);
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.pairs)
      ? raw.pairs
      : Array.isArray(raw?.vs)
        ? raw.vs
        : Array.isArray(raw?.insights)
          ? raw.insights
          : Array.isArray(raw?.vs_insights)
            ? raw.vs_insights
            : [];

  const slugSet = new Set(getVerticalItems(vertical).map((i) => i.slug));
  const valid = arr.filter(
    (entry) =>
      entry &&
      entry.vertical === vertical &&
      entry.release_wave <= gate.releaseWaveMax &&
      entry.info_gain_score >= gate.minInfoGainScore &&
      slugSet.has(entry.slug_a) &&
      slugSet.has(entry.slug_b)
  );
  vsCache.set(vertical, valid);
  return valid;
}

export function getAllVsInsights(): VsInsight[] {
  return PILOT_VERTICALS.flatMap((v) => getVerticalVsInsights(v));
}

export function getRelatedVsForItem(vertical: PilotVertical, slug: string): VsInsight[] {
  return getVerticalVsInsights(vertical).filter(
    (v) => v.slug_a === slug || v.slug_b === slug
  );
}

const matrixCache = new Map<PilotVertical, MatrixPage[]>();

export function getVerticalMatrices(vertical: PilotVertical): MatrixPage[] {
  const existing = matrixCache.get(vertical);
  if (existing) return existing;

  const config = getMonetizationConfig();
  const gate = config.releaseGate;
  const raw = readJsonSafe<
    MatrixPage[] | { matrices?: MatrixPage[]; pages?: MatrixPage[]; matrix_pages?: MatrixPage[] }
  >(`data/${vertical}/matrices.json`, []);
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.matrices)
      ? raw.matrices
      : Array.isArray(raw?.pages)
        ? raw.pages
        : Array.isArray(raw?.matrix_pages)
          ? raw.matrix_pages
          : [];

  const valid = arr.filter(
    (m) => m && m.vertical === vertical && m.release_wave <= gate.releaseWaveMax
  );
  matrixCache.set(vertical, valid);
  return valid;
}

export function getAllMatrices(): MatrixPage[] {
  return PILOT_VERTICALS.flatMap((v) => getVerticalMatrices(v));
}

export function getPrimaryVerticalHref(locale: ActiveLocale, vertical: PilotVertical): string {
  const matrices = getVerticalMatrices(vertical);
  const firstMatrix = matrices.find((m) => m.archetype === "matrix") ?? matrices[0];
  if (firstMatrix) {
    return `/${locale}/${vertical}/${firstMatrix.archetype}/${firstMatrix.slug}`;
  }
  const items = getVerticalItems(vertical);
  if (items.length > 0) {
    return `/${locale}/${vertical}/item/${items[0].slug}`;
  }
  return `/${locale}`;
}

export function getFallbackItems(item: AnyItem, limit = 3): AnyItem[] {
  const vertical = item.vertical as PilotVertical;
  const peers = getVerticalItems(vertical).filter((p) => p.slug !== item.slug);
  const picked: AnyItem[] = [];
  const seen = new Set<string>();

  const preferredSlugs: string[] = [];
  if (item.successor_slug) preferredSlugs.push(item.successor_slug);
  if (Array.isArray(item.auto_fallback_slugs)) {
    preferredSlugs.push(...item.auto_fallback_slugs);
  }

  for (const slug of preferredSlugs) {
    const found = peers.find((p) => p.slug === slug);
    if (found && !seen.has(found.slug)) {
      picked.push(found);
      seen.add(found.slug);
    }
  }

  for (const p of peers) {
    if (picked.length >= limit) break;
    if (p.category === item.category && !seen.has(p.slug)) {
      picked.push(p);
      seen.add(p.slug);
    }
  }

  for (const p of peers) {
    if (picked.length >= limit) break;
    if (!seen.has(p.slug)) {
      picked.push(p);
      seen.add(p.slug);
    }
  }

  return picked.slice(0, limit);
}

export function getItemsForMatrix(matrix: MatrixPage): AnyItem[] {
  const vertical = matrix.vertical as PilotVertical;
  const all = getVerticalItems(vertical);
  if (all.length === 0) return [];

  if (matrix.filter_category) {
    const rawFilter = matrix.filter_category.toLowerCase();
    const tokens = rawFilter
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const byExact = all.filter((item) => tokens.includes(item.category));
    if (byExact.length > 0) return byExact;

    const byKeyword = all.filter((item) => {
      const cat = item.category.toLowerCase();
      if (rawFilter.includes(cat)) return true;
      const parts = cat.split("-");
      return parts.some((p) => p.length >= 3 && rawFilter.includes(p));
    });
    if (byKeyword.length > 0) return byKeyword;
  }

  if (matrix.featured_item_slugs && matrix.featured_item_slugs.length > 0) {
    const featured = matrix.featured_item_slugs
      .map((slug) => all.find((i) => i.slug === slug))
      .filter((i): i is AnyItem => i !== null && i !== undefined);
    if (featured.length > 0 && (matrix.archetype === "compat" || matrix.filter_category !== null)) {
      return featured;
    }
  }

  return all;
}
