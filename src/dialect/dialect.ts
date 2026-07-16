/**
 * SQL 방언 추상화(순수).
 *
 * 식별자 인용과 값 리터럴화는 DBMS 마다 다르다. 이 계층은 그 차이를 인터페이스로
 * 고정해, 향후 PostgreSQL/Oracle 확장의 진입점을 만든다.
 *
 * 주의: 현재 SQL 생성기·DDL·커넥터는 MySQL 전용이다. 이 방언 계층은 "값/식별자
 * 표기"만 추상화한 1차 기반이며, 완전한 타 DBMS 지원은 커넥터·매퍼·DDL 의
 * 방언 파라미터화가 추가로 필요하다(docs/spec/08-multi-dialect.md 참조).
 */

import {
  quoteId as mysqlQuoteId,
  quoteValue as mysqlQuoteValue,
  escapeString as mysqlEscapeString,
} from "../sync/sqlDialect.js";

export interface SqlDialect {
  readonly name: "mysql" | "mariadb" | "postgres";
  /** 식별자(테이블/컬럼명)를 인용한다. */
  quoteId(identifier: string): string;
  /** 값을 SQL 리터럴로 변환한다. */
  quoteValue(value: unknown): string;
}

/** MySQL/MariaDB: 백틱 식별자, 백슬래시 이스케이프(기존 동작). */
export const mysqlDialect: SqlDialect = {
  name: "mysql",
  quoteId: mysqlQuoteId,
  quoteValue: mysqlQuoteValue,
};

/** Date → 'YYYY-MM-DD HH:MM:SS' (UTC, 방언 공통). */
function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/**
 * PostgreSQL: 큰따옴표 식별자, 표준 SQL 문자열(작은따옴표 이중화).
 * standard_conforming_strings=on(PG 9.1+ 기본) 전제라 백슬래시를 특수 처리하지 않는다.
 */
export const postgresDialect: SqlDialect = {
  name: "postgres",
  quoteId(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
  },
  quoteValue(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`유한하지 않은 숫자: ${value}`);
      return String(value);
    }
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (value instanceof Date) return `'${formatDate(value)}'`;
    // 표준 SQL: 작은따옴표만 이중화(백슬래시는 리터럴 그대로).
    return `'${String(value).replace(/'/g, "''")}'`;
  },
};

export { mysqlEscapeString };

/** 이름으로 방언을 고른다. */
export function dialectFor(engine: string): SqlDialect {
  return engine === "postgres" ? postgresDialect : mysqlDialect;
}
