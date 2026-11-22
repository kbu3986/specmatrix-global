# SpecMatrix Global — Antigravity Workspace Rules

이 프로젝트(`specmatrix-global`)에서 작업하는 모든 에이전트는 아래 핵심 규칙과 교차감사 확정 기준을 최우선으로 준수합니다.

## 1. 프로젝트 정체성 및 마스터 문서
- **목표**: 실데이터 교차검증 기반 5개국어(EN/KO/JA/DE/ES) 하이엔텐트 구매 비교·계산기 매트릭스 공장 구축.
- **필독 문서**: 작업 착수 전 `docs/01-MASTER-PLAN.md`–`docs/05-RISK-AND-KPI-AUDIT.md`를 먼저 확인합니다.

## 2. 교차감사 확정 필수 기술·운영 규칙 (`05-RISK-AND-KPI-AUDIT.md` 반영)
1. **기존 제국 중복 금지** – 기존 `ssalmeok-empire`(889p)와 키워드·제품 카니발리제이션을 피하기 위해 Phase 1 파일럿은 기존 자산과 0퍼센트 겹치는 신규 60종 × EN/KO 2개국어(200p)부터 시작합니다.
2. **SSG 빌드 엔진 제약 준수** – Cloudflare Pages 20,000파일 상한 초과를 막기 위해 Next.js Static Export 대량 빌드 대신 **Astro 5 순수 HTML SSG** 또는 **OpenNext/Cloudflare Workers ISR** 구조를 적용합니다.
3. **글로벌 제휴·법규 준수** – 가짜/복붙 ASIN 및 API 미승인 고정가 표기를 금지합니다(`msrp_benchmark_mode` 분리). 아마존 해외 리전은 클릭 임계치 달성 후 순차 가입하며, EU(`de`/`es`) 오픈 전 Google CMP 및 독일 `Impressum`을 필수 탑재합니다.
4. **YMYL·저작권 안전선** – 보충제 원재료는 의혹 제기가 아닌 객관적 성분표 팩트만 기재하며, 유료 벤치마크(BRR·ChargerLAB 등) 수치 대량 복제를 금지합니다.
5. **스웜 최우선 병렬화** – 대량 제품 스펙 리서치, 적대적 팩트체크, SERP 정보이득 감사, 5개국어 현지화 및 QA는 반드시 `swarm`으로 병렬 처리합니다.
