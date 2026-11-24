import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "monetization-config.v2.json");
const DEEPLINKS_PATH = path.join(REPO_ROOT, "config", "coupang-deeplinks.json");
const PORT = Number(process.env.LAUNCHPAD_PORT || 3299);
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 512 * 1024;
const CSRF_TOKEN = crypto.randomBytes(24).toString("hex");
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

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
  const srcMatch = s.match(
    /src\s*=\s*["'](https:\/\/ads-partners\.coupang\.com\/widgets\.html\?[^"']+)["']/i
  );
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
  const m = s.match(/^G-[A-Z0-9]{6,14}$/);
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

function constantTimeTokenMatch(provided, expected) {
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
    shell: false,
    windowsHide: true,
  });

  const appendLines = (chunk) => {
    const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      job.logs.push(l);
      if (job.logs.length > 400) job.logs.shift();
    }
  };

  child.on("error", (err) => {
    job.exitCode = -1;
    job.status = "error";
    job.finishedAt = new Date().toISOString();
    job.logs.push(
      `[${new Date().toLocaleTimeString("ko-KR")}] 프로세스 실행 오류: ${err.message}`
    );
  });

  if (child.stdout) child.stdout.on("data", appendLines);
  if (child.stderr) child.stderr.on("data", appendLines);
  child.on("close", (code) => {
    if (job.status !== "running") return;
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

function runPowerShellCommand(name, psScript) {
  const exe = process.platform === "win32" ? "powershell.exe" : "pwsh";
  return startBackgroundJob(name, exe, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    psScript,
  ]);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        const err = new Error("Request body exceeds 512 KB limit.");
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const err = new Error("Invalid JSON request body.");
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on("error", (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    });
  });
}

function validateRequestSecurity(req, isPost) {
  const host = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return { ok: false, status: 403, error: "Forbidden Host header." };
  }

  if (isPost) {
    const origin = req.headers.origin;
    if (origin !== undefined && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) {
      return { ok: false, status: 403, error: "Forbidden Origin header." };
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return { ok: false, status: 415, error: "Content-Type must be application/json." };
    }

    const token = req.headers["x-launchpad-token"];
    if (!constantTimeTokenMatch(token, CSRF_TOKEN)) {
      return { ok: false, status: 403, error: "Invalid or missing X-Launchpad-Token." };
    }
  }

  return { ok: true };
}

