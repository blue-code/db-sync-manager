# 08. 다중 DBMS(방언) 확장 스펙 (Phase 5)

## 현재 상태 (정직한 범위)

- ✅ **방언 계층 기반**: `src/dialect/dialect.ts` — `SqlDialect` 인터페이스 +
  `mysqlDialect`(기존 동작) + `postgresDialect`(큰따옴표 식별자, 표준 SQL 문자열).
  값/식별자 표기 차이를 순수 함수로 추상화하고 유닛 테스트한다.
- ⏳ **완전한 PostgreSQL 커넥터는 미구현**. 이유는 아래 참조.

> 왜 여기까지인가: 검증할 PostgreSQL 서버가 없는 상태에서 반쪽짜리 PG 커넥터를
> 추가하면 (a) 검증 불가, (b) 안정적인 MySQL 경로까지 위험. 그래서 확실히 테스트
> 가능한 방언 표기 계층까지만 진행하고, 나머지는 아래 작업 목록으로 남긴다.

## 방언 차이 요약 (MySQL ↔ PostgreSQL)

| 항목 | MySQL/MariaDB | PostgreSQL |
| --- | --- | --- |
| 식별자 인용 | 백틱 `` `id` `` | 큰따옴표 `"id"` |
| 문자열 이스케이프 | 백슬래시 + `''` | `''` (표준, standard_conforming_strings) |
| 불리언 | 1/0 | TRUE/FALSE |
| 자동 증가 | `AUTO_INCREMENT` | `SERIAL` / `GENERATED ... AS IDENTITY` |
| 테이블 엔진 | `ENGINE=InnoDB` | 없음 |
| UPSERT | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT (...) DO UPDATE` |
| 스키마 메타 | `INFORMATION_SCHEMA` + `SHOW CREATE` | `INFORMATION_SCHEMA` + `pg_catalog` |
| 루틴/트리거 DDL | `SHOW CREATE` | `pg_get_functiondef` 등 |

## 완전 지원에 필요한 후속 작업

1. **드라이버**: `pg` 기반 `PostgresConnector`(`DbConnector` 구현). 접속/트랜잭션/실행.
2. **스키마 매퍼**: PostgreSQL `INFORMATION_SCHEMA`/`pg_catalog` → `SchemaSnapshot`.
   타입 표기 정규화(`integer` vs `int` 등), 시퀀스/IDENTITY 처리.
3. **DDL/SQL 생성기 방언화**: `ddlGenerator`/`sqlGenerator`/`objectDdl` 가
   `SqlDialect` 를 주입받도록 파라미터화(현재 MySQL 하드코딩).
   - UPSERT 분기(ON CONFLICT), AUTO_INCREMENT↔SERIAL, ENGINE 생략 등.
4. **덤프/복원**: `COPY`/`pg_dump` 호환 고려, DELIMITER 대신 `$$` 함수 본문.
5. **통합 테스트**: 임베디드/도커 PostgreSQL 로 커넥터 I/O 왕복 검증
   (MySQL 은 mysql-memory-server 로 검증 중 — PG 는 동급 수단 필요).

## 설계 원칙

- 방언 계층은 **표기(식별자/값)만** 담당하고, 문법 분기(UPSERT/DDL 형태)는
  생성기 내부에서 `dialect.name` 으로 갈라야 한다. 무리한 완전 추상화보다
  DBMS별 생성 경로를 명시적으로 두는 편이 유지보수에 유리하다.
