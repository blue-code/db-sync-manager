import { describe, it, expect } from "vitest";
import { compareData, valueEquals } from "../src/compare/dataCompare.js";

const origin = [
  { id: 1, name: "홍길동", email: "a@x.com" },
  { id: 2, name: "김철수", email: "b@x.com" }, // 변경 예정
  { id: 4, name: "신규", email: "d@x.com" }, // origin 에만
];
const target = [
  { id: 1, name: "홍길동", email: "a@x.com" }, // 동일
  { id: 2, name: "김철수", email: "OLD@x.com" }, // email 변경
  { id: 3, name: "삭제대상", email: "c@x.com" }, // target 에만
];

describe("compareData", () => {
  it("added/removed/modified/identical 을 정확히 분류한다", () => {
    const diff = compareData("users", origin, target, ["id"]);
    expect(diff.summary).toEqual({ added: 1, removed: 1, modified: 1, identical: 1 });
  });

  it("modified 행은 변경된 셀만 changes 에 담는다", () => {
    const diff = compareData("users", origin, target, ["id"]);
    const row2 = diff.rows.find((r) => r.key.id === 2);
    expect(row2?.status).toBe("modified");
    expect(row2?.changes).toEqual([
      { column: "email", origin: "b@x.com", target: "OLD@x.com" },
    ]);
  });

  it("added 는 originRow, removed 는 targetRow 를 보존한다", () => {
    const diff = compareData("users", origin, target, ["id"]);
    const added = diff.rows.find((r) => r.status === "added");
    const removed = diff.rows.find((r) => r.status === "removed");
    expect(added?.originRow).toMatchObject({ id: 4 });
    expect(removed?.targetRow).toMatchObject({ id: 3 });
  });

  it("복합 키를 지원한다", () => {
    const o = [{ a: 1, b: "x", v: 10 }];
    const t = [{ a: 1, b: "x", v: 99 }];
    const diff = compareData("t", o, t, ["a", "b"]);
    expect(diff.rows[0]!.status).toBe("modified");
    expect(diff.rows[0]!.key).toEqual({ a: 1, b: "x" });
  });

  it("키 컬럼이 없으면 예외를 던진다", () => {
    expect(() => compareData("t", [], [], [])).toThrow();
  });

  it("한쪽에 중복 키가 있으면 예외를 던진다", () => {
    const dup = [{ id: 1 }, { id: 1 }];
    expect(() => compareData("t", dup, [], ["id"])).toThrow(/중복/);
  });

  it("출력은 키 기준으로 정렬돼 결정론적이다", () => {
    const diff = compareData("users", origin, target, ["id"]);
    expect(diff.rows.map((r) => r.key.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("valueEquals", () => {
  it("null 과 undefined 를 동일 취급한다", () => {
    expect(valueEquals(null, undefined)).toBe(true);
  });
  it("Date 는 시간값으로 비교한다", () => {
    expect(valueEquals(new Date(0), new Date(0))).toBe(true);
    expect(valueEquals(new Date(0), new Date(1))).toBe(false);
  });
});
