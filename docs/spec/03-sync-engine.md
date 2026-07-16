# 03. Sync 엔진 스펙

구현: `src/sync/*.ts` · 테스트: `test/sqlGenerator.test.ts`, `test/sqlDialect.test.ts`

## Sync Mode (기획 A~F 데이터 전략)

`src/sync/syncMode.ts`

| Mode | 의미 | 생성 SQL |
| --- | --- | --- |
| `overwrite` | 데이터만 덮어쓰기 | `TRUNCATE` → 일괄 `INSERT` |
| `insertOnly` | 신규 데이터만 추가 | `INSERT IGNORE` (기존 행 보존) |
| `updateOnly` | 변경 데이터만 갱신 | PK 기준 행별 `UPDATE` |
| `upsert` | INSERT + UPDATE | `INSERT ... ON DUPLICATE KEY UPDATE` |

- `mayDeleteRows(mode)` : `overwrite` 만 `true`(TRUNCATE 로 기존 행 제거). 안전장치 경고에 사용.
- 전체/테이블 단위 덮어쓰기(A/B)는 상위 오케스트레이션에서 `DROP`+`CREATE`+`overwrite` 조합으로 구성한다.

## generateSyncSql({ table, rows, mode }) → string[]

미리보기 가능한 SQL 문 배열을 생성하는 순수 함수.

### 계약

- `rows` 가 비면 `[]` 반환 → 불필요한 `TRUNCATE` 생성 방지
- `updateOnly` / `upsert` 는 PK 필수 → PK 없으면 예외
- 컬럼 없는 테이블은 예외
- `upsert` 의 SET 절은 **비 PK 컬럼만** 포함(`id = VALUES(id)` 생성 안 함)

## SQL 방언 유틸

`src/sync/sqlDialect.ts`

- `quoteId` : 백틱 인용, 내부 백틱 이중화
- `quoteValue` : null→`NULL`, 숫자/불리언, Date→`'YYYY-MM-DD HH:MM:SS'`(UTC), 문자열 이스케이프
- 유한하지 않은 숫자(`Infinity`/`NaN`)는 예외
- 값 포매팅을 한곳에 모아 인젝션/문법 오류를 통제

## 실행/트랜잭션

구현: `src/connector/transaction.ts` · 테스트: `test/transaction.test.ts`

`runInTransaction(conn, statements)` 은 생성된 문장을 `BEGIN … COMMIT` 으로 감싸고,
중간 실패 시 `ROLLBACK` 후 원인 에러를 전파한다.

- 빈 배열은 트랜잭션을 열지 않는다.
- 커넥션은 `TxConnection` 포트로 추상화 → mysql2 커넥션이 이를 만족하고, 테스트는 가짜 커넥션으로 대체.

위험 모드(overwrite)의 실행 전 Target 자동 백업(Dump)은 Phase 3 에서 연결한다.

## 권한 검사

구현: `src/connector/privileges.ts` · 테스트: `test/privileges.test.ts`

`SHOW GRANTS` 결과를 파싱(`parseGrants`)해 보유 권한 집합을 만들고,
`requiredPrivilegesForMode(mode)` 와 대조(`checkPrivileges`)해 부족 권한을 계산한다.
`ALL PRIVILEGES` 는 모든 권한을 포함하는 것으로 처리한다.
