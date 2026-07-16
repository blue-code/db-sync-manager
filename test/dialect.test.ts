import { describe, it, expect } from "vitest";
import { mysqlDialect, postgresDialect, dialectFor } from "../src/dialect/dialect.js";

describe("mysqlDialect", () => {
  it("백틱 식별자 + 백슬래시 이스케이프", () => {
    expect(mysqlDialect.quoteId("users")).toBe("`users`");
    expect(mysqlDialect.quoteValue("a'b")).toBe("'a\\'b'");
  });
});

describe("postgresDialect", () => {
  it("큰따옴표 식별자, 내부 따옴표는 이중화", () => {
    expect(postgresDialect.quoteId("users")).toBe('"users"');
    expect(postgresDialect.quoteId('we"ird')).toBe('"we""ird"');
  });

  it("문자열은 작은따옴표만 이중화(백슬래시는 리터럴)", () => {
    expect(postgresDialect.quoteValue("a'b")).toBe("'a''b'");
    expect(postgresDialect.quoteValue("c\\d")).toBe("'c\\d'"); // 백슬래시 그대로
  });

  it("불리언은 TRUE/FALSE, null 은 NULL", () => {
    expect(postgresDialect.quoteValue(true)).toBe("TRUE");
    expect(postgresDialect.quoteValue(false)).toBe("FALSE");
    expect(postgresDialect.quoteValue(null)).toBe("NULL");
  });

  it("유한하지 않은 숫자는 예외", () => {
    expect(() => postgresDialect.quoteValue(Infinity)).toThrow();
  });
});

describe("dialectFor", () => {
  it("이름으로 방언을 고른다(기본 mysql)", () => {
    expect(dialectFor("postgres").name).toBe("postgres");
    expect(dialectFor("mysql").name).toBe("mysql");
    expect(dialectFor("unknown").name).toBe("mysql");
  });
});