function renderHtml(skuCount) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SpecMatrix Global — 로컬 운영 제어 런치패드</title>
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
    <h1>SpecMatrix Global · 로컬 운영 제어 런치패드</h1>
    <p>로컬 전용 운영 도구입니다. 수익화 설정(쿠팡 파트너스·GA4·Clarity), 빌드·QA·GitHub Pages 재배포, IndexNow 제출 및 라이브 상태를 안전하게 관리합니다. (${skuCount}종 검증 SKU · 258p+ SSG)</p>
    <div class="pill-row">
      <a class="pill" href="https://kbu3986.github.io/specmatrix-global/ko/" target="_blank" rel="noopener noreferrer">SpecMatrix 한국어 ↗</a>
      <a class="pill" href="https://kbu3986.github.io/specmatrix-global/en/" target="_blank" rel="noopener noreferrer">SpecMatrix English ↗</a>
      <a class="pill" href="https://kbu3986.github.io/pin2pin-global/en/" target="_blank" rel="noopener noreferrer">Pin2Pin Global ↗</a>
      <a class="pill" href="https://kbu3986.github.io/ko/" target="_blank" rel="noopener noreferrer">통합 루트 허브 ↗</a>
      <a class="pill" href="https://github.com/kbu3986/specmatrix-global" target="_blank" rel="noopener noreferrer">GitHub 저장소 ↗</a>
    </div>
  </div>

  <!-- STEP 1 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 1</span>구글 서치콘솔(GSC) &amp; 애드센스 상태 점검</h2>
      <span class="time-badge">분할 사이트맵 9종 · ads.txt 확인</span>
    </div>
    <div class="grid-2">
      <div class="box">
        <h3>1-A. Google Search Console 통합 사이트맵</h3>
        <p>GSC <strong>사이트맵</strong> 메뉴에 아래 경로를 제출해 전 버티컬·스튜디오 색인을 점검합니다.</p>
        <div class="mono-copy">
          <span id="sm-root">sitemap-index.xml</span>
          <button class="btn btn-outline" type="button" onclick="copyText('sitemap-index.xml')">복사</button>
        </div>
        <div class="mono-copy">
          <span id="sm-spec">specmatrix-global/sitemap-index.xml</span>
          <button class="btn btn-outline" type="button" onclick="copyText('specmatrix-global/sitemap-index.xml')">복사</button>
        </div>
        <div class="btn-row">
          <a class="btn btn-primary" href="https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Fkbu3986.github.io%2F" target="_blank" rel="noopener noreferrer">GSC 사이트맵 열기 ↗</a>
          <a class="btn btn-outline" href="https://searchadvisor.naver.com/console/board" target="_blank" rel="noopener noreferrer">네이버 서치어드바이저 ↗</a>
        </div>
      </div>

      <div class="box">
        <h3>1-B. Google AdSense 승인 및 ads.txt 확인</h3>
        <p>애드센스 사이트 관리에서 승인 상태와 루트 <code>ads.txt</code> 게시 상태를 확인합니다.</p>
        <div class="btn-row" style="margin-top: 16px;">
          <a class="btn btn-dark" href="https://www.google.com/adsense/new/u/0/pub-8587506565277191/sites" target="_blank" rel="noopener noreferrer">애드센스 사이트 현황 ↗</a>
          <a class="btn btn-outline" href="https://kbu3986.github.io/ads.txt" target="_blank" rel="noopener noreferrer">루트 ads.txt 확인 ↗</a>
        </div>
      </div>
    </div>
  </section>

  <!-- STEP 2 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 2</span>쿠팡 파트너스 &amp; GA4/Clarity 설정 병합 및 자동 재배포</h2>
      <span class="time-badge">안전 병합 저장 (빈 칸 덮어쓰기 차단)</span>
    </div>

    <div class="btn-row" style="margin-bottom: 14px;">
      <a class="btn btn-outline" href="https://partners.coupang.com/#affiliate/ws/banner" target="_blank" rel="noopener noreferrer">1) 쿠팡 다이나믹 배너 ↗</a>
      <a class="btn btn-outline" href="https://partners.coupang.com/#affiliate/ws/link" target="_blank" rel="noopener noreferrer">2) 쿠팡 간편 링크 ↗</a>
      <a class="btn btn-outline" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">3) GA4 측정 ID ↗</a>
      <a class="btn btn-outline" href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer">4) Microsoft Clarity ↗</a>
    </div>

    <div class="grid-2">
      <div>
        <label class="field">
          <span class="lbl">쿠팡 파트너스 다이나믹 배너 코드 (HTML &lt;iframe&gt; 통째로 복붙 가능)</span>
          <textarea id="f-coupang-iframe" placeholder='<iframe src="https://ads-partners.coupang.com/widgets.html?id=..." ...></iframe>'></textarea>
        </label>

        <label class="field">
          <span class="lbl">쿠팡 파트너스 대표 단축 링크 (선택 · 골드박스/추천 링크)</span>
          <input type="text" id="f-coupang-redirect" placeholder="https://link.coupang.com/a/..." />
        </label>
      </div>

      <div>
        <label class="field">
          <span class="lbl">Google Analytics 4 측정 ID <small>방문자·제휴 클릭 추적</small></span>
          <input type="text" id="f-ga4" placeholder="G-XXXXXXXXXX" />
        </label>

        <label class="field">
          <span class="lbl">Microsoft Clarity 프로젝트 ID (선택) <small>클릭 히트맵</small></span>
          <input type="text" id="f-clarity" placeholder="예: q1w2e3r4t5" />
        </label>
      </div>
    </div>

    <label class="field">
      <span class="lbl">
        <span>(선택) 상품별 공식 <code>link.coupang.com/a/...</code> 단축 링크 병합 등록</span>
        <button class="btn btn-outline" type="button" style="padding:4px 10px;font-size:0.76rem;" onclick="copyAllCoupangUrls()">${skuCount}종 쿠팡 검색 URL 복사</button>
      </span>
      <textarea id="f-deeplinks" placeholder="한 줄에 하나씩 추가·갱신 (비워두면 기존 등록 링크 보존): anker-prime-27650mah-250w https://link.coupang.com/a/XXXXXX"></textarea>
    </label>

    <div class="btn-row">
      <button class="btn btn-outline" type="button" onclick="saveOnly()">설정만 안전 병합 저장</button>
      <button class="btn btn-primary" type="button" onclick="saveAndDeploy()">저장 + 258p+ 빌드 + Stage 6 QA + 라이브 재배포 + IndexNow 실행</button>
    </div>

    <div id="job-log" class="log-box"></div>
  </section>

  <!-- STEP 3 -->
  <section class="step">
    <div class="step-head">
      <h2><span class="step-num">STEP 3</span>라이브 엔드포인트 점검 &amp; 데이터 운영 액션</h2>
      <span class="time-badge">실시간 HTTP 상태 모니터링</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-green" type="button" onclick="checkLiveHealth()">라이브 사이트 실시간 상태 점검</button>
      <button class="btn btn-outline" type="button" onclick="runQuickAction('fx')">실시간 환율 갱신 (fx:update)</button>
      <button class="btn btn-outline" type="button" onclick="runQuickAction('indexnow')">네이버·Bing IndexNow 제출</button>
    </div>
    <div id="health-grid" class="health-grid"></div>
  </section>
