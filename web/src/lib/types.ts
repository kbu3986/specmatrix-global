export type {
  Locale,
  ActiveLocale,
  Vertical,
  AvailabilityStatus,
  Citation,
  RegionalOffer,
  LocaleCopy,
  AuditMeta,
  BaseItem,
  PortDef,
  PortAllocation,
  WattCheckItem,
  AirlineRecord,
  PureGramItem,
  CycleGearItem,
  AnyItem,
  VsInsight,
  MatrixPage,
  FxRates,
} from "../../../schemas/ssot-types";

export type PilotVertical = "wattcheck" | "puregram" | "cyclegear";
export type LegalSlug = "about" | "methodology" | "disclaimer" | "privacy" | "contact";

export interface MonetizationConfig {
  schemaVersion: string;
  siteUrl: string;
  siteName: string;
  pricingMode: "msrp_benchmark_mode";
  adsenseId: string;
  adsTxtLine: string;
  coupang: {
    partnersId: string;
    defaultSubId: string;
    verticalSubIds: Record<string, string>;
  };
  amazonOneLink: Record<string, string>;
  globalAffiliates: Record<string, string>;
  verification: {
    gsc: string;
    naver: string;
  };
  releaseGate: {
    activeLocales: ("en" | "ko")[];
    releaseWaveMax: number;
    maxPublishedPages: number;
    quarantineCircuitBreakerPct: number;
    minTrustScore: number;
    minInfoGainScore: number;
    minCitations: number;
  };
  compliance: {
    euCmpReady: boolean;
    disclosures: {
      en: string;
      ko: string;
    };
  };
  updatedAt: string;
}

export interface DerivedKpiCard {
  label: string;
  value: string;
  sublabel: string;
  tone?: "default" | "pass" | "caution" | "info" | "fail";
}

export interface VsMetricRow {
  key: string;
  label: string;
  unit: string;
  rawA: number | null;
  rawB: number | null;
  displayA: string;
  displayB: string;
  deltaText: string;
  winner: "a" | "b" | "tie" | "neutral";
  barPctA: number;
  barPctB: number;
  higherIsBetter: boolean;
}

export interface VsDimensionScores {
  value: number;
  portability: number;
  performance: number;
  practicality: number;
}

export interface VsDimensionDef {
  id: keyof VsDimensionScores;
  label: string;
  hint: string;
  defaultWeight: number;
}

export interface VsDiffResult {
  rows: VsMetricRow[];
  scoresA: VsDimensionScores;
  scoresB: VsDimensionScores;
  dimensions: VsDimensionDef[];
}

export interface OutboundCtaButton {
  label: string;
  storeName: string;
  url: string;
  rel: "sponsored nofollow noopener";
  target: "_blank";
  isPrimary: boolean;
  linkMode: "direct_asin" | "search_deeplink";
}

export interface MonetizationViewModel {
  locale: "en" | "ko";
  status: "IN_STOCK" | "OUT_OF_STOCK_TEMP" | "DISCONTINUED_OR_404" | "PRICE_STALE";
  statusLabel: string;
  statusTone: "pass" | "caution" | "fail";
  benchmarkPriceFormatted: string;
  benchmarkDate: string;
  benchmarkCaption: string;
  disclosureText: string;
  buttons: OutboundCtaButton[];
  isDiscontinued: boolean;
  isPriceStale: boolean;
}
