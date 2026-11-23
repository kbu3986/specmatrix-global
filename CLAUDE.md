# CLAUDE.md — SpecMatrix Global

작업 시작 전 루트 [AGENTS.md](./AGENTS.md)를 먼저 읽고 모든 규칙을 준수합니다.

## 핵심 절대 안전선 (요약)
- **실데이터 고증·YMYL 준수**: 공식 스펙·성분표 출처만 반영하며 가짜 ASIN·미승인 고정가·유료 벤치마크 대량 복제 금지.
- **공개 웹·운영 도구 분리**: 로컬 운영 도구(`ops/launchpad`)나 디버그 경로를 프로덕션 정적 사이트(`web/`)에 절대 노출 금지.
- **실물 게이트 통과 후 완료**: `npm run build:all`(`validate` + `test:pipeline` + `web:build` + `qa:stage6`) 통과 및 실물 확인 필수.
- **PUBLIC 비식별·비밀정보 0건**: API 키·토큰·`.env*`·로컬 절대경로·개인 신상정보를 절대 커밋하지 않습니다.
