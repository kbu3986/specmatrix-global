import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "monetization-config.v2.json");
const DEEPLINKS_PATH = path.join(REPO_ROOT, "config", "coupang-deeplinks.json");
const SSALMEOK_CONFIG_PATH = path.resolve(
  REPO_ROOT,
  "..",
  "ssalmeok-empire",
  "deploy-ops",
  "monetization-config.json"
);
const PORT = Number(process.env.LAUNCHPAD_PORT || 3299);
const HOST = "127.0.0.1";

let activeJob = null;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function extractCoupangIframeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const srcMatch = s.match(/src\s*=\s*["'](https:\/\/ads-partners\.coupang\.com\/widgets\.html\?[^"']+)["']/i);
  if (srcMatch) return srcMatch[1].trim();
  const directMatch = s.match(/(https:\/\/ads-partners\.coupang\.com\/widgets\.html\?[^\s"'<>]+)/i);
  if (directMatch) return directMatch[1].trim();
  return "";
}

function extractCoupangShortUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/(https:\/\/link\.coupang\.com\/[^\s"'<>]+)/i);
  return m ? m[1].trim() : "";
}

function sanitizeGa4(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "";
  const m = s.match(/G-[A-Z0-9]{6,14}/);
  return m ? m[0] : "";
}

function sanitizeSimpleId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return /^[a-zA-Z0-9_-]{4,64}$/.test(s) ? s : "";
}

function loadAllKoCoupangExportLines() {
  const verticals = ["wattcheck", "puregram", "cyclegear", "hometech"];
  const rows = [];
  for (const v of verticals) {
    const dir = path.join(REPO_ROOT, "data", v, "items");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".json")) continue;
      const item = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const q = item.regional_offers?.kr?.search_query || item.slug;
      rows.push({
        slug: item.slug,
        vertical: v,
        name: item.i18n?.ko?.name || item.slug,
        rawUrl: `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
      });
    }
  }
  return rows;
}

const SEEDING_POSTS = [
  {
    id: "dossa",
    platform: "도싸 (Dossa) · 로드사이클 자유/용품 게시판",
    badge: "객단가 20만–200만 원 · 최우선 추천",
    openUrl: "https://corearoadbike.com/",
    title:
      "[정보/도구] 로드 타이어 후크리스 5 bar 안전체커 & 파워미터·에너지젤 90g/hr 보급 단가 계산기 만들어 봤습니다 (무료/무가입)",
    body: `파워미터나 튜블리스 타이어, 대회용 에너지젤 살 때마다 제조사 매뉴얼·BB 규격·후크리스 최대 공기압(5 bar / 72.5 psi) 매번 찾아보기 번거로워서 개인적으로 정리하다 무료 웹 도구로 만들었습니다.
회원가입·로그인 없이 브라우저에서 바로 돌아갑니다.

1) GP5000 S TR / Corsa PRO / P ZERO Race RS 후크리스·후크드 공기압 안전 체커
https://kbu3986.github.io/specmatrix-global/ko/cyclegear/item/continental-gp5000-s-tr-28

2) 파베로 아시오마 PRO RS-2 vs 가민 랠리 RS200 / 코로스 듀라 vs 엣지 840 가중치 비교 시뮬레이터
https://kbu3986.github.io/specmatrix-global/ko/cyclegear/vs/favero-assioma-pro-rs-2-vs-garmin-rally-rs200

3) 파워미터·GPS·트레이너 전체 호환 필터 매트릭스
https://kbu3986.github.io/specmatrix-global/ko/cyclegear/matrix/power-meters

4) 모르텐·SiS 베타퓨얼·PF30·GU 에너지젤 시간당 90g 보급 시 대회 총비용 계산기 (본인 구매가 직접 입력 가능)
https://kbu3986.github.io/specmatrix-global/ko/puregram/matrix/energy-gels