</div>

<div id="toast" class="toast"></div>

<script>
  const LAUNCHPAD_TOKEN = ${JSON.stringify(CSRF_TOKEN)};
  let state = null;
  let pollTimer = null;

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__tt);
    window.__tt = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function copyText(txt) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(txt);
        toast("클립보드에 복사되었습니다!");
        return;
      } catch {
        // fall through
      }
    }
    toast("클립보드 자동 복사가 차단되었습니다. 수동으로 복사해 주세요.");
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
      deeplinksText: document.getElementById("f-deeplinks").value,
    };
  }

  function postJson(endpoint, payload) {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Launchpad-Token": LAUNCHPAD_TOKEN,
      },
      body: JSON.stringify(payload || {}),
    });
  }

  async function saveOnly() {
    const res = await postJson("/api/save-config", collectForm());
    const data = await res.json();
    if (data.ok) {
      toast("설정 저장 완료! (" + data.summary + ")");
      await loadState();
    } else {
      toast("저장 실패: " + data.error);
    }
  }

  async function saveAndDeploy() {
    const res = await postJson("/api/save-and-deploy", collectForm());
    const data = await res.json();
    if (!data.ok) {
      toast("실행 오류: " + data.error);
      return;
    }
    toast("저장 및 라이브 재배포 시작!");
    startPollingJob();
  }

  async function runQuickAction(action) {
    const res = await postJson("/api/action/" + encodeURIComponent(action), {});
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
    grid.innerHTML = d.results.map((item) => {
      const safeUrl = /^https:\\/\\//i.test(String(item.url || "")) ? item.url : "#";
      return \`
      <div class="health-item">
        <span><span class="status-dot \${item.ok ? "status-ok" : "status-err"}"></span>
          <a href="\${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0f172a;text-decoration:none;font-weight:600;">\${escapeHtml(item.label)}</a>
        </span>
        <strong style="font-family:monospace;color:\${item.ok ? "#047857" : "#be123c"}">\${escapeHtml(item.status)} (\${escapeHtml(item.ms)}ms)</strong>
      </div>\`;
    }).join("");
  }

  async function loadState() {
    const r = await fetch("/api/state");
    state = await r.json();
    const c = state.config || {};
    document.getElementById("f-coupang-iframe").value = c.coupang?.iframeUrl || "";
    document.getElementById("f-coupang-redirect").value = c.coupang?.redirectUrl || "";
    document.getElementById("f-ga4").value = c.analytics?.ga4MeasurementId || "";
    document.getElementById("f-clarity").value = c.analytics?.clarityProjectId || "";
    const dlEntries = Object.entries(state.deeplinks?.links || {}).map(([k, v]) => \`\${k} \${v}\`).join("\\n");
    document.getElementById("f-deeplinks").value = dlEntries;
  }

  loadState();
  checkLiveHealth();
</script>
</body>
</html>`;
}

function applyConfigPayload(body) {
  const cfg = readJson(CONFIG_PATH, {});
  cfg.coupang = cfg.coupang || {};
  cfg.analytics = cfg.analytics || {};

  const rawIframe = String(body.coupangIframeRaw ?? "").trim();
  if (rawIframe) {
    const parsed = extractCoupangIframeUrl(rawIframe);
    if (!parsed) throw new Error("유효한 쿠팡 다이나믹 배너 URL(ads-partners.coupang.com)이 아닙니다.");
    cfg.coupang.iframeUrl = parsed;
  }

  const rawRedirect = String(body.coupangRedirectRaw ?? "").trim();
  if (rawRedirect) {
    const parsed = extractCoupangShortUrl(rawRedirect);
    if (!parsed) throw new Error("유효한 쿠팡 단축 링크(https://link.coupang.com/...)가 아닙니다.");
    cfg.coupang.redirectUrl = parsed;
  }

  const rawGa4 = String(body.ga4MeasurementId ?? "").trim();
  if (rawGa4) {
    const parsed = sanitizeGa4(rawGa4);
    if (!parsed) throw new Error("GA4 측정 ID 형식이 올바르지 않습니다 (예: G-XXXXXXXXXX).");
    cfg.analytics.ga4MeasurementId = parsed;
  }

  const rawClarity = String(body.clarityProjectId ?? "").trim();
  if (rawClarity) {
    const parsed = sanitizeSimpleId(rawClarity);
    if (!parsed) throw new Error("Clarity 프로젝트 ID 형식이 올바르지 않습니다.");
    cfg.analytics.clarityProjectId = parsed;
  }

  cfg.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");

  // Merge non-empty per-SKU official link.coupang.com lines (never wipe existing links on blank submit)
  const dlObj = readJson(DEEPLINKS_PATH, {
    schema_version: "1.0.0",
    description: "Official Coupang Partners short-link registry (https://link.coupang.com/a/...).",
    updated_at: cfg.updatedAt,
    links: {},
  });
  const mergedLinks = { ...(dlObj.links || {}) };
  const rawDeeplinks = String(body.deeplinksText ?? "").trim();
  if (rawDeeplinks) {
    for (const raw of rawDeeplinks.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length >= 2) {
        const slug = parts[0].trim();
        const shortUrl = extractCoupangShortUrl(parts[1]);
        if (/^[a-z0-9-]+$/.test(slug) && shortUrl) {
          mergedLinks[slug] = shortUrl;
        }
      }
    }
  }
  dlObj.updated_at = cfg.updatedAt;
  dlObj.links = mergedLinks;
  fs.writeFileSync(DEEPLINKS_PATH, JSON.stringify(dlObj, null, 2) + "\n", "utf8");

  return {
    summary: `배너=${cfg.coupang.iframeUrl ? "ON" : "미입력"}, GA4=${
      cfg.analytics.ga4MeasurementId || "미입력"
    }, Clarity=${cfg.analytics.clarityProjectId || "미입력"}, 개별쿠팡링크=${
      Object.keys(mergedLinks).length
    }건`,
  };
}

const server = http.createServer(async (req, res) => {
  const isPost = req.method === "POST";
  const sec = validateRequestSecurity(req, isPost);
  if (!sec.ok) {
    return sendJson(res, sec.status, { ok: false, error: sec.error });
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    const skuCount = loadAllKoCoupangExportLines().length;
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(renderHtml(skuCount));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, {
      config: readJson(CONFIG_PATH, {}),
      deeplinks: readJson(DEEPLINKS_PATH, { links: {} }),
      coupangExport: loadAllKoCoupangExportLines(),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/job") {
    return sendJson(res, 200, { job: activeJob });
  }

  if (req.method === "GET" && url.pathname === "/api/health-check") {
    const targets = [
      { label: "SpecMatrix 한국어", url: "https://kbu3986.github.io/specmatrix-global/ko/" },
      { label: "SpecMatrix English", url: "https://kbu3986.github.io/specmatrix-global/en/" },
      { label: "HomeTech TCO 스튜디오", url: "https://kbu3986.github.io/specmatrix-global/ko/tools/hometech-tco-studio/" },
      { label: "타이어 공기압 가드", url: "https://kbu3986.github.io/specmatrix-global/ko/tools/tire-pressure-guard/" },
      { label: "Pin2Pin Global", url: "https://kbu3986.github.io/pin2pin-global/en/" },
      { label: "통합 루트 허브", url: "https://kbu3986.github.io/ko/" },
    ];
    const results = await Promise.all(
      targets.map(async (t) => {
        const t0 = Date.now();
        try {
          const r = await fetch(t.url, { method: "HEAD", redirect: "manual" });
          return {
            ...t,
            ok: r.status === 200,
            status: `HTTP ${r.status}`,
            ms: Date.now() - t0,
          };
        } catch {
          return { ...t, ok: false, status: "ERR", ms: Date.now() - t0 };
        }
      })
    );
    return sendJson(res, 200, { results });
  }

  if (isPost && url.pathname === "/api/save-config") {
    try {
      const body = await readRequestBody(req);
      const out = applyConfigPayload(body);
      return sendJson(res, 200, { ok: true, ...out });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, error: e.message });
    }
  }

  if (isPost && url.pathname === "/api/save-and-deploy") {
    try {
      const body = await readRequestBody(req);
      applyConfigPayload(body);
      const started = runPowerShellCommand(
        "SpecMatrix 258p+ 빌드 · QA · 재배포 · IndexNow",
        "git add config/monetization-config.v2.json config/coupang-deeplinks.json; git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m 'chore(config): update monetization and analytics via Launchpad' }; npm run deploy:gh-pages; if ($LASTEXITCODE -eq 0) { npm run indexnow:submit }"
      );
      return sendJson(res, started.ok ? 200 : 409, started);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, error: e.message });
    }
  }

  if (isPost && url.pathname === "/api/action/fx") {
    try {
      await readRequestBody(req);
      const started = runPowerShellCommand("실시간 환율 갱신", "npm run fx:update");
      return sendJson(res, started.ok ? 200 : 409, started);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, error: e.message });
    }
  }

  if (isPost && url.pathname === "/api/action/indexnow") {
    try {
      await readRequestBody(req);
      const started = runPowerShellCommand("네이버·Bing IndexNow 제출", "npm run indexnow:submit");
      return sendJson(res, started.ok ? 200 : 409, started);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, error: e.message });
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`[SpecMatrix Launchpad] Running at http://${HOST}:${PORT}`);
});
