import { describe, it, expect } from "vitest";
import { compareSchema } from "../src/compare/schemaCompare.js";
import { isSchemaIdentical } from "../src/domain/diff.js";
import type { SchemaSnapshot, TableDef } from "../src/domain/types.js";

function table(over: Partial<TableDef> = {}): TableDef {
  return {
    name: "users",
    columns: [{ name: "id", dataType: "int", nullable: false, default: null, autoIncrement: true, position: 1 }],
    primaryKey: ["id"],
    indexes: [{ name: "PRIMARY", unique: true, columns: ["id"] }],
    foreignKeys: [],
    ...over,
  };
}

function snap(over: Partial<SchemaSnapshot> = {}): SchemaSnapshot {
  return { database: "db", tables: [table()], ...over };
}

describe("compareSchema — 인덱스", () => {
  it("Origin 에만 있는 인덱스는 added 로 표시하고 테이블을 modified 로 만든다", () => {
    const origin = snap({
      tables: [table({ indexes: [
        { name: "PRIMARY", unique: true, columns: ["id"] },
        { name: "idx_email", unique: false, columns: ["email"] },
      ] })],
    });
    const target = snap();
    const diff = compareSchema(origin, target);
    const t = diff.tables[0]!;
    expect(t.status).toBe("modified");
    expect(t.indexes.find((i) => i.name === "idx_email")?.status).toBe("added");
  });

  it("인덱스 유니크 속성이 다르면 modified", () => {
    const origin = snap({ tables: [table({ indexes: [{ name: "ix", unique: true, columns: ["a"] }] })] });
    const target = snap({ tables: [table({ indexes: [{ name: "ix", unique: false, columns: ["a"] }] })] });
    const diff = compareSchema(origin, target);
    expect(diff.tables[0]!.indexes.find((i) => i.name === "ix")?.status).toBe("modified");
  });
});

describe("compareSchema — 외래 키", () => {
  it("참조 대상이 다르면 modified", () => {
    const fk = (refTable: string) => ({ name: "fk1", columns: ["uid"], refTable, refColumns: ["id"] });
    const origin = snap({ tables: [table({ foreignKeys: [fk("users")] })] });
    const target = snap({ tables: [table({ foreignKeys: [fk("members")] })] });
    const diff = compareSchema(origin, target);
    expect(diff.tables[0]!.foreignKeys.find((f) => f.name === "fk1")?.status).toBe("modified");
    expect(diff.tables[0]!.status).toBe("modified");
  });
});

describe("compareSchema — DB 객체", () => {
  it("View/Procedure/Trigger/Event 의 추가·변경·삭제를 분류한다", () => {
    const origin = snap({
      views: [{ name: "v_active", definition: "select * from users where active=1" }],
      routines: [{ name: "sp_x", type: "PROCEDURE", definition: "BEGIN SELECT 1; END" }],
      triggers: [{ name: "trg_a", table: "users", timing: "BEFORE", event: "INSERT", statement: "SET NEW.x=1" }],
      events: [{ name: "ev_night", definition: "DO SELECT 1" }],
    });
    const target = snap({
      views: [{ name: "v_active", definition: "select *  from users   where active=1" }], // 공백만 다름 → identical
      routines: [{ name: "sp_x", type: "PROCEDURE", definition: "BEGIN SELECT 2; END" }], // 본문 변경
      // trg_a 없음 → removed
      events: [{ name: "ev_night", definition: "DO SELECT 1" }, { name: "ev_extra", definition: "DO SELECT 9" }], // ev_extra 는 target 전용
    });
    const diff = compareSchema(origin, target);
    const find = (n: string) => diff.objects.find((o) => o.name === n);

    expect(find("v_active")?.status).toBe("identical"); // 공백 정규화
    expect(find("sp_x")?.status).toBe("modified");
    expect(find("trg_a")?.status).toBe("added"); // origin 전용
    expect(find("ev_extra")?.status).toBe("removed"); // target 전용
    expect(find("v_active")?.kind).toBe("view");
    expect(find("trg_a")?.kind).toBe("trigger");
  });

  it("객체 차이가 있으면 isSchemaIdentical 은 false", () => {
    const origin = snap({ views: [{ name: "v", definition: "select 1" }] });
    const target = snap();
    expect(isSchemaIdentical(compareSchema(origin, target))).toBe(false);
  });

  it("테이블·객체 모두 동일하면 isSchemaIdentical 은 true", () => {
    expect(isSchemaIdentical(compareSchema(snap(), snap()))).toBe(true);
  });
});