빠진 부품이나 수정할 스펙 있으면 댓글로 알려주시면 바로 반영하겠습니다.`,
  },
  {
    id: "clien",
    platform: "클리앙 (Clien) · 모두의공원 / 유용한사이트",
    badge: "여행·테크 고빈도 클릭",
    openUrl: "https://www.clien.net/service/board/park",
    title:
      "[자작도구] 2025–2026 국토부·전 세계 30개 항공사 보조배터리 기내반입 + USB-PD 멀티포트 출력 분배표 정리해 봤습니다",
    body: `최근 한국 국토부 기내 선반 보관 금지·투명 지퍼백 규정, 중국 국내선 CCC 마크 의무화, 에미레이트 100Wh 1개 제한 등 항공사마다 보조배터리 규정이 제각각이라 30개 주요 항공사 공식 정책을 전수 대조해서 무료 웹 매트릭스로 묶었습니다.

1) 전 세계 30개 항공사 기내반입 실시간 Wh 필터표 (대한항공·아시아나·제주·티웨이·ANA·JAL·에미레이트 등)
https://kbu3986.github.io/specmatrix-global/ko/wattcheck/matrix/airlines-30

2) 앤커 프라임 27650 (99.54Wh) 멀티포트 분배·항공사 즉시 체크
https://kbu3986.github.io/specmatrix-global/ko/wattcheck/item/anker-prime-27650mah-250w

3) 최신 멀티포트 GaN 충전기 10종 동시 출력 비교표
https://kbu3986.github.io/specmatrix-global/ko/wattcheck/matrix/gan-chargers

본인 보조배터리 Wh를 입력하면 30개 항공사별 반입 가능·사전승인 필요·불가 여부가 바로 나오고, C1+C2+A1 동시 연결 시 출력 강하와 재협상 끊김 여부도 확인할 수 있습니다.`,
  },
  {
    id: "reddit-usbc",
    platform: "Reddit · r/UsbCHardware (Amazon US 달러 수익)",
    badge: "글로벌 EN · 아마존 US 직결",
    openUrl: "https://www.reddit.com/r/UsbCHardware/submit",
    title:
      "I built a free spec matrix for 25 USB-PD power banks & GaN chargers with real multi-port allocation tables + 30-airline flight checker",
    body: `Every time I compare 140W–250W power banks or GaN bricks (Anker Prime 27650, Shargeek 170, UGREEN Nexode 25000, Cuktech 20, etc.), retail listings hide the actual C1+C2+A1 wattage drop, renegotiation disconnect behavior, and exact airline carry-on limits (Emirates 1-pc cap, China CCC domestic mark, Korea MOLIT overhead-bin ban).

So I compiled manufacturer manual specs and verified weights into a zero-signup static matrix with interactive port toggles and a 30-airline checker:

- Power Banks & Flight Filter Matrix: https://kbu3986.github.io/specmatrix-global/en/wattcheck/matrix/power-banks
- Multi-Port GaN Chargers Matrix: https://kbu3986.github.io/specmatrix-global/en/wattcheck/matrix/gan-chargers
- 30 Global Airlines Battery Rules: https://kbu3986.github.io/specmatrix-global/en/wattcheck/matrix/airlines-30

Happy to add missing SKUs or fix any port-split edge cases if you spot one!`,
  },
  {
    id: "reddit-cycling",
    platform: "Reddit · r/cycling 또는 r/Velo (고단가 EN 제휴)",
    badge: "글로벌 EN · 고객단가",
    openUrl: "https://www.reddit.com/r/cycling/submit",
    title:
      "Built a free road cycling fueling calculator (cost per 30g carbs & 90g/hr race planner) + power meter & hookless tire spec matrix",
    body: `Put together a free, zero-signup client-side matrix comparing 20 endurance gels & electrolytes (Maurten 100/160, SiS Beta Fuel, PF 30/90, Neversecond C30, GU Roctane, Skratch) by true cost per 30g carbs and hourly 90g/hr race cost — plus a CycleGear matrix covering Favero Assioma PRO RS-2 vs Rally RS200, COROS DURA vs Edge 840, and ETRTO 5.0 bar / 72.5 psi hookless checks:

- Energy Gels 30g Carb Cost & 90g/hr Planner: https://kbu3986.github.io/specmatrix-global/en/puregram/matrix/energy-gels
- Power Meters & Drivetrain Matrix: https://kbu3986.github.io/specmatrix-global/en/cyclegear/matrix/power-meters
- Favero Assioma PRO RS-2 vs Garmin Rally RS200 Simulator: https://kbu3986.github.io/specmatrix-global/en/cyclegear/vs/favero-assioma-pro-rs-2-vs-garmin-rally-rs200

