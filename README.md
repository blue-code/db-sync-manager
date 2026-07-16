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
| GUI (Electron) — app/                                 |
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
| 데이터 비교 엔진 (행 단위 diff, 복합 키) | ✅ | `src/compare/dataCompare.ts` |
| Sync Planner (diff → 계획 → SQL) | ✅ | `src/sync/syncPlanner.ts` |
| 필터 (PK/날짜 범위, 특정 컬럼) | ✅ | `src/sync/filters.ts` |
| Dump 엔진 (DDL/데이터, 스키마·데이터·특정테이블, gzip) | ✅ | `src/dump/dumpGenerator.ts` |
| Restore (SQL 분리, 스키마/데이터만) | ✅ | `src/dump/restore.ts` |
| 동기화 전 자동 백업 | ✅ | `src/dump/backup.ts` |
| 안전장치 (DELETE 경고, Preview SQL) | ✅ | `src/sync/safety.ts` |
| Task 추상화 (저장·재실행, PW 미저장) | ✅ | `src/task/` |
| History (append-only JSONL) | ✅ | `src/history/` |
| Scheduler (interval/daily/weekly) | ✅ | `src/scheduler/schedule.ts` |
| 로깅 (실행 SQL/에러, 싱크 추상화) | ✅ | `src/logging/logger.ts` |
| GUI (Electron) — 메인 화면/연결 테스트/비교/History | ✅ | `app/` |

전 계층 순수 로직은 Vitest 로 검증한다(유닛 111개). 커넥터의 실 DB I/O 는
임베디드 MySQL 통합 테스트(7개)로 검증한다(`npm run test:it`).

### 데이터 동기화 두 경로

- **코스(coarse)**: `generateSyncSql({table, rows, mode})` — 테이블 전체를 한 모드로(overwrite 포함).
- **파인(fine)**: `compareData` → `buildSyncPlan` → `generatePlanSql` — 차이를 검토(적용/제외)한 뒤 선택 항목만 적용.

## 개발

```bash
npm install
npm test           # 유닛 테스트(순수 로직, 실 DB 불필요)
npm run test:watch # 워치 모드
npm run test:it    # 통합 테스트(실 MySQL, 아래 참고)
npm run typecheck  # 타입 검사
npm run build      # 라이브러리 dist 빌드
```

### 통합 테스트 (실 MySQL)

`npm run test:it` 은 `mysql-memory-server` 로 실제 MySQL 을 띄워 커넥터 I/O 를 검증한다.
Docker 불필요 — 최초 1회 MySQL 바이너리를 자동 다운로드한다(이후 캐시). 검증 범위:

- 접속(ping)·스키마 매핑(INFORMATION_SCHEMA)·행 조회·권한(SHOW GRANTS)
- 트랜잭션 실행과 **중간 실패 시 롤백**
- 데이터 비교 → 계획 → 실행 라운드트립(upsert)
- Dump → Restore 라운드트립(이스케이프 값 포함)

## GUI 실행 (Electron)

```bash
npm install        # electron 포함(postinstall 로 바이너리 다운로드)
npm run app:start  # app:build 후 Electron 실행
```

메인 화면에서 Origin/Target 접속 정보를 입력하고 **연결 테스트 → 비교(Analyze)** 를 수행한다.
비교는 양쪽 스키마를 읽어 테이블/컬럼 차이를 [=]/[+]/[-]/[*] 로 표시한다.

동기화·복원 등 **파괴적 작업은 미리보기(plan) → 실행(apply) 2단계**로만 동작한다.
미리보기에서 생성 SQL과 안전장치 경고(TRUNCATE/DELETE)를 확인하고, 위험 작업은
"위험을 이해했습니다" 체크 후에만 실행된다. 위험 동기화는 실행 전 Target 테이블을 자동 백업한다.

- ② 동기화: 테이블·모드(upsert/insertOnly/updateOnly/overwrite) 선택 → 미리보기 → 실행
- ③ Dump: 범위(스키마/데이터/전체)·압축 선택 → 미리보기 → 파일 저장
- ④ Restore: 덤프 파일 선택 → 미리보기 → (스키마/데이터만 선택) 복원

## 문서

- [개요 및 3단계 파이프라인](docs/spec/00-overview.md)
- [도메인 모델](docs/spec/01-domain-model.md)
- [Compare 엔진 스펙](docs/spec/02-compare-engine.md)
- [Sync 엔진 스펙](docs/spec/03-sync-engine.md)
- [데이터 비교 & 동기화 계획 스펙](docs/spec/04-data-sync-planning.md)
- [Dump / Restore / 안전장치 스펙](docs/spec/05-dump-restore-safety.md)
- [Task / History / Scheduler / 로깅 스펙](docs/spec/06-task-history-scheduler.md)
- [GUI (Electron) 스펙](docs/spec/07-gui.md)
- [로드맵](docs/roadmap.md)

## 라이선스

MIT
