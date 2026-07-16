import { describe, it, expect } from "vitest";
import { splitStatements } from "../src/dump/sqlSplit.js";

describe("splitStatements", () => {
  it("세미콜론으로 문장을 나눈다", () => {
    expect(splitStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("문자열 내부의 세미콜론은 무시한다", () => {
    const out = splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;");
    expect(out).toEqual(["INSERT INTO t VALUES ('a;b')", "SELECT 1"]);
  });

  it("이스케이프된 따옴표를 올바로 처리한다", () => {
    const out = splitStatements("INSERT INTO t VALUES ('O\\'Brien; Jr'); SELECT 1;");
    expect(out).toEqual(["INSERT INTO t VALUES ('O\\'Brien; Jr')", "SELECT 1"]);
  });

  it("연속 따옴표('') 리터럴을 처리한다", () => {
    const out = splitStatements("INSERT INTO t VALUES ('a''b;c'); SELECT 2;");
    expect(out).toEqual(["INSERT INTO t VALUES ('a''b;c')", "SELECT 2"]);
  });

  it("라인 주석을 건너뛴다", () => {
    const out = splitStatements("-- 헤더 주석\nSELECT 1;\n-- 꼬리\nSELECT 2;");
    expect(out).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("백틱 식별자 안의 세미콜론도 무시한다", () => {
    const out = splitStatements("SELECT `we;ird`; SELECT 3;");
    expect(out).toEqual(["SELECT `we;ird`", "SELECT 3"]);
  });
});
