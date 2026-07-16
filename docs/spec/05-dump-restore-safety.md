# 05. Dump / Restore / 안전장치 스펙 (Phase 3)

덤프·복원과 실행 전 안전장치. 텍스트 생성/분리/경고는 순수 함수, 파일·압축·접속만 I/O.

## Dump

- DDL: `src/dump/ddlGenerator.ts` — `buildCreateTable(table, {dropTable, ifNotExists})`
  - 컬럼(NULL/DEFAULT/AUTO_INCREMENT/COMMENT), PK, UNIQUE/일반 인덱스, ENGINE 렌더링
  - DEFAULT 규칙: 함수/키워드(CURRENT_TIMESTAMP 등)는 그대로, 숫자 무인용, 문자열 인용
- 조립: `src/dump/dumpGenerator.ts` — `generateDump(input, options, generatedAt?)`
  - `mode`: `schema` / `data` / `all`(기본)
  - `tables`: 특정 테이블만 / `dropTable`: DROP 선행(기본) / FK 검사 토글(기본)
  - 헤더 시각은 순수성 위해 외부 주입
- 파일명: `src/dump/filename.ts` — `autoDumpFilename(prefix, date, compression)` → `company_20260716.sql[.gz]`

## 압축 / 파일 I/O

`src/dump/dumpFile.ts` — `writeDumpFile` / `readDumpFile` / `detectCompression`

- 지원: `none`, `gzip`(Node 내장 zlib, 외부 의존성 없음)
- 확장자로 압축 자동 판별, 왕복(write→read) 정합성 테스트
- zip 은 외부 의존성 없이 안전 구현·검증이 필요해 후속 과제(로드맵)

## Restore

`src/dump/restore.ts` — `planRestore(sql, options)`(순수) / `restore(connector, config, sql, options)`

- SQL 분리: `src/dump/sqlSplit.ts` — 인용부(', ", `)·이스케이프·연속 따옴표·라인 주석 처리
- 옵션: `schemaOnly`(CREATE/DROP/ALTER) / `dataOnly`(INSERT/REPLACE), SET 제어문은 항상 유지
- 실행은 커넥터 트랜잭션에 위임(실패 시 롤백)

## 자동 백업

`src/dump/backup.ts` — `buildBackupDump`(순수 대상, 목 테스트) / `createBackup`(파일 저장)

- 위험 동기화 전에 Target 을 덤프로 보존. 기본 gzip 압축, 자동 파일명
- `buildBackupDump` 는 커넥터로 스키마/데이터만 읽어 텍스트 생성 → 목 커넥터로 검증 가능

## 안전장치

`src/sync/safety.ts`

- `analyzeStatements(statements)` — DROP/TRUNCATE/DELETE 를 danger 로 집계(건수 포함)
- `analyzePlan(plan)` — 계획의 DELETE 건수로 경고
- `confirmationRequired(warnings)` — danger 존재 시 사용자 확인 필요
- `previewSql(statements)` — 실행 전 미리보기(복사/저장용)

권장 실행 순서: **Preview → 안전장치 경고 → (위험 시) 자동 백업 → 트랜잭션 실행**.
