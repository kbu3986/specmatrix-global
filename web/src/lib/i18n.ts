import type { ActiveLocale, PilotVertical, LegalSlug } from "./types";

const RAW_BASE = (
  (typeof process !== "undefined" && process.env?.PUBLIC_BASE_PATH) ||
  ""
).trim();

export const BASE_PATH =
  RAW_BASE && RAW_BASE !== "/"
    ? `/${RAW_BASE.replace(/^\/+|\/+$/g, "")}`
    : "";

const RAW_SITE_URL = (
  (typeof process !== "undefined" && process.env?.PUBLIC_SITE_URL) ||
  "https://specmatrix.io"
)
  .trim()
  .replace(/\/+$/, "");

export const SITE_URL =
  BASE_PATH && !RAW_SITE_URL.endsWith(BASE_PATH)
    ? `${RAW_SITE_URL}${BASE_PATH}`
    : RAW_SITE_URL;

const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|ico|xml|json|txt|html?|css|m?js|map|pdf|woff2?|ttf|eot|webmanifest|csv)$/i;

function stripBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length) || "/";
  }
  if (pathname.startsWith(`${BASE_PATH}?`) || pathname.startsWith(`${BASE_PATH}#`)) {
    return `/${pathname.slice(BASE_PATH.length)}`;
  }
  return pathname;
}

export function withBase(pathname: string): string {
  const norm = normalizePath(pathname);
  if (!BASE_PATH) return norm;
  if (
    norm === BASE_PATH ||
    norm.startsWith(`${BASE_PATH}/`) ||
    norm.startsWith(`${BASE_PATH}?`) ||
    norm.startsWith(`${BASE_PATH}#`)
  ) {
    return norm;
  }
  return `${BASE_PATH}${norm}`;
}
export const ACTIVE_LOCALES: ActiveLocale[] = ["en", "ko"];
export const PILOT_VERTICALS: PilotVertical[] = [
  "wattcheck",
  "puregram",
  "cyclegear",
  "hometech",
];
export const LEGAL_SLUGS: LegalSlug[] = [
  "about",
  "methodology",
  "disclaimer",
  "privacy",
  "contact",
];

export interface VerticalMeta {
  id: PilotVertical;
  name: Record<ActiveLocale, string>;
  shortName: Record<ActiveLocale, string>;
  tagline: Record<ActiveLocale, string>;
  accentClass: string;
  badgeBgClass: string;
}

export const VERTICAL_META: Record<PilotVertical, VerticalMeta> = {
  wattcheck: {
    id: "wattcheck",
    name: {
      en: "WattCheck Matrix",
      ko: "WattCheck 전력·기내 매트릭스",
    },
    shortName: {
      en: "WattCheck",
      ko: "WattCheck",
    },
    tagline: {
      en: "Power banks, GaN chargers, USB-PD multi-port allocation & 30-airline flight rules",
      ko: "보조배터리·GaN 충전기·USB-PD 멀티포트 출력 분배 및 30개 항공사 기내반입 검증",
    },
    accentClass: "text-sky-300",
    badgeBgClass: "bg-[#0f1f30] text-sky-200 border-sky-700/60",
  },
  puregram: {
    id: "puregram",
    name: {
      en: "PureGram Matrix",
      ko: "PureGram 성분·실단가 매트릭스",
    },
    shortName: {
      en: "PureGram",
      ko: "PureGram",
    },
    tagline: {
      en: "Endurance energy gels, electrolytes & creatine true active cost per benchmark gram",
      ko: "에너지젤·전해질·크레아틴 영양성분표 기반 순수 유효성분 실단가·필러율 분석",
    },
    accentClass: "text-emerald-300",
    badgeBgClass: "bg-[#0d261a] text-emerald-200 border-emerald-700/60",
  },
  cyclegear: {
    id: "cyclegear",
    name: {
      en: "CycleGear Matrix",
      ko: "CycleGear 로드사이클 매트릭스",
    },
    shortName: {
      en: "CycleGear",
      ko: "CycleGear",
    },
    tagline: {
      en: "Power meters, GPS computers, smart trainers, road tires & hookless compatibility",
      ko: "파워미터·GPS 사이클링 컴퓨터·스마트 트레이너·로드 타이어 후크리스 호환성 검증",
    },
    accentClass: "text-amber-300",
    badgeBgClass: "bg-[#291e09] text-amber-200 border-amber-700/60",
  },
  hometech: {
    id: "hometech",
    name: {
      en: "HomeTech TCO Matrix",
      ko: "HomeTech 전력·유지비 TCO 매트릭스",
    },
    shortName: {
      en: "HomeTech",
      ko: "HomeTech",
    },
    tagline: {
      en: "Mini PCs, NAS, pure-sine UPS & robot vacuums audited for 24/7 power draw & 3-year TCO",
      ko: "미니PC·NAS·UPS·로봇청소기 24시간 대기전력·한전 누진제 전기요금·3년 총소유비용(TCO) 검증",
    },
    accentClass: "text-teal-300",
    badgeBgClass: "bg-[#0b2626] text-teal-200 border-teal-700/60",
  },
};

