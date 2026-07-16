import { describe, it, expect } from "vitest";
import {
  rangeFilter,
  dateRangeFilter,
  equalsFilter,
  and,
  applyFilter,
  pickColumns,
} from "../src/sync/filters.js";

const rows = [
  { id: 1000, status: "READY", created_at: "2024-06-01 00:00:00" },
  { id: 3000, status: "DONE", created_at: "2025-03-01 00:00:00" },
  { id: 6000, status: "READY", created_at: "2025-12-01 00:00:00" },
];

describe("rangeFilter", () => {
  it("PK 범위(경계 포함)로 거른다", () => {
    const out = applyFilter(rows, rangeFilter("id", { min: 1000, max: 5000 }));
    expect(out.map((r) => r.id)).toEqual([1000, 3000]);
  });
  it("min 만 주면 하한만 적용한다", () => {
    const out = applyFilter(rows, rangeFilter("id", { min: 3000 }));
    expect(out.map((r) => r.id)).toEqual([3000, 6000]);
  });
});

describe("dateRangeFilter", () => {
  it("날짜 범위로 거른다", () => {
    const out = applyFilter(
      rows,
      dateRangeFilter("created_at", { from: "2025-01-01", to: "2025-06-30" }),
    );
    expect(out.map((r) => r.id)).toEqual([3000]);
  });
});

describe("and / equalsFilter", () => {
  it("여러 조건을 AND 결합한다", () => {
    const out = applyFilter(
      rows,
      and(equalsFilter("status", "READY"), rangeFilter("id", { min: 5000 })),
    );
    expect(out.map((r) => r.id)).toEqual([6000]);
  });
});

describe("pickColumns", () => {
  it("키 컬럼은 유지하고 지정 컬럼만 남긴다(특정 컬럼 동기화)", () => {
    const out = pickColumns(rows, ["status"], ["id"]);
    expect(out[0]).toEqual({ id: 1000, status: "READY" });
    expect(out[0]).not.toHaveProperty("created_at");
  });
});
