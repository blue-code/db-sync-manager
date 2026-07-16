# DB Sync Manager

> MySQL/MariaDB 데이터베이스 **비교(Analyze) → 검토(Review) → 실행(Execute)** 3단계 동기화 관리 도구

단순 덤프 유틸리티가 아니라, 두 데이터베이스의 **구조와 데이터 차이를 계산**하고, 사용자가 **차이를 검토**한 뒤, 필요한 항목만 골라 **안전하게 동기화**하는 것을 목표로 한다.

---

## 핵심 설계 원칙

- **비교 → 검토 → 실행 파이프라인**: 어떤 동기화든 항상 차이를 먼저 계산하고, 미리보기 SQL을 확인한 뒤 실행한다.
- **순수 코어 엔진**: Compare/Sync 엔진은 DB 접속(I/O)을 하지 않는 순수 함수로 구성한다. 재현성과 테스트 용이성을 확보한다.
- **커넥터 분리(DDD)**: 실제 DB 접속은 `DbConnector` 포트 뒤로 숨긴다. 엔진은 인프라를 모른다.
- **안전 우선**: 삭제(TRUNCATE/DELETE)를 유발하는 모드는 사전 경고, 실행 전 자동 백업, 트랜잭션 롤백을 전제로 한다.

## 아키텍처

```
+------------------------------------------------------+
| GUI (예정: Electron / Web)                            |
+------------------------------------------------------+
| Compare Engine  — 스키마/데이터 diff (순수)          |
| Sync Engine     — Sync Planner / SQL Generator (순수)|
+------------------------------------------------------+
| History / Scheduler / Backup / Logging (예정)        |
+------------------------------------------------------+
| DbConnector (포트) → MySQL / MariaDB 구현 (예정)     |
+------------------------------------------------------+
```

## 현재 구현 범위 (v0.2 — 코어 엔진 + 실 DB 연동)

스펙 우선(SDD)으로 계약을 먼저 확정하고, DB 없이 검증 가능한 순수 코어부터 구현했다.
Phase 1 에서 mysql2 커넥터를 붙이되, 판단 로직(매핑·권한·트랜잭션)은 순수 모듈로 분리해 테스트한다.

| 영역 | 상태 | 위치 |
| --- | --- | --- |
| 도메인 타입 계약 | ✅ | `src/domain/types.ts` |
| 스키마 비교 엔진 | ✅ | `src/compare/schemaCompare.ts` |
| SQL 방언 유틸(인용/이스케이프) | ✅ | `src/sync/sqlDialect.ts` |
| Sync Mode 정의 (overwrite / insertOnly / updateOnly / upsert) | ✅ | `src/sync/syncMode.ts` |
| Sync SQL 생성기 | ✅ | `src/sync/sqlGenerator.ts` |
| DbConnector 포트 | ✅ | `src/connector/DbConnector.ts` |
| MySQL/MariaDB 커넥터 구현 (mysql2) | ✅ | `src/connector/mysqlConnector.ts` |
| INFORMATION_SCHEMA → 스냅샷 매핑 (순수) | ✅ | `src/connector/schemaMapper.ts` |
| 권한 검사 (SHOW GRANTS 파싱) | ✅ | `src/connector/privileges.ts` |
| Execution Engine (트랜잭션 + 롤백) | ✅ | `src/connector/transaction.ts` |
| 데이터 비교 엔진 | ⏳ | 예정 (Phase 2) |
| Dump/Restore, History, Scheduler, GUI | ⏳ | `docs/roadmap.md` |

전 계층 순수 로직은 Vitest 로 검증한다(현재 35개 통과). 커넥터의 I/O 배선만 실 DB 를 요구한다.

## 개발

```bash
npm install
npm test           # Vitest 1회 실행
npm run test:watch # 워치 모드
npm run typecheck  # 타입 검사
npm run build      # dist 빌드
```

## 문서

- [개요 및 3단계 파이프라인](docs/spec/00-overview.md)
- [도메인 모델](docs/spec/01-domain-model.md)
- [Compare 엔진 스펙](docs/spec/02-compare-engine.md)
- [Sync 엔진 스펙](docs/spec/03-sync-engine.md)
- [로드맵](docs/roadmap.md)

## 라이선스

MIT
