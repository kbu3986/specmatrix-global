# SpecMatrix Global — Cross-AI Project Instructions (SSOT)

이 문서는 `specmatrix-global` 저장소의 단일 정본 지시서입니다. Claude Code, Codex, Cursor, Gemini CLI 등 모든 AI 에이전트는 작업 전 이 규칙을 따릅니다.

## 1. 프로젝트 개요 및 스택
- **목표**: 공식 스펙·영양성분표·항공사 규정·전기요금 실데이터 교차검증 기반 다국어 하이엔텐트 구매 비교·계산기 매트릭스 공장(WattCheck·PureGram·CycleGear·HomeTech 4대 버티컬).
- **기술 스택**: Node.js ESM 데이터 검증 파이프라인(`pipeline/`, Zod v3) · Astro 5 순수 HTML SSG(`web/`, Tailwind CSS v4, TypeScript) · 배포/로컬 운영 도구(`ops/`).
- **필독 문서**: 마스터 아키텍처·리스크 기준 변경 전 `docs/01-MASTER-PLAN.md`~`docs/05-RISK-AND-KPI-AUDIT.md`를 먼저 확인합니다.

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
1. **Astro 5 순수 HTML SSG 유지** – 대규모 정적 배포 파일 수 한도를 준수하기 위해 Astro 5 순수 정적 HTML 구조를 유지합니다.
2. **원본 데이터 고증 및 중복 방지** – 공식 제조사 스펙시트·영양성분표·규정 PDF 등 검증된 출처만 반영하고 AI 필러 생성을 금지합니다. 기존 별도 계산기 사이트와 키워드·제품 카니발리제이션을 피합니다.
3. **글로벌 제휴·법규 준수** – 가짜/복붙 ASIN과 API 미승인 고정가 표기를 금지합니다(`msrp_benchmark_mode` 분리). EU(`de`/`es`) 확장 전 Google CMP와 독일 `Impressum`을 필수 탑재합니다.
4. **YMYL·저작권 안전선** – 보충제·건강 관련 콘텐츠는 성분표 기반 객관적 팩트만 기재하며 의혹 제기나 과장 표현을 금지합니다. 유료 벤치마크 사이트 수치의 대량 복제를 금지합니다.
5. **공개 웹·운영 도구 분리** – 로컬 전용 운영 GUI(`ops/launchpad`)와 디버그 도구는 프로덕션 `web/` 산출물에 절대 포함·노출하지 않습니다.

## 4. 공통 AI 협업·출력·실물 검증 원칙
- **소통·형식** – 한국어 존댓말을 사용하며 **설명 → `### 결론` → `### 다음 확인 사항`(2개)** 구조, 1단락 1–2문장, 클릭 가능한 마크다운 링크, 3개 이상 비교 시 표를 유지합니다.
- **자율 완결·병렬화** – 구현·테스트·배포·임시 서버 정리까지 끝까지 완결하며, 대량 스펙 리서치·교차검증·다국어 QA는 병렬 에이전트/서브태스크로 처리합니다.
- **실물 E2E 검증** – `npm run build:all` 통과와 실제 페이지 렌더링·HTTP 200·콘솔 0에러·실데이터 반영을 확인한 뒤 완료를 선언합니다.
- **직설 판정·무홍보 SEO** – 오류는 1줄 인정 후 즉시 수정하며, 커뮤니티 수동 홍보 대신 기술적 SEO·사이트맵·색인·정보이득 확장에 집중합니다.

## 5. 절대 안전선
- **비밀정보·비식별 엄수**: PUBLIC 저장소이므로 API 키·토큰·`.env*`·실명·직장명·로컬 절대경로를 0바이트로 유지합니다.
- **외부 게시 및 과금 확인**: 소유 저장소 배포는 자율 진행하되 외부 커뮤니티·SNS 신규 게시, 유료 API·과금 신설, 제휴/광고 본진 계정 약관 리스크는 반드시 사전 확인합니다.
