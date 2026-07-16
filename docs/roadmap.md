# 로드맵

기획서의 전체 기능을 단계별 track 으로 분해한다. 각 단계는 스펙 → 테스트 → 구현(SDD·TDD) 순으로 진행한다.

## Phase 0 — 코어 엔진 (현재, v0.1) ✅

- [x] 도메인 타입 계약 (SchemaSnapshot / Diff)
- [x] Schema Compare (구조 diff, 결정론적)
- [x] SQL 방언 유틸 (인용/이스케이프)
- [x] Sync Mode 정의 + Sync SQL Generator (overwrite / insertOnly / updateOnly / upsert)
- [x] DbConnector 포트 정의

## Phase 1 — 실 DB 연동 ✅

- [x] MySQL/MariaDB 커넥터 구현 (mysql2 기반, `DbConnector` 구현체)
- [x] `INFORMATION_SCHEMA` → `SchemaSnapshot` 매핑 (순수, 테스트됨)
- [x] 연결 테스트(ping) / 권한 검사 (SHOW GRANTS 파싱 → Sync Mode별 필요 권한 대조)
- [x] Execution Engine (트랜잭션 + 실패 시 롤백, 가짜 커넥션으로 검증)

## Phase 2 — 데이터 비교 & 계획 ✅

- [x] Data Compare (PK / Unique / 사용자 지정 키 기준 행 diff, 복합 키)
- [x] Sync Planner (Diff → 적용 대상 선택 → SQL, INSERT/UPDATE/DELETE)
- [x] 필터: 동등/PK 범위 / 날짜 범위 / 특정 컬럼만(pickColumns)
- [x] Difference Review 모델 (select 적용/제외, 건수 요약, destructive 표시)

## Phase 3 — Dump / Restore / 안전장치 ✅ (zip 제외)

- [x] Dump 엔진 (전체 / Schema만 / Data만 / 특정 테이블 / 압축 gzip)
  - [x] 뷰/루틴/트리거 DDL 덤프·복원(SHOW CREATE·DELIMITER·DEFINER 제거, 실 DB 왕복 검증)
  - [ ] 이벤트 덤프 / WHERE 조건 덤프 / zip 압축(외부 의존성 없는 안전 구현 검토 필요)
- [x] Restore 엔진 (sql/gz, 데이터만 / 스키마만, DROP 후 복원은 덤프 옵션으로 지원)
- [x] 동기화 전 자동 백업 (buildBackupDump / createBackup, 기본 gzip)
- [x] 안전장치: DROP/TRUNCATE/DELETE 경고, Preview SQL, 확인 필요 판정

## Phase 4 — 운영 기능 ✅

- [x] Task 추상화(저장·재실행, 비밀번호 미저장)
- [x] History (작업 기록 append-only JSONL, id 재실행 조회)
- [x] Scheduler (interval/daily/weekly, nextRun 계산)
- [x] 로깅 (실행 SQL / 에러, LogSink 추상화 + RunLogger)

## Phase 5 — GUI & 확장 (진행 중)

- [x] GUI (Electron) — 메인 화면(Origin/Target/연결 테스트/비교/History)
  - [x] 코어 엔진 IPC 결선(testConnection/analyze/listHistory), contextIsolation + CSP
  - [x] Sync/Dump/Restore 화면 결선(plan→apply 2단계, 안전장치·Preview·자동 백업 반영)
  - [x] Difference Review 행 단위 적용/제외 UI(review→plan→apply, 선택 키 기반)
  - [x] Task 저장·불러오기·삭제 + Scheduler 예약(다음 실행 시각 표시)
    - [ ] 예약 자동 실행(무인) — 자격증명 보관 방식 확정 후(현재는 불러오기 후 수동 실행)
- [x] 스키마 확장 비교: Index / FK / View / Procedure / Function / Trigger / Event
      (compareSchema 확장 + 매퍼/쿼리 + 실 DB 통합 테스트)
- [x] 실 DB 통합 테스트 — 임베디드 MySQL(mysql-memory-server)로 커넥터 I/O·트랜잭션·
      동기화·덤프복원·확장 비교 검증(`npm run test:it`)
- [ ] zip 압축(외부 의존성 없는 안전 구현)
- [ ] 타 DBMS 확장 여지 (PostgreSQL, Oracle) — 방언 계층 분리 전제
