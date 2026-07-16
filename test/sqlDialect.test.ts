import { describe, it, expect } from "vitest";
import { quoteId, quoteValue } from "../src/sync/sqlDialect.js";

describe("quoteId", () => {
  it("식별자를 백틱으로 감싸고 내부 백틱을 이중화한다", () => {
    expect(quoteId("users")).toBe("`users`");
    expect(quoteId("we`ird")).toBe("`we``ird`");
  });
});

describe("quoteValue", () => {
  it("null/undefined 는 NULL 로 변환한다", () => {
    expect(quoteValue(null)).toBe("NULL");
    expect(quoteValue(undefined)).toBe("NULL");
  });

  it("숫자/불리언을 리터럴로 변환한다", () => {
    expect(quoteValue(42)).toBe("42");
    expect(quoteValue(true)).toBe("1");
    expect(quoteValue(false)).toBe("0");
  });

  it("유한하지 않은 숫자는 예외를 던진다", () => {
    expect(() => quoteValue(Infinity)).toThrow();
    expect(() => quoteValue(NaN)).toThrow();
  });

  it("문자열의 따옴표/백슬래시를 이스케이프한다", () => {
    expect(quoteValue("a'b")).toBe("'a\\'b'");
    expect(quoteValue("c\\d")).toBe("'c\\\\d'");
  });

  it("Date 를 UTC 기준 문자열로 변환한다", () => {
    const d = new Date(Date.UTC(2026, 6, 15, 2, 3, 4));
    expect(quoteValue(d)).toBe("'2026-07-15 02:03:04'");
  });
});
