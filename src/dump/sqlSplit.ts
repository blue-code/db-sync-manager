/**
 * SQL 문 분리기(순수).
 *
 * 덤프/스크립트 텍스트를 개별 실행 문으로 나눈다.
 * 문자열/식별자 인용부 안의 세미콜론은 무시하고, 라인 주석(-- ...)은 건너뛴다.
 * (프로시저 정의 등 DELIMITER 변경이 필요한 고급 문법은 후속 확장 대상)
 */

/** 세미콜론 기준으로 문장을 나누되 인용부를 존중한다. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let quote: "'" | '"' | "`" | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (quote) {
      buf += ch;
      // 이스케이프된 따옴표는 건너뛴다(\' 또는 '').
      if (ch === "\\" && next !== undefined) {
        buf += next;
        i++;
      } else if (ch === quote) {
        // '' 처럼 연속되면 리터럴 내부의 따옴표다.
        if (next === quote) {
          buf += next;
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }

    // 라인 주석: 줄 끝까지 스킵.
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      buf += ch;
      continue;
    }

    if (ch === ";") {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = "";
      continue;
    }

    buf += ch;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}
