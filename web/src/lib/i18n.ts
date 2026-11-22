import type { ActiveLocale, PilotVertical, LegalSlug } from "./types";

const RAW_BASE = (
  (typeof process !== "undefined" && process.env?.PUBLIC_BASE_PATH) ||
  ""
).trim();

export const BASE_PATH =
  RAW_BASE && RAW_BASE !== "/"
    ? `/${RAW_BASE.replace(/^\/+|\/+$/g, "")}`
    : "";

export const SITE_URL = (
  (typeof process !== "undefined" && process.env?.PUBLIC_SITE_URL) ||
  "https://specmatrix.io"
)
  .trim()
  .replace(/\/+$/, "");

export function withBase(pathname: string): string {
  const norm = normalizePath(pathname);
  if (!BASE_PATH) return norm;
  if (norm === BASE_PATH || norm.startsWith(`${BASE_PATH}/`)) return norm;
  return norm === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${norm}`;
}
export const ACTIVE_LOCALES: ActiveLocale[] = ["en", "ko"];
export const PILOT_VERTICALS: PilotVertical[] = ["wattcheck", "puregram", "cyclegear"];
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
    accentClass: "text-blue-700",
    badgeBgClass: "bg-blue-50 text-blue-800 border-blue-200",
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
    accentClass: "text-emerald-700",
    badgeBgClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
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
    accentClass: "text-amber-700",
    badgeBgClass: "bg-amber-50 text-amber-800 border-amber-200",
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
  if (!p || p === "/") return "/";
  const withSlash = p.startsWith("/") ? p : `/${p}`;
  return withSlash.length > 1 && withSlash.endsWith("/")
    ? withSlash.slice(0, -1)
    : withSlash;
}

export function toAbsoluteUrl(pathname: string): string {
  const norm = normalizePath(pathname);
  return norm === "/" ? `${SITE_URL}/` : `${SITE_URL}${norm}`;
}

export function switchLocalePath(pathname: string, targetLocale: ActiveLocale): string {
  const norm = normalizePath(pathname);
  if (norm === "/") {
    return `/${targetLocale}`;
  }
  if (norm === "/en" || norm === "/ko") {
    return `/${targetLocale}`;
  }
  if (norm.startsWith("/en/")) {
    return `/${targetLocale}${norm.slice(3)}`;
  }
  if (norm.startsWith("/ko/")) {
    return `/${targetLocale}${norm.slice(3)}`;
  }
  return `/${targetLocale}${norm}`;
}

export function safeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
