import { describe, it, expect } from "vitest";
import { autoDumpFilename, extensionFor } from "../src/dump/filename.js";

// 2026-07-16 (로컬). 월은 0-based 이므로 6 = 7월.
const date = new Date(2026, 6, 16, 10, 0, 0);

describe("autoDumpFilename", () => {
  it("prefix_YYYYMMDD.sql 형식을 만든다", () => {
    expect(autoDumpFilename("company", date)).toBe("company_20260716.sql");
  });

  it("gzip 은 .sql.gz 확장자를 붙인다", () => {
    expect(autoDumpFilename("backup", date, "gzip")).toBe("backup_20260716.sql.gz");
  });

  it("파일명에 부적합한 문자는 _ 로 치환한다", () => {
    expect(autoDumpFilename("my db:1", date)).toBe("my_db_1_20260716.sql");
  });
});

describe("extensionFor", () => {
  it("압축 방식별 확장자를 돌려준다", () => {
    expect(extensionFor("none")).toBe(".sql");
    expect(extensionFor("gzip")).toBe(".sql.gz");
  });
});
