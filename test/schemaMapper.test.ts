import { describe, it, expect } from "vitest";
import { buildSnapshot } from "../src/connector/schemaMapper.js";
import type {
  RawColumnRow,
  RawIndexRow,
  RawTableRow,
} from "../src/connector/informationSchema.js";

const tableRows: RawTableRow[] = [
  { TABLE_NAME: "users", ENGINE: "InnoDB", TABLE_COLLATION: "utf8mb4_general_ci" },
];

const columnRows: RawColumnRow[] = [
  {
    TABLE_NAME: "users",
    COLUMN_NAME: "id",
    COLUMN_TYPE: "INT",
    IS_NULLABLE: "NO",
    COLUMN_DEFAULT: null,
    EXTRA: "auto_increment",
    ORDINAL_POSITION: 1,
    COLUMN_COMMENT: "",
  },
  {
    TABLE_NAME: "users",
    COLUMN_NAME: "email",
    COLUMN_TYPE: "VARCHAR(100)",
    IS_NULLABLE: "YES",
    COLUMN_DEFAULT: null,
    EXTRA: "",
    ORDINAL_POSITION: 2,
    COLUMN_COMMENT: "이메일",
  },
];

const indexRows: RawIndexRow[] = [
  { TABLE_NAME: "users", INDEX_NAME: "PRIMARY", NON_UNIQUE: 0, SEQ_IN_INDEX: 1, COLUMN_NAME: "id" },
  { TABLE_NAME: "users", INDEX_NAME: "uq_email", NON_UNIQUE: 0, SEQ_IN_INDEX: 1, COLUMN_NAME: "email" },
];

function build(over: Partial<Parameters<typeof buildSnapshot>[1]> = {}) {
  return buildSnapshot("app", { tables: tableRows, columns: columnRows, indexes: indexRows, ...over });
}

describe("buildSnapshot", () => {
  it("컬럼 타입을 소문자로 정규화하고 auto_increment 를 인식한다", () => {
    const snap = build();
    const users = snap.tables[0]!;

    expect(users.columns[0]).toMatchObject({
      name: "id",
      dataType: "int",
      nullable: false,
      autoIncrement: true,
    });
    expect(users.columns[1]!.dataType).toBe("varchar(100)");
    expect(users.columns[1]!.nullable).toBe(true);
  });

  it("빈 코멘트는 담지 않고 값이 있으면 담는다", () => {
    const snap = build();
    const [id, email] = snap.tables[0]!.columns;
    expect(id!.comment).toBeUndefined();
    expect(email!.comment).toBe("이메일");
  });

  it("PRIMARY 인덱스에서 PK 컬럼을 도출한다", () => {
    const snap = build();
    expect(snap.tables[0]!.primaryKey).toEqual(["id"]);
  });

  it("인덱스를 INDEX_NAME 기준으로 묶고 UNIQUE 를 판정한다", () => {
    const snap = build();
    const uq = snap.tables[0]!.indexes.find((i) => i.name === "uq_email");
    expect(uq).toEqual({ name: "uq_email", unique: true, columns: ["email"] });
  });

  it("복합 인덱스는 SEQ 순서대로 컬럼을 모은다", () => {
    const composite: RawIndexRow[] = [
      { TABLE_NAME: "users", INDEX_NAME: "idx_ab", NON_UNIQUE: 1, SEQ_IN_INDEX: 1, COLUMN_NAME: "a" },
      { TABLE_NAME: "users", INDEX_NAME: "idx_ab", NON_UNIQUE: 1, SEQ_IN_INDEX: 2, COLUMN_NAME: "b" },
    ];
    const snap = build({ indexes: composite });
    const idx = snap.tables[0]!.indexes.find((i) => i.name === "idx_ab");
    expect(idx).toEqual({ name: "idx_ab", unique: false, columns: ["a", "b"] });
  });

  it("컬럼이 없는 테이블도 누락하지 않는다(PK 는 빈 배열)", () => {
    const empty: RawTableRow[] = [{ TABLE_NAME: "logs", ENGINE: "InnoDB", TABLE_COLLATION: null }];
    const snap = buildSnapshot("app", { tables: empty, columns: [], indexes: [] });
    expect(snap.tables).toHaveLength(1);
    expect(snap.tables[0]).toMatchObject({ name: "logs", columns: [], primaryKey: [] });
  });

  it("외래 키를 CONSTRAINT 기준으로 묶어 테이블에 붙인다", () => {
    const snap = build({
      foreignKeys: [
        {
          TABLE_NAME: "users", CONSTRAINT_NAME: "fk_dept", COLUMN_NAME: "dept_id",
          ORDINAL_POSITION: 1, REFERENCED_TABLE_NAME: "dept", REFERENCED_COLUMN_NAME: "id",
          UPDATE_RULE: "CASCADE", DELETE_RULE: "RESTRICT",
        },
      ],
    });
    const fk = snap.tables[0]!.foreignKeys?.[0];
    expect(fk).toEqual({
      name: "fk_dept", columns: ["dept_id"], refTable: "dept",
      refColumns: ["id"], onUpdate: "CASCADE", onDelete: "RESTRICT",
    });
  });

  it("View/Routine/Trigger/Event 를 스냅샷에 매핑한다", () => {
    const snap = build({
      views: [{ TABLE_NAME: "v_a", VIEW_DEFINITION: "select 1" }],
      routines: [{ ROUTINE_NAME: "sp_a", ROUTINE_TYPE: "PROCEDURE", ROUTINE_DEFINITION: "BEGIN END" }],
      triggers: [{ TRIGGER_NAME: "t_a", EVENT_OBJECT_TABLE: "users", ACTION_TIMING: "BEFORE", EVENT_MANIPULATION: "INSERT", ACTION_STATEMENT: "SET NEW.x=1" }],
      events: [{ EVENT_NAME: "e_a", EVENT_DEFINITION: "DO SELECT 1" }],
    });
    expect(snap.views?.[0]).toEqual({ name: "v_a", definition: "select 1" });
    expect(snap.routines?.[0]).toMatchObject({ name: "sp_a", type: "PROCEDURE" });
    expect(snap.triggers?.[0]).toMatchObject({ name: "t_a", timing: "BEFORE", event: "INSERT" });
    expect(snap.events?.[0]).toEqual({ name: "e_a", definition: "DO SELECT 1" });
  });
});
