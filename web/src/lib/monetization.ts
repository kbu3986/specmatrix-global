import type {
  ActiveLocale,
  AnyItem,
  AvailabilityStatus,
  MonetizationViewModel,
  OutboundCtaButton,
} from "./types";
import { getCoupangDeeplinks, getMonetizationConfig } from "./data";
import { formatCurrency } from "./i18n";

const REAL_ASIN_RE = /^B0[0-9A-Z]{8}$/;

function isValidAsin(asin: string | null | undefined): asin is string {
  if (!asin) return false;
  return REAL_ASIN_RE.test(asin);
}

function isOfficialCoupangShortLink(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https:\/\/link\.coupang\.com\//i.test(url.trim());
}

export function sanitizeCoupangIframeUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  return /^https:\/\/ads-partners\.coupang\.com\/widgets\.html\?/i.test(trimmed)
    ? trimmed
    : "";
}

function buildAmazonUsUrl(
  asin: string | null | undefined,
  searchQuery: string,
  tag: string,
  forceSearch: boolean
): { url: string; linkMode: "direct_asin" | "search_deeplink" } {
  if (!forceSearch && isValidAsin(asin)) {
    return {
      url: `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(tag)}`,
      linkMode: "direct_asin",
    };
  }
  return {
    url: `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=${encodeURIComponent(tag)}`,
    linkMode: "search_deeplink",
  };
}

function buildCoupangSearchUrl(
  slug: string,
  searchQuery: string,
  partnersId: string,
  subId: string,
  deeplinks: Record<string, string>,
  forceSearch: boolean
): { url: string; linkMode: "official_coupang" | "search_deeplink" } {
  const official = deeplinks[slug];
  if (!forceSearch && isOfficialCoupangShortLink(official)) {
    return { url: official.trim(), linkMode: "official_coupang" };
  }
  return {
    url: `https://www.coupang.com/np/search?q=${encodeURIComponent(searchQuery)}&lptag=${encodeURIComponent(partnersId)}&subId=${encodeURIComponent(subId)}`,
    linkMode: "search_deeplink",
  };
}

function getStatusMeta(
  status: AvailabilityStatus,
  locale: ActiveLocale
): { label: string; tone: "pass" | "caution" | "fail" } {
  const isKo = locale === "ko";
  switch (status) {
    case "IN_STOCK":
      return {
        label: isKo ? "정상 유통 모델" : "Active Model",
        tone: "pass",
      };
    case "OUT_OF_STOCK_TEMP":
      return {
        label: isKo ? "일시 품절 가능 — 재고 확인" : "Temp Low Stock — Check Store",
        tone: "caution",
      };
    case "DISCONTINUED_OR_404":
      return {
        label: isKo ? "단종 / 대체 모델 확인" : "Discontinued — See Successor",
        tone: "fail",
      };
    case "PRICE_STALE":
      return {
        label: isKo ? "참고가 기준일 경과 — 실시간 확인" : "Benchmark Date Stale — Verify Live",
        tone: "caution",
      };
  }
}