All specs link directly to manufacturer nutrition labels and tech sheets. Feedback welcome!`,
  },
];

function startBackgroundJob(name, command, args) {
  if (activeJob && activeJob.status === "running") {
    return { ok: false, error: `이미 실행 중인 작업이 있습니다: ${activeJob.name}` };
  }
  const job = {
    id: String(Date.now()),
    name,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    logs: [`[${new Date().toLocaleTimeString("ko-KR")}] 시작: ${name}`],
  };
  activeJob = job;

  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    shell: true,
    windowsHide: true,
  });

  const appendLines = (chunk) => {
    const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      job.logs.push(l);
      if (job.logs.length > 400) job.logs.shift();
    }
  };

  child.stdout.on("data", appendLines);
  child.stderr.on("data", appendLines);
  child.on("close", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "success" : "error";
    job.finishedAt = new Date().toISOString();
    job.logs.push(
      `[${new Date().toLocaleTimeString("ko-KR")}] 종료 (exit=${code}) — ${
        code === 0 ? "성공" : "실패"
      }`
    );
  });

  return { ok: true, job };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function renderHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SpecMatrix Global — 원클릭 최종 마무리 런치패드</title>
  <style>
    :root {
      --bg: #f8fafc; --card: #ffffff; --ink: #0f172a; --muted: #475569;
      --border: #e2e8f0; --blue: #1d4ed8; --blue-bg: #eff6ff;
      --green: #047857; --green-bg: #ecfdf5; --amber: #b45309; --amber-bg: #fffbeb;
      --red: #be123c; --red-bg: #fff1f2;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Malgun Gothic", sans-serif; background: var(--bg); color: var(--ink); line-height: 1.55; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 18px 80px; }
    .hero { background: #0f172a; color: #fff; border-radius: 16px; padding: 24px 28px; margin-bottom: 22px; }
    .hero h1 { margin: 0 0 6px; font-size: 1.45rem; }
    .hero p { margin: 0; color: #cbd5e1; font-size: 0.92rem; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.1); color: #f8fafc; border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 5px 12px; font-size: 0.78rem; text-decoration: none; font-weight: 600; }
    .pill:hover { background: rgba(255,255,255,0.2); }
    .step { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
    .step-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px; }
    .step-num { display: inline-flex; align-items: center; justify-content: center; background: var(--blue); color: #fff; font-weight: 800; font-size: 0.78rem; padding: 3px 10px; border-radius: 999px; margin-right: 8px; }
    .step h2 { margin: 0; font-size: 1.12rem; display: flex; align-items: center; }
    .time-badge { font-size: 0.78rem; font-weight: 700; color: var(--green); background: var(--green-bg); border: 1px solid #a7f3d0; padding: 3px 10px; border-radius: 999px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .box { border: 1px solid var(--border); border-radius: 10px; padding: 14px; background: #fbfdff; }
    .box h3 { margin: 0 0 6px; font-size: 0.94rem; }
    .box p { margin: 0 0 10px; font-size: 0.83rem; color: var(--muted); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: 8px; padding: 8px 14px; font-size: 0.84rem; font-weight: 700; cursor: pointer; text-decoration: none; transition: 0.12s; }
    .btn-primary { background: var(--blue); color: #fff; }
    .btn-primary:hover { background: #1e40af; }
    .btn-dark { background: #0f172a; color: #fff; }
    .btn-dark:hover { background: #1e293b; }
    .btn-outline { background: #fff; color: #1e293b; border-color: #cbd5e1; }
    .btn-outline:hover { background: #f1f5f9; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-green:hover { background: #065f46; }
    .btn-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    label.field { display: block; margin-bottom: 12px; }
    label.field span.lbl { display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; font-weight: 700; margin-bottom: 5px; }
    label.field small { color: var(--muted); font-weight: 400; font-size: 0.78rem; }
    input[type="text"], textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 11px; font-size: 0.86rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    textarea { min-height: 74px; resize: vertical; }
    .mono-copy { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #f1f5f9; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-family: ui-monospace, monospace; font-size: 0.8rem; margin-bottom: 8px; word-break: break-all; }
    .log-box { background: #0b1220; color: #e2e8f0; border-radius: 10px; padding: 14px; font-family: ui-monospace, monospace; font-size: 0.78rem; max-height: 260px; overflow-y: auto; white-space: pre-wrap; margin-top: 12px; display: none; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 0.85rem; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,0.2); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 99; }
    .toast.show { opacity: 1; }
    .seed-card { border: 1px solid var(--border); border-radius: 12px; padding: 15px; background: #fff; }
    .seed-card.done { border-color: #6ee7b7; background: #f0fdf4; }
    .seed-preview { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 0.78rem; color: #334155; max-height: 125px; overflow-y: auto; white-space: pre-wrap; margin: 8px 0 10px; }
    .tag { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: var(--blue-bg); color: var(--blue); }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: #94a3b8; }
    .status-ok { background: #10b981; }
    .status-err { background: #ef4444; }
    .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; margin-top: 12px; }
    .health-item { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 0.8rem; display: flex; align-items: center; justify-content: space-between; background: #fff; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>SpecMatrix Global · 최종 마무리 원클릭 런치패드</h1>
    <p>병욱님이 로그인 후 <strong>버튼·링크만 순서대로 찍 누르면</strong> 수익화(쿠팡 공식 배너·GA4)·구글 색인·첫 트래픽 시딩까지 5분 안에 전부 끝납니다.</p>
    <div class="pill-row">
      <a class="pill" href="https://kbu3986.github.io/specmatrix-global/ko" target="_blank">SpecMatrix 한국어 ↗</a>
      <a class="pill" href="https://kbu3986.github.io/specmatrix-global/en" target="_blank">SpecMatrix English ↗</a>
      <a class="pill" href="https://kbu3986.github.io/pin2pin-global/en/" target="_blank">Pin2Pin Global ↗</a>
      <a class="pill" href="https://kbu3986.github.io/ko/" target="_blank">통합 루트 허브 ↗</a>
      <a class="pill" href="https://github.com/kbu3986/specmatrix-global" target="_blank">GitHub 저장소 ↗</a>
    </div>
  </div>

  <!-- STEP 1 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 1</span>구글 서치콘솔(GSC) &amp; 애드센스 상태 찍고 끝내기</h2>
      <span class="time-badge">소요 30초 · 네이버/Bing 407 URL은 이미 제출 완료</span>
    </div>
    <div class="grid-2">
      <div class="box">
        <h3>1-A. Google Search Console 통합 사이트맵 재제출</h3>
        <p>아래 주소 복사 후 GSC <strong>사이트맵</strong> 메뉴에 붙여넣고 제출 버튼만 누르세요. (5개 사이트 1,292페이지 전체가 한 번에 들어갑니다.)</p>
        <div class="mono-copy">
          <span id="sm-root">sitemap-index.xml</span>
          <button class="btn btn-outline" onclick="copyText('sitemap-index.xml')">복사</button>
        </div>
        <div class="mono-copy">
          <span id="sm-spec">specmatrix-global/sitemap-index.xml</span>
          <button class="btn btn-outline" onclick="copyText('specmatrix-global/sitemap-index.xml')">복사</button>
        </div>
        <div class="btn-row">
          <a class="btn btn-primary" href="https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Fkbu3986.github.io%2F" target="_blank">GSC 사이트맵 바로 열기 ↗</a>
          <a class="btn btn-outline" href="https://searchadvisor.naver.com/console/board" target="_blank">네이버 서치어드바이저 ↗</a>
        </div>
      </div>

      <div class="box">
        <h3>1-B. Google AdSense 승인 확인 (자동 광고 ON 확인)</h3>
        <p>방금 전 페이지에 <code>adsbygoogle.js</code> 송출 스크립트까지 패치 완료했습니다. 애드센스 사이트 관리에서 <code>kbu3986.github.io</code> 심사 상태와 자동 광고 토글만 확인하세요.</p>
        <div class="btn-row" style="margin-top: 16px;">
          <a class="btn btn-dark" href="https://www.google.com/adsense/new/u/0/pub-8587506565277191/sites" target="_blank">애드센스 사이트 현황 열기 ↗</a>
          <a class="btn btn-outline" href="https://kbu3986.github.io/ads.txt" target="_blank">루트 ads.txt 확인 ↗</a>
        </div>
      </div>
    </div>
  </section>

  <!-- STEP 2 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 2</span>쿠팡 공식 배너 &amp; GA4/Clarity 붙여넣고 원클릭 자동 재배포</h2>
      <span class="time-badge">소요 2분 · 붙여넣기 후 버튼 1번</span>
    </div>

    <div class="btn-row" style="margin-bottom: 14px;">
      <a class="btn btn-outline" href="https://partners.coupang.com/#affiliate/ws/banner" target="_blank">1) 쿠팡 다이나믹 배너 열기 ↗</a>
      <a class="btn btn-outline" href="https://partners.coupang.com/#affiliate/ws/link" target="_blank">2) 쿠팡 간편 링크 열기 ↗</a>
      <a class="btn btn-outline" href="https://analytics.google.com/" target="_blank">3) GA4 측정 ID 열기 ↗</a>
      <a class="btn btn-outline" href="https://clarity.microsoft.com/" target="_blank">4) Clarity(무료 히트맵) 열기 ↗</a>
    </div>

    <div class="grid-2">
      <div>
        <label class="field">
          <span class="lbl">쿠팡 파트너스 다이나믹 배너 코드 (HTML &lt;iframe&gt; 통째로 복붙 가능)</span>
          <textarea id="f-coupang-iframe" placeholder='<iframe src="https://ads-partners.coupang.com/widgets.html?id=..." ...></iframe> 그대로 붙여넣으면 URL만 자동 추출합니다.'></textarea>
        </label>

        <label class="field">
          <span class="lbl">쿠팡 파트너스 대표 단축 링크 (선택 · 골드박스/추천 링크)</span>
          <input type="text" id="f-coupang-redirect" placeholder="https://link.coupang.com/a/..." />
        </label>
      </div>

      <div>
        <label class="field">
          <span class="lbl">Google Analytics 4 측정 ID <small>방문자·제휴 버튼 클릭 실시간 추적</small></span>
          <input type="text" id="f-ga4" placeholder="G-XXXXXXXXXX" />
        </label>

        <label class="field">
          <span class="lbl">Microsoft Clarity 프로젝트 ID (선택) <small>클릭 히트맵·세션 녹화</small></span>
          <input type="text" id="f-clarity" placeholder="예: q1w2e3r4t5" />
        </label>

        <label class="field">
          <span class="lbl">아이허브 리워드 코드 (선택 · PureGram 5–10% 수수료)</span>
          <input type="text" id="f-iherb" placeholder="예: ABC1234" />
        </label>
      </div>
    </div>

    <label class="field">
      <span class="lbl">
        <span>(선택) 상품별 공식 <code>link.coupang.com/a/...</code> 단축 링크 일괄 등록</span>
        <button class="btn btn-outline" style="padding:4px 10px;font-size:0.76rem;" onclick="copyAllCoupangUrls()">60종 쿠팡 검색 URL 복사</button>
      </span>
      <textarea id="f-deeplinks" placeholder="한 줄에 하나씩: anker-prime-27650mah-250w https://link.coupang.com/a/XXXXXX"></textarea>
    </label>

    <div class="btn-row">
      <button class="btn btn-outline" onclick="saveOnly()">설정만 저장</button>
      <button class="btn btn-primary" onclick="saveAndDeploy()">저장 + 203p 빌드 + QA + 라이브 재배포 + IndexNow 자동 실행</button>
      <label style="font-size:0.82rem;color:#334155;display:inline-flex;align-items:center;gap:6px;margin-left:6px;">
        <input type="checkbox" id="f-sync-ssalmeok" checked />
        기존 ssalmeok-empire 설정에도 쿠팡 배너·아이허브 동시 동기화
      </label>
    </div>

    <div id="job-log" class="log-box"></div>
  </section>

  <!-- STEP 3 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 3</span>오늘 첫 클릭·첫 제휴 수익 만들기 (커뮤니티 4곳 복붙 시딩)</h2>
      <span class="time-badge">소요 2분 · 제목/본문 1클릭 복사</span>
    </div>
    <p style="margin:0 0 14px;font-size:0.86rem;color:var(--muted);">검색 색인(1–3주)을 마냥 기다리지 않고 오늘 바로 첫 실사용자와 첫 쿠팡·아마존 클릭을 만드는 단계입니다. 각 카드에서 <strong>[제목 복사] → [본문 복사] → [게시판 열기]</strong>만 누르세요.</p>
    <div id="seeding-grid" class="grid-2"></div>
  </section>

  <!-- STEP 4 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 4</span>전체 6개 라이브 사이트 원클릭 점검 &amp; 운영 도구</h2>
      <span class="time-badge">실시간 HTTP 200 모니터링</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-green" onclick="checkLiveHealth()">전체 6개 사이트 실시간 상태 점검</button>
      <button class="btn btn-outline" onclick="runQuickAction('fx')">실시간 환율 갱신 (fx:update)</button>
      <button class="btn btn-outline" onclick="runQuickAction('indexnow')">네이버·Bing IndexNow 407 URL 재제출</button>
    </div>
    <div id="health-grid" class="health-grid"></div>
  </section>
</div>

<div id="toast" class="toast"></div>

<script>
  let state = null;
  let pollTimer = null;

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__tt);
    window.__tt = setTimeout(() => el.classList.remove("show"), 2600);
  }

  async function copyText(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      toast("클립보드에 복사되었습니다!");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("클립보드에 복사되었습니다!");
    }
  }

  function getDoneSet() {
    try { return new Set(JSON.parse(localStorage.getItem("sm_seed_done") || "[]")); }
    catch { return new Set(); }
  }
  function toggleSeedDone(id) {
    const s = getDoneSet();
    if (s.has(id)) s.delete(id); else s.add(id);
    localStorage.setItem("sm_seed_done", JSON.stringify([...s]));
    renderSeeding();
  }

  function renderSeeding() {
    if (!state) return;
    const done = getDoneSet();
    const grid = document.getElementById("seeding-grid");
    grid.innerHTML = state.seedingPosts.map((p) => {
      const isDone = done.has(p.id);
      return \`
        <div class="seed-card \${isDone ? "done" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:0.93rem;">\${p.platform}</strong>
            <span class="tag">\${p.badge}</span>
          </div>
          <div style="font-size:0.83rem;font-weight:700;color:#0f172a;margin-bottom:4px;">\${escapeHtml(p.title)}</div>
          <div class="seed-preview">\${escapeHtml(p.body)}</div>
          <div class="btn-row">
            <button class="btn btn-outline" onclick="copySeed('\${p.id}','title')">제목 복사</button>
            <button class="btn btn-primary" onclick="copySeed('\${p.id}','body')">본문 복사</button>
            <a class="btn btn-dark" href="\${p.openUrl}" target="_blank">게시판 열기 ↗</a>
            <label style="margin-left:auto;font-size:0.8rem;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
              <input type="checkbox" \${isDone ? "checked" : ""} onchange="toggleSeedDone('\${p.id}')" />
              게시 완료
            </label>
          </div>
        </div>\`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function copySeed(id, part) {
    const p = state.seedingPosts.find((x) => x.id === id);
    if (!p) return;
    copyText(part === "title" ? p.title : p.body);
  }

  function copyAllCoupangUrls() {
    if (!state) return;
    const text = state.coupangExport.map((r) => \`\${r.slug}\\t\${r.rawUrl}\`).join("\\n");
    copyText(text);
  }

  function collectForm() {
    return {
      coupangIframeRaw: document.getElementById("f-coupang-iframe").value,
      coupangRedirectRaw: document.getElementById("f-coupang-redirect").value,
      ga4MeasurementId: document.getElementById("f-ga4").value,
      clarityProjectId: document.getElementById("f-clarity").value,
      iherbCode: document.getElementById("f-iherb").value,
      deeplinksText: document.getElementById("f-deeplinks").value,
      syncSsalmeok: document.getElementById("f-sync-ssalmeok").checked,
    };
  }

  async function saveOnly() {
    const res = await fetch("/api/save-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectForm()),
    });
    const data = await res.json();
    if (data.ok) {
      toast("설정 저장 완료! (" + data.summary + ")");
      await loadState();
    } else {
      toast("저장 실패: " + data.error);
    }
  }

  async function saveAndDeploy() {
    const res = await fetch("/api/save-and-deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectForm()),
    });
    const data = await res.json();
    if (!data.ok) {
      toast("실행 오류: " + data.error);
      return;
    }
    toast("저장 및 라이브 재배포 시작!");
    startPollingJob();
  }

  async function runQuickAction(action) {
    const res = await fetch("/api/action/" + action, { method: "POST" });
    const data = await res.json();
    if (!data.ok) {
      toast("오류: " + data.error);
      return;
    }
    toast("작업 시작: " + data.job.name);
    startPollingJob();
  }

  function startPollingJob() {
    const box = document.getElementById("job-log");
    box.style.display = "block";
    clearInterval(pollTimer);
    const poll = async () => {
      const r = await fetch("/api/job");
      const j = await r.json();
      if (!j.job) return;
      box.textContent = j.job.logs.join("\\n");
      box.scrollTop = box.scrollHeight;
      if (j.job.status !== "running") {
        clearInterval(pollTimer);
        toast(j.job.status === "success" ? "작업 완료 (성공)!" : "작업 실패 — 로그 확인");
      }
    };
    poll();
    pollTimer = setInterval(poll, 1800);
  }

  async function checkLiveHealth() {
    const grid = document.getElementById("health-grid");
    grid.innerHTML = '<div class="health-item">실시간 점검 중...</div>';
    const r = await fetch("/api/health-check");
    const d = await r.json();
    grid.innerHTML = d.results.map((item) => \`
      <div class="health-item">
        <span><span class="status-dot \${item.ok ? "status-ok" : "status-err"}"></span>
          <a href="\${item.url}" target="_blank" style="color:#0f172a;text-decoration:none;font-weight:600;">\${item.label}</a>
        </span>
        <strong style="font-family:monospace;color:\${item.ok ? "#047857" : "#be123c"}">\${item.status} (\${item.ms}ms)</strong>
      </div>\`).join("");
  }

  async function loadState() {
    const r = await fetch("/api/state");
    state = await r.json();
    const c = state.config;
    document.getElementById("f-coupang-iframe").value = c.coupang?.iframeUrl || "";
    document.getElementById("f-coupang-redirect").value = c.coupang?.redirectUrl || "";
    document.getElementById("f-ga4").value = c.analytics?.ga4MeasurementId || "";
    document.getElementById("f-clarity").value = c.analytics?.clarityProjectId || "";
    document.getElementById("f-iherb").value = c.globalAffiliates?.iherbCode || "";
    const dlEntries = Object.entries(state.deeplinks?.links || {}).map(([k, v]) => \`\${k} \${v}\`).join("\\n");
    document.getElementById("f-deeplinks").value = dlEntries;
    renderSeeding();
  }

  loadState();
  checkLiveHealth();
</script>
</body>
</html>`;
}

