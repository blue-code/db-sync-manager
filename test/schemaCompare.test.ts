import { describe, it, expect } from "vitest";
import { compareSchema } from "../src/compare/schemaCompare.js";
import { isSchemaIdentical } from "../src/domain/diff.js";
import { col, snapshot, usersTable } from "./fixtures.js";

describe("compareSchema", () => {
  it("동일한 스키마는 identical 로 판정한다", () => {
    const origin = snapshot("app", [usersTable()]);
    const target = snapshot("app_dev", [usersTable()]);

    const diff = compareSchema(origin, target);

    expect(diff.tables).toHaveLength(1);
    expect(diff.tables[0]!.status).toBe("identical");
    expect(isSchemaIdentical(diff)).toBe(true);
  });

  it("Origin 에만 있는 테이블은 added 로 표시한다", () => {
    const origin = snapshot("app", [usersTable(), usersTable({ name: "orders" })]);
    const target = snapshot("app_dev", [usersTable()]);

    const diff = compareSchema(origin, target);
    const orders = diff.tables.find((t) => t.name === "orders");

    expect(orders?.status).toBe("added");
    expect(isSchemaIdentical(diff)).toBe(false);
  });

  it("Target 에만 있는 테이블은 removed 로 표시한다", () => {
    const origin = snapshot("app", [usersTable()]);
    const target = snapshot("app_dev", [usersTable(), usersTable({ name: "legacy" })]);

    const diff = compareSchema(origin, target);
    const legacy = diff.tables.find((t) => t.name === "legacy");

    expect(legacy?.status).toBe("removed");
  });

  it("컬럼 타입이 다르면 modified + 변경 내역을 담는다", () => {
    const origin = snapshot("app", [usersTable()]);
    const target = snapshot("app_dev", [
      usersTable({
        columns: [
          col("id", "int", { autoIncrement: true, position: 1 }),
          col("name", "varchar(50)", { position: 2 }),
          col("email", "varchar(100)", { position: 3 }), // 타입 상이
        ],
      }),
    ]);

    const diff = compareSchema(origin, target);
    const emailDiff = diff.tables[0]!.columns.find((c) => c.name === "email");

    expect(diff.tables[0]!.status).toBe("modified");
    expect(emailDiff?.status).toBe("modified");
    expect(emailDiff?.changes).toEqual([
      { field: "dataType", origin: "varchar(50)", target: "varchar(100)" },
    ]);
  });

  it("컬럼 추가/삭제를 added/removed 로 구분한다", () => {
    const origin = snapshot("app", [
      usersTable({
        columns: [
          col("id", "int", { position: 1 }),
          col("phone", "varchar(20)", { position: 2 }), // origin 에만
        ],
      }),
    ]);
    const target = snapshot("app_dev", [
      usersTable({
        columns: [
          col("id", "int", { position: 1 }),
          col("address", "varchar(200)", { position: 2 }), // target 에만
        ],
      }),
    ]);

    const diff = compareSchema(origin, target);
    const cols = diff.tables[0]!.columns;

    expect(cols.find((c) => c.name === "phone")?.status).toBe("added");
    expect(cols.find((c) => c.name === "address")?.status).toBe("removed");
  });

  it("출력은 테이블/컬럼명 기준으로 정렬돼 결정론적이다", () => {
    const origin = snapshot("app", [
      usersTable({ name: "zebra" }),
      usersTable({ name: "alpha" }),
    ]);
    const target = snapshot("app_dev", [
      usersTable({ name: "alpha" }),
      usersTable({ name: "zebra" }),
    ]);

    const diff = compareSchema(origin, target);
    expect(diff.tables.map((t) => t.name)).toEqual(["alpha", "zebra"]);
  });
});