export function buildMonetizationModel(
  item: AnyItem,
  locale: ActiveLocale
): MonetizationViewModel {
  const cfg = getMonetizationConfig();
  const isKo = locale === "ko";
  const usOffer = item.regional_offers.us;
  const krOffer = item.regional_offers.kr;
  const primaryOffer = isKo ? krOffer : usOffer;

  const isDiscontinued = primaryOffer.status === "DISCONTINUED_OR_404";
  const isPriceStale = primaryOffer.status === "PRICE_STALE";
  const isTempOos = primaryOffer.status === "OUT_OF_STOCK_TEMP";
  const statusMeta = getStatusMeta(primaryOffer.status, locale);

  const usTag = cfg.amazonOneLink.us || "kbu3986-20";
  const coupangId = cfg.coupang.partnersId || "AF2200875";
  const coupangSubId =
    cfg.coupang.verticalSubIds[item.vertical] || cfg.coupang.defaultSubId || "ssalmeok-kr";

  const fallbackQuery = `${item.brand} ${item.category.replace(/-/g, " ")}`;
  const buttons: OutboundCtaButton[] = [];

  if (isKo) {
    const deeplinks = getCoupangDeeplinks();
    const coupangBuilt = buildCoupangSearchUrl(
      item.slug,
      isDiscontinued ? fallbackQuery : krOffer.search_query,
      coupangId,
      coupangSubId,
      deeplinks,
      isDiscontinued
    );
    const amazonBuilt = buildAmazonUsUrl(
      usOffer.asin,
      isDiscontinued ? fallbackQuery : usOffer.search_query,
      usTag,
      isDiscontinued
    );

    const coupangBtn: OutboundCtaButton = {
      label: isDiscontinued
        ? "쿠팡에서 후속·동급 모델 검색"
        : isTempOos
          ? "쿠팡 재고·실시간 최저가 확인"
          : "쿠팡에서 실시간 가격 확인",
      storeName: "Coupang KR",
      url: coupangBuilt.url,
      rel: "sponsored nofollow noopener",
      target: "_blank",
      isPrimary: !isTempOos,
      linkMode: coupangBuilt.linkMode,
    };

    const amazonBtn: OutboundCtaButton = {
      label: isDiscontinued
        ? "아마존 미국 동급 모델 검색"
        : "아마존 미국 직구 확인 (Amazon US)",
      storeName: "Amazon US",
      url: amazonBuilt.url,
      rel: "sponsored nofollow noopener",
      target: "_blank",
      isPrimary: isTempOos,
      linkMode: amazonBuilt.linkMode,
    };

    if (isTempOos) {
      buttons.push(amazonBtn, coupangBtn);
    } else {
      buttons.push(coupangBtn, amazonBtn);
    }

    const officialRedirect = cfg.coupang.redirectUrl;
    if (isOfficialCoupangShortLink(officialRedirect)) {
      buttons.push({
        label: "쿠팡 파트너스 오늘의 특가·로켓배송 보기",
        storeName: "Coupang Goldbox",
        url: officialRedirect.trim(),
        rel: "sponsored nofollow noopener",
        target: "_blank",
        isPrimary: false,
        linkMode: "official_coupang",
      });
    }
  } else {
    const amazonBuilt = buildAmazonUsUrl(
      usOffer.asin,
      isDiscontinued ? fallbackQuery : usOffer.search_query,
      usTag,
      isDiscontinued
    );

    buttons.push({
      label: isDiscontinued
        ? "Search Successors on Amazon US"
        : amazonBuilt.linkMode === "direct_asin"
          ? "Check Live Price on Amazon US"
          : "Search Live Offers on Amazon US",
      storeName: "Amazon US",
      url: amazonBuilt.url,
      rel: "sponsored nofollow noopener",
      target: "_blank",
      isPrimary: true,
      linkMode: amazonBuilt.linkMode,
    });

    if (amazonBuilt.linkMode === "direct_asin") {
      buttons.push({
        label: "Compare Sellers & Bundles on Amazon",
        storeName: "Amazon Search",
        url: `https://www.amazon.com/s?k=${encodeURIComponent(usOffer.search_query)}&tag=${encodeURIComponent(usTag)}`,
        rel: "sponsored nofollow noopener",
        target: "_blank",
        isPrimary: false,
        linkMode: "search_deeplink",
      });
    }
  }

  const benchmarkPriceFormatted = formatCurrency(
    primaryOffer.msrp,
    primaryOffer.currency,
    locale
  );
  const benchmarkDate = primaryOffer.price_checked_at;
  const benchmarkCaption = isKo
    ? `제조사 공식 출고가 참고가 (${benchmarkDate} 기준 · 실시간 스토어 판매가 아님)`
    : `MSRP Reference Benchmark (${benchmarkDate} · Not a live store price)`;

  return {
    locale,
    status: primaryOffer.status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    benchmarkPriceFormatted,
    benchmarkDate,
    benchmarkCaption,
    disclosureText: cfg.compliance.disclosures[locale],
    buttons,
    isDiscontinued,
    isPriceStale,
  };
}
