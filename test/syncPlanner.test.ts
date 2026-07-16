import { describe, it, expect } from "vitest";
import { compareData } from "../src/compare/dataCompare.js";
import { buildSyncPlan, generatePlanSql } from "../src/sync/syncPlanner.js";
import { usersTable } from "./fixtures.js";

const table = usersTable();

const origin = [
  { id: 1, name: "홍길동", email: "a@x.com" }, // 동일
  { id: 2, name: "김철수", email: "NEW@x.com" }, // 변경
  { id: 4, name: "신규", email: "d@x.com" }, // 신규
];
const target = [
  { id: 1, name: "홍길동", email: "a@x.com" },
  { id: 2, name: "김철수", email: "b@x.com" },
  { id: 3, name: "삭제대상", email: "c@x.com" }, // target 에만
];

const diff = compareData("users", origin, target, ["id"]);

describe("buildSyncPlan", () => {
  it("upsert 는 added 를 insert, modified 를 update 로 계획한다", () => {
    const plan = buildSyncPlan(diff, { mode: "upsert" });
    expect(plan.summary).toEqual({ insert: 1, update: 1, delete: 0 });
    expect(plan.destructive).toBe(false);
  });

  it("insertOnly 는 added 만 계획한다", () => {
    const plan = buildSyncPlan(diff, { mode: "insertOnly" });
    expect(plan.summary).toEqual({ insert: 1, update: 0, delete: 0 });
  });

  it("includeDeletes=true 면 removed 를 delete 로 추가하고 destructive 로 표시한다", () => {
    const plan = buildSyncPlan(diff, { mode: "upsert", includeDeletes: true });
    expect(plan.summary.delete).toBe(1);
    expect(plan.destructive).toBe(true);
  });

  it("select 필터로 특정 행만 계획에 포함한다(Difference Review)", () => {
    // id=4 신규만 적용, 나머지 제외
    const plan = buildSyncPlan(diff, {
      mode: "upsert",
      select: (r) => r.key.id === 4,
    });
    expect(plan.summary).toEqual({ insert: 1, update: 0, delete: 0 });
  });

  it("overwrite 는 파인 경로에서 지원하지 않아 예외를 던진다", () => {
    expect(() => buildSyncPlan(diff, { mode: "overwrite" })).toThrow();
  });
});

describe("generatePlanSql", () => {
  it("INSERT→UPDATE→DELETE 순으로 SQL 을 생성한다", () => {
    const plan = buildSyncPlan(diff, { mode: "upsert", includeDeletes: true });
    const sql = generatePlanSql(plan, table);

    expect(sql[0]).toContain("INSERT INTO `users`");
    expect(sql[1]).toContain("UPDATE `users` SET");
    expect(sql[2]).toBe("DELETE FROM `users` WHERE `id` = 3;");
  });

  it("updateColumns 로 특정 컬럼만 UPDATE 한다", () => {
    const plan = buildSyncPlan(diff, { mode: "updateOnly" });
    const sql = generatePlanSql(plan, table, ["email"]);
    expect(sql[0]).toBe("UPDATE `users` SET `email` = 'NEW@x.com' WHERE `id` = 2;");
    expect(sql[0]).not.toContain("`name`");
  });
});