export const CATEGORY_LABELS: Record<string, Record<ActiveLocale, string>> = {
  "power-bank": { en: "Power Bank", ko: "보조배터리" },
  "gan-charger": { en: "GaN Charger", ko: "GaN 충전기" },
  "power-station": { en: "Portable Power Station", ko: "포터블 파워스테이션" },
  "energy-gel": { en: "Energy Gel", ko: "에너지젤" },
  electrolyte: { en: "Electrolyte Mix", ko: "전해질 파우더·타블렛" },
  creatine: { en: "Creatine Monohydrate", ko: "크레아틴 모노하이드레이트" },
  "carb-mix": { en: "Endurance Carb Mix", ko: "지구력 카보 믹스" },
  "power-meter": { en: "Power Meter", ko: "파워미터" },
  "gps-computer": { en: "GPS Bike Computer", ko: "GPS 사이클링 컴퓨터" },
  "smart-trainer": { en: "Smart Trainer", ko: "스마트 트레이너" },
  "road-tire": { en: "Road Tubeless Tire", ko: "로드 튜블리스 타이어" },
  drivetrain: { en: "Electronic Drivetrain", ko: "전동 구동계" },
  minipc: { en: "Mini PC", ko: "미니 PC" },
  nas: { en: "NAS Server", ko: "NAS 서버" },
  ups: { en: "UPS Battery Backup", ko: "UPS 무정전 전원장치" },
  "robot-vacuum": { en: "Robot Vacuum", ko: "로봇청소기" },
};

export const LEGAL_LABELS: Record<LegalSlug, Record<ActiveLocale, string>> = {
  about: { en: "About", ko: "소개" },
  methodology: { en: "Methodology", ko: "검증 방법론" },
  disclaimer: { en: "Safety & Disclaimers", ko: "안전·면책 고지" },
  privacy: { en: "Privacy & CMP", ko: "개인정보·쿠키" },
  contact: { en: "Contact & Corrections", ko: "오류 제보·문의" },
};

export function getCategoryLabel(category: string, locale: ActiveLocale): string {
  const entry = CATEGORY_LABELS[category];
  if (entry) return entry[locale];
  return category.replace(/-/g, " ");
}

export function formatNum(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatInt(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(val));
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: "USD" | "KRW" | "JPY" | "EUR" | "GBP",
  locale: ActiveLocale
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  if (currency === "KRW") {
    const rounded = Math.round(amount);
    const num = new Intl.NumberFormat("ko-KR").format(rounded);
    return locale === "ko" ? `${num}원` : `₩${num}`;
  }
  if (currency === "USD") {
    const num = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `$${num}`;
  }
  if (currency === "EUR") {
    const num = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `€${num}`;
  }
  if (currency === "GBP") {
    const num = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `£${num}`;
  }
  const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(amount));
  return `¥${num}`;
}

export function normalizePath(p: string): string {
  if (!p) return "/";
  const trimmed = p.trim();
  if (!trimmed || trimmed === "/") return "/";

  const hashIdx = trimmed.indexOf("#");
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : "";
  const beforeHash = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;

  const qIdx = beforeHash.indexOf("?");
  const query = qIdx >= 0 ? beforeHash.slice(qIdx) : "";
  const rawPath = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash;

  let pathPart = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  pathPart = pathPart.replace(/\/{2,}/g, "/");

  if (pathPart === "/") {
    return `/${query}${hash}`;
  }

  const withoutTrailing = pathPart.replace(/\/+$/, "");
  const lastSeg = withoutTrailing.slice(withoutTrailing.lastIndexOf("/") + 1);
  if (FILE_EXT_RE.test(lastSeg)) {
    return `${withoutTrailing}${query}${hash}`;
  }

  return `${withoutTrailing}/${query}${hash}`;
}

export function toAbsoluteUrl(pathname: string): string {
  const norm = normalizePath(stripBasePath(pathname));
  return `${SITE_URL}${norm}`;
}

export function switchLocalePath(pathname: string, targetLocale: ActiveLocale): string {
  const stripped = stripBasePath((pathname || "/").trim());
  const norm = normalizePath(stripped);

  const hashIdx = norm.indexOf("#");
  const hash = hashIdx >= 0 ? norm.slice(hashIdx) : "";
  const beforeHash = hashIdx >= 0 ? norm.slice(0, hashIdx) : norm;

  const qIdx = beforeHash.indexOf("?");
  const query = qIdx >= 0 ? beforeHash.slice(qIdx) : "";
  const pathOnly = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash;

  let swapped: string;
  if (pathOnly === "/" || pathOnly === "/en/" || pathOnly === "/ko/") {
    swapped = `/${targetLocale}/`;
  } else if (pathOnly.startsWith("/en/")) {
    swapped = `/${targetLocale}/${pathOnly.slice(4)}`;
  } else if (pathOnly.startsWith("/ko/")) {
    swapped = `/${targetLocale}/${pathOnly.slice(4)}`;
  } else {
    swapped = `/${targetLocale}${pathOnly}`;
  }

  return normalizePath(`${swapped}${query}${hash}`);
}

export function safeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
