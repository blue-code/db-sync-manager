/**
 * SQL 방언 유틸.
 *
 * MySQL/MariaDB 공통으로 백틱 식별자 인용과 리터럴 이스케이프를 담당한다.
 * SQL 인젝션/문법 오류를 한 곳에서 통제하기 위해 값 포매팅을 여기로 모은다.
 */

/** 식별자(테이블/컬럼명)를 백틱으로 감싼다. 내부 백틱은 이중화한다. */
export function quoteId(identifier: string): string {
  return "`" + identifier.replace(/`/g, "``") + "`";
}

/**
 * 값을 SQL 리터럴로 변환한다.
 * - null/undefined → NULL
 * - number/bigint  → 그대로(유한값만 허용)
 * - boolean        → 1/0
 * - Date           → 'YYYY-MM-DD HH:MM:SS'
 * - 그 외          → 문자열로 취급하고 작은따옴표+이스케이프
 */
export function quoteValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`유한하지 않은 숫자는 리터럴로 만들 수 없다: ${value}`);
    }
    return String(value);
  }

  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${formatDate(value)}'`;

  return `'${escapeString(String(value))}'`;
}

/** 문자열 리터럴 이스케이프(작은따옴표, 백슬래시, 제어문자). */
export function escapeString(input: string): string {
  return input.replace(/[\0\n\r\b\t\x1a'"\\]/g, (ch) => {
    switch (ch) {
      case "\0":
        return "\\0";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\b":
        return "\\b";
      case "\t":
        return "\\t";
      case "\x1a":
        return "\\Z";
      case "'":
        return "\\'";
      case '"':
        return '\\"';
      case "\\":
        return "\\\\";
      default:
        return ch;
    }
  });
}

/** Date → 'YYYY-MM-DD HH:MM:SS' (UTC 기준으로 결정론적 포맷). */
function formatDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}
