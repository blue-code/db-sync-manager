import { describe, it, expect } from "vitest";
import {
  analyzeStatements,
  analyzePlan,
  confirmationRequired,
  previewSql,
} from "../src/sync/safety.js";
import type { SyncPlan } from "../src/sync/syncPlanner.js";

describe("analyzeStatements", () => {
  it("DELETE/TRUNCATE/DROP 를 danger 로 집계한다", () => {
    const w = analyzeStatements([
      "INSERT INTO t VALUES (1)",
      "DELETE FROM t WHERE id = 1",
      "DELETE FROM t WHERE id = 2",
      "TRUNCATE TABLE t",
    ]);
    const del = w.find((x) => x.code === "DELETE");
    expect(del?.count).toBe(2);
    expect(del?.severity).toBe("danger");
    expect(w.find((x) => x.code === "TRUNCATE")?.count).toBe(1);
  });

  it("파괴적 문이 없으면 경고가 없다", () => {
    expect(analyzeStatements(["INSERT INTO t VALUES (1)"])).toEqual([]);
  });
});

describe("analyzePlan", () => {
  const base: Omit<SyncPlan, "summary" | "destructive"> = {
    table: "users",
    mode: "upsert",
    operations: [],
  };

  it("DELETE 가 포함된 계획은 danger 경고를 낸다", () => {
    const plan: SyncPlan = {
      ...base,
      summary: { insert: 1, update: 0, delete: 3 },
      destructive: true,
    };
    const w = analyzePlan(plan);
    expect(w).toHaveLength(1);
    expect(w[0]!.count).toBe(3);
    expect(confirmationRequired(w)).toBe(true);
  });

  it("DELETE 가 없으면 확인 불필요", () => {
    const plan: SyncPlan = {
      ...base,
      summary: { insert: 1, update: 2, delete: 0 },
      destructive: false,
    };
    expect(analyzePlan(plan)).toEqual([]);
    expect(confirmationRequired([])).toBe(false);
  });
});

describe("previewSql", () => {
  it("문장을 줄바꿈으로 연결한다", () => {
    expect(previewSql(["A;", "B;"])).toBe("A;\nB;");
  });
});