function applyConfigPayload(body) {
  const cfg = readJson(CONFIG_PATH, {});
  const iframeUrl = extractCoupangIframeUrl(body.coupangIframeRaw);
  const redirectUrl = extractCoupangShortUrl(body.coupangRedirectRaw);
  const ga4 = sanitizeGa4(body.ga4MeasurementId);
  const clarity = sanitizeSimpleId(body.clarityProjectId);
  const iherb = sanitizeSimpleId(body.iherbCode);

  cfg.coupang = cfg.coupang || {};
  cfg.coupang.iframeUrl = iframeUrl;
  cfg.coupang.redirectUrl = redirectUrl;
  cfg.analytics = cfg.analytics || {};
  cfg.analytics.ga4MeasurementId = ga4;
  cfg.analytics.clarityProjectId = clarity;
  cfg.globalAffiliates = cfg.globalAffiliates || {};
  cfg.globalAffiliates.iherbCode = iherb;
  cfg.updatedAt = new Date().toISOString().slice(0, 10);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");

  // Parse per-SKU official link.coupang.com lines
  const dlObj = readJson(DEEPLINKS_PATH, {
    schema_version: "1.0.0",
    description: "Official Coupang Partners short-link registry (https://link.coupang.com/a/...).",
    updated_at: cfg.updatedAt,
    links: {},
  });
  const newLinks = {};
  const lines = String(body.deeplinksText || "").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length >= 2) {
      const slug = parts[0].trim();
      const shortUrl = extractCoupangShortUrl(parts[1]);
      if (/^[a-z0-9-]+$/.test(slug) && shortUrl) {
        newLinks[slug] = shortUrl;
      }
    }
  }
  dlObj.updated_at = cfg.updatedAt;
  dlObj.links = newLinks;
  fs.writeFileSync(DEEPLINKS_PATH, JSON.stringify(dlObj, null, 2) + "\n", "utf8");

  // Optional sync to ssalmeok-empire monetization-config.json
  let syncedSsalmeok = false;
  if (body.syncSsalmeok && fs.existsSync(SSALMEOK_CONFIG_PATH)) {
    const sm = readJson(SSALMEOK_CONFIG_PATH, null);
    if (sm) {
      if (iframeUrl) sm.coupangIframeUrl = iframeUrl;
      if (redirectUrl) sm.coupangRedirectUrl = redirectUrl;
      if (iherb) sm.iherbCode = iherb;
      sm.updatedAt = new Date().toISOString();
      fs.writeFileSync(SSALMEOK_CONFIG_PATH, JSON.stringify(sm, null, 2) + "\n", "utf8");
      syncedSsalmeok = true;
    }
  }

  return {
    summary: `배너=${iframeUrl ? "ON" : "미입력"}, GA4=${ga4 || "미입력"}, Clarity=${
      clarity || "미입력"
    }, 개별쿠팡링크=${Object.keys(newLinks).length}건${syncedSsalmeok ? ", ssalmeok 동기화됨" : ""}`,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, {
      config: readJson(CONFIG_PATH, {}),
      deeplinks: readJson(DEEPLINKS_PATH, { links: {} }),
      coupangExport: loadAllKoCoupangExportLines(),
      seedingPosts: SEEDING_POSTS,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/job") {
    return sendJson(res, 200, { job: activeJob });
  }

  if (req.method === "GET" && url.pathname === "/api/health-check") {
    const targets = [
      { label: "SpecMatrix 한국어", url: "https://kbu3986.github.io/specmatrix-global/ko" },
      { label: "SpecMatrix English", url: "https://kbu3986.github.io/specmatrix-global/en" },
      { label: "Pin2Pin Global", url: "https://kbu3986.github.io/pin2pin-global/en/" },
      { label: "루트 허브 (ads.txt/GSC)", url: "https://kbu3986.github.io/ko/" },
      { label: "WattCheck (1호기)", url: "https://kbu3986.github.io/wattcheck-global/ko" },
      { label: "PureGram (3호기)", url: "https://kbu3986.github.io/puregram-global/ko" },
    ];
    const results = await Promise.all(
      targets.map(async (t) => {
        const t0 = Date.now();
        try {
          const r = await fetch(t.url, { method: "HEAD" });
          return { ...t, ok: r.status >= 200 && r.status < 400, status: `HTTP ${r.status}`, ms: Date.now() - t0 };
        } catch (e) {
          return { ...t, ok: false, status: "ERR", ms: Date.now() - t0 };
        }
      })
    );
    return sendJson(res, 200, { results });
  }

  if (req.method === "POST" && url.pathname === "/api/save-config") {
    try {
      const body = await readRequestBody(req);
      const out = applyConfigPayload(body);
      return sendJson(res, 200, { ok: true, ...out });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/save-and-deploy") {
    try {
      const body = await readRequestBody(req);
      applyConfigPayload(body);
      const started = startBackgroundJob(
        "SpecMatrix 203p 재배포 + IndexNow 자동 제출",
        "powershell",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "git add config/monetization-config.v2.json config/coupang-deeplinks.json; git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m 'chore(config): update monetization and analytics via Launchpad' }; npm run deploy:gh-pages; if ($LASTEXITCODE -eq 0) { npm run indexnow:submit }",
        ]
      );
      return sendJson(res, started.ok ? 200 : 409, started);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/action/fx") {
    const started = startBackgroundJob("실시간 환율 갱신", "npm", ["run", "fx:update"]);
    return sendJson(res, started.ok ? 200 : 409, started);
  }

  if (req.method === "POST" && url.pathname === "/api/action/indexnow") {
    const started = startBackgroundJob("네이버·Bing IndexNow 407 URL 제출", "npm", [
      "run",
      "indexnow:submit",
    ]);
    return sendJson(res, started.ok ? 200 : 409, started);
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`[SpecMatrix Launchpad] Running at http://${HOST}:${PORT}`);
});
