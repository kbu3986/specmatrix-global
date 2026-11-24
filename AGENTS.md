# SpecMatrix Global — Cross-AI Project Instructions (SSOT)

이 문서는 `specmatrix-global` 공개 저장소의 **100% 독립 완결형 단일 정본(SSOT) 지시서**입니다. Claude Code, Codex, Cursor, Gemini CLI, Antigravity 등 모든 AI 에이전트는 외부 별도 지시서 없이 이 문서만으로 작업 규칙을 준수합니다.

## 1. 프로젝트 개요 및 스택
- **목표** – 공식 스펙·영양성분표·항공사 규정·전기요금 실데이터 교차검증 기반 다국어 하이엔텐트 구매 비교·계산기 매트릭스 공장(WattCheck·PureGram·CycleGear·HomeTech 4대 버티컬).
- **기술 스택** – Node.js ESM 데이터 검증 파이프라인(`pipeline/`, Zod v3) · Astro 5 순수 HTML SSG(`web/`, Tailwind CSS v4, TypeScript) · 배포/로컬 운영 도구(`ops/`).
- **필독 문서** – 마스터 아키텍처·리스크 기준 변경 전 [`docs/01-MASTER-PLAN.md`](./docs/01-MASTER-PLAN.md)~[`docs/05-RISK-AND-KPI-AUDIT.md`](./docs/05-RISK-AND-KPI-AUDIT.md)를 먼저 확인합니다.

## 2. 필수 명령어
```bash
npm run validate         # Golden JSON 스키마 + 서킷브레이커 검증
npm run test:pipeline    # 파이프라인 단위 테스트 실행
npm run web:build        # OG 생성 → Astro 5 SSG 빌드 → 검색 인덱스 → 사이트맵
npm run qa:stage6        # Stage 6 정적 HTML·링크·SEO QA 게이트
npm run build:all        # validate + test:pipeline + web:build + qa:stage6 통합 실행
npm run audit:ig         # SERP 정보이득(Information Gain) 감사
npm run health:links     # 외부 인용 링크 0-404 헬스 체크
npm run deploy:gh-pages  # GitHub Pages 프로덕션 배포
```

## 3. 도메인 필수 기술·운영 규칙
1. **Astro 5 순수 HTML SSG 유지** – 대규모 정적 배포 파일 수 한도(20,000개 미만)를 준수하기 위해 Astro 5 순수 정적 HTML 구조를 유지합니다.
2. **실데이터 근거(Evidence-Anchored) 고증 및 중복 방지** – 공식 제조사 스펙시트·영양성분표·항공사 규정 PDF 등 검증된 1차 출처만 반영하며 AI 필러 생성을 금지합니다. 기존 별도 계산기 사이트와 키워드·제품 카니발리제이션을 피합니다.
3. **글로벌 제휴·법규 준수 (iHerb 금지 포함)** – **iHerb 제휴·구매 링크 삽입을 영구 금지**합니다. 가짜/복붙 ASIN과 API 미승인 고정가 표기를 금지하며(`msrp_benchmark_mode` 분리), 모든 제휴 아웃바운드 링크에 `rel="sponsored nofollow noopener"`와 제휴 고지를 필수 표기합니다. EU(`de`/`es`) 확장 전 Google CMP와 독일 `Impressum`을 필수 탑재합니다.
4. **YMYL·저작권 안전선** – 보충제·건강(PureGram) 콘텐츠는 영양성분표 기반 객관적 팩트만 기재하며 의혹 제기·과장·의학적 진단 표현을 금지합니다. 유료 벤치마크 사이트 수치의 대량 복제를 금지합니다.
5. **공개 웹·운영 도구 분리 (Launchpad 차단)** – 로컬 전용 운영 GUI(`ops/launchpad`)와 디버그·관리 도구는 프로덕션 공개 빌드(`web/`, `web/dist/`)에 절대 포함·노출하지 않습니다.

## 4. 크로스-AI 공통 협업·실행·출력 원칙
### 응답 형식 및 소통
- **한국어 존댓말·고정 구조** – 항상 자연스러운 한국어 존댓말로 답하며 **설명 → `### 결론` → `### 다음 확인 사항`(2개)** 구조를 유지합니다(단순 확인·완전 종결 응답에서는 `### 다음 확인 사항` 생략 가능).
- **간결한 마크다운 규칙** – `###` / `####` 제목으로 섹션을 나누고 1단락 1–2문장, 한 줄 불릿(`- **키워드** – 요약`), 3개 이상 비교 시 마크다운 표, 파일·URL은 클릭 가능한 마크다운 링크를 사용합니다(한글 기울임꼴·취소선·과도한 느낌표 금지).
- **직설 판정 및 오류 처리** – 아부나 모호한 완곡어 대신 명확한 **Go / Pivot / Kill** 판정을 제시하며, 오류가 발생하면 변명 없이 1줄로 인정하고 즉시 수정합니다.

### 자율 완결 및 병렬/스웜 우선 실행
- **자율 완결(End-to-End)** – 로그인·패스키·CAPTCHA·결제·권한 승인 프롬프트를 제외하고 수동 작업을 떠넘기지 않으며, 구현·검증·배포·임시 서버/프로세스 정리까지 끝까지 완결합니다.
- **병렬·스웜 실행 우선** – 다중 파일 수정, 대량 스펙 리서치·크롤링·교차검증, 다국어 QA 및 복합 구현·감사는 순차 처리 대신 **병렬 에이전트·스웜(`/swarm`)·서브에이전트 팬아웃을 우선 적용**합니다.

### 실물 E2E 검증 및 사실성·순수 SEO
- **실물 E2E 검증 필수** – 빌드 성공이나 `Exit Code 0`만으로 완료를 선언하지 않습니다. `npm run build:all`(`validate` + `test:pipeline` + `web:build` + `qa:stage6`) 통과와 함께 실제 페이지 렌더링, 라이브 URL `HTTP 200`, 브라우저 콘솔 0에러, 실데이터 반영을 직접 확인한 뒤 완료를 보고합니다.
- **출처 고증 및 순수 기술 SEO** – 공식 스펙 1차 출처만 반영하고 AI 필러를 배제하며, 외부 커뮤니티 홍보·스팸 대신 기술적 SEO(메타데이터·사이트맵·hreflang·구조화 데이터·정보이득 확장)에 집중합니다.

## 5. 4대 절대 안전선
1. **공개 웹·운영 도구 분리 및 PUBLIC 0바이트 PII/비밀정보** – 프로덕션 공개 빌드에 `ops/launchpad`·디버그 경로를 절대 포함하지 않습니다. PUBLIC 저장소에는 개인 실명·소속·거주지·로컬 절대경로·API 키·토큰·`.env*`를 0바이트로 유지합니다.
2. **100% 익명화·비식별 원칙** – 문서·데이터·로그·UI 어디에도 개인 식별 정보나 민감정보를 노출하지 않고 100% 비식별 처리합니다.
3. **소유 저장소 배포 자율 vs 외부 게시 사전 승인** – 소유 저장소 커밋·GitHub Pages 배포는 자율 완결하되, 외부 커뮤니티·SNS·제3자 플랫폼 신규 게시는 반드시 사전 승인 후 진행합니다(CAPTCHA 우회 영구 금지).
4. **유료 API·과금·계정 약관 리스크 사전 승인** – 유료 API 도입, 과금·결제 발생, 제휴/광고 본진 계정 약관 리스크가 있는 작업은 실행 전 반드시 사전 확인을 받습니다.
