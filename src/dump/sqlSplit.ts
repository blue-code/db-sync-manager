/**
 * SQL 문 분리기(순수).
 *
 * 덤프/스크립트 텍스트를 개별 실행 문으로 나눈다.
 * 문자열/식별자 인용부 안의 세미콜론은 무시하고, 라인 주석(-- ...)은 건너뛴다.
 * DELIMITER 지시문을 지원해 프로시저/트리거 등 복합 본문을 한 문장으로 유지한다.
 */

/** i 위치가 라인 시작(파일 시작 또는 직전이 개행)인가. */
function atLineStart(sql: string, i: number): boolean {
  return i === 0 || sql[i - 1] === "\n";
}

/** 세미콜론(또는 DELIMITER 로 바뀐 종결자) 기준으로 문장을 나눈다. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let quote: "'" | '"' | "`" | null = null;
  let delim = ";";

  const flush = () => {
    const t = buf.trim();
    if (t) statements.push(t);
    buf = "";
  };

  for (let i = 0; i < sql.length; ) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (quote) {
      buf += ch;
      if (ch === "\\" && next !== undefined) {
        buf += next;
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (next === quote) {
          buf += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    // DELIMITER 지시문(라인 시작에서만): 종결자를 바꾸고 지시문 자체는 버린다.
    if (atLineStart(sql, i)) {
      const m = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(sql.slice(i));
      if (m) {
        flush(); // 지시문은 문장 경계에 온다.
        delim = m[1]!;
        i += m[0].length;
        continue;
      }
    }

    // 라인 주석: 줄 끝까지 스킵.
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      buf += ch;
      i += 1;
      continue;
    }

    // 현재 종결자와 일치하면 문장을 끊는다.
    if (sql.startsWith(delim, i)) {
      flush();
      i += delim.length;
      continue;
    }

    buf += ch;
    i += 1;
  }

  flush();
  return statements;
}
