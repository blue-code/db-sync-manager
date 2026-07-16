import { describe, it, expect } from "vitest";
import { generateObjectSync } from "../src/sync/objectSync.js";
import type { SchemaSnapshot } from "../src/domain/types.js";

function snap(over: Partial<SchemaSnapshot> = {}): SchemaSnapshot {
  return { database: "db", tables: [], ...over };
}

describe("generateObjectSync", () => {
  it("Origin 전용 뷰는 CREATE 를 생성한다(added)", () => {
    const origin = snap({ views: [{ name: "v", definition: "select 1" }] });
    const sql = generateObjectSync(origin, snap());
    expect(sql).toEqual(["CREATE VIEW `v` AS select 1;"]);
  });

  it("Target 전용 뷰는 DROP 한다(removed)", () => {
    const target = snap({ views: [{ name: "v_old", definition: "select 1" }] });
    const sql = generateObjectSync(snap(), target);
    expect(sql).toEqual(["DROP VIEW IF EXISTS `v_old`;"]);
  });

  it("변경된 뷰는 DROP 후 CREATE 한다(modified)", () => {
    const origin = snap({ views: [{ name: "v", definition: "select 2" }] });
    const target = snap({ views: [{ name: "v", definition: "select 1" }] });
    const sql = generateObjectSync(origin, target);
    expect(sql).toEqual(["DROP VIEW IF EXISTS `v`;", "CREATE VIEW `v` AS select 2;"]);
  });

  it("삭제되는 루틴은 PROCEDURE/FUNCTION 종류를 구분해 DROP 한다", () => {
    const target = snap({
      routines: [{ name: "fn", type: "FUNCTION", definition: "x" }],
    });
    const sql = generateObjectSync(snap(), target);
    expect(sql).toEqual(["DROP FUNCTION IF EXISTS `fn`;"]);
  });

  it("전체 DDL 이 없는 루틴은 CREATE 를 건너뛴다", () => {
    const origin = snap({ routines: [{ name: "p", type: "PROCEDURE", definition: "body" }] });
    // createStatement 없음 → CREATE 불가, 통계상 added 지만 생성 스킵
    expect(generateObjectSync(origin, snap())).toEqual([]);
  });

  it("동일한 객체는 SQL 을 만들지 않는다", () => {
    const s = snap({ views: [{ name: "v", definition: "select 1" }] });
    expect(generateObjectSync(s, s)).toEqual([]);
  });
});
