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

## Phase 2 — 데이터 비교 & 계획

- [ ] Data Compare (PK / Unique / 사용자 지정 키 기준 행 diff)
- [ ] Sync Planner (Diff → 적용 대상 선택 → SQL)
- [ ] 필터: WHERE 조건 / PK 범위 / 날짜 범위 / 특정 컬럼만
- [ ] Difference Review 모델 (적용/제외 체크, 건수 요약)

## Phase 3 — Dump / Restore / 안전장치

- [ ] Dump 엔진 (전체 / Schema만 / Data만 / 특정 테이블 / WHERE / 압축 gz·zip)
- [ ] Restore 엔진 (sql/gz/zip, DROP 후 복원 / 기존 유지 / 데이터만 / 스키마만)
- [ ] 동기화 전 자동 백업
- [ ] 안전장치: DELETE 포함 시 경고, Preview SQL

## Phase 4 — 운영 기능

- [ ] Task 추상화(저장·재실행)
- [ ] History (작업 기록, 재실행)
- [ ] Scheduler (예약 실행)
- [ ] 로깅 (실행 SQL / 에러 로그 저장)

## Phase 5 — GUI & 확장

- [ ] GUI (Electron 또는 Web) — 메인 화면(Origin/Target/연결 테스트/5대 기능)
- [ ] 스키마 확장 비교: Index / FK / Trigger / View / Procedure / Function / Event
- [ ] 타 DBMS 확장 여지 (PostgreSQL, Oracle) — 방언 계층 분리 전제
