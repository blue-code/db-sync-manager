import { describe, it, expect } from "vitest";
import { generateDump } from "../src/dump/dumpGenerator.js";
import { splitStatements } from "../src/dump/sqlSplit.js";
import { snapshot, usersTable } from "./fixtures.js";

const snap = snapshot("app", [
  usersTable({ engine: "InnoDB" }),
  usersTable({ name: "orders", engine: "InnoDB" }),
]);
const data = new Map([
  ["users", [{ id: 1, name: "홍길동", email: "a@x.com" }]],
  ["orders", [{ id: 10, name: "주문", email: "o@x.com" }]],
]);

describe("generateDump", () => {
  it("all 모드는 CREATE 와 INSERT 를 모두 포함한다", () => {
    const dump = generateDump({ snapshot: snap, data }, { mode: "all" });
    expect(dump).toContain("CREATE TABLE `users`");
    expect(dump).toContain("INSERT INTO `users`");
    expect(dump).toContain("SET FOREIGN_KEY_CHECKS=0;");
    expect(dump).toContain("SET FOREIGN_KEY_CHECKS=1;");
  });

  it("schema 모드는 INSERT 를 포함하지 않는다", () => {
    const dump = generateDump({ snapshot: snap, data }, { mode: "schema" });
    expect(dump).toContain("CREATE TABLE `users`");
    expect(dump).not.toContain("INSERT INTO");
  });

  it("data 모드는 CREATE 를 포함하지 않는다", () => {
    const dump = generateDump({ snapshot: snap, data }, { mode: "data" });
    expect(dump).not.toContain("CREATE TABLE");
    expect(dump).toContain("INSERT INTO `orders`");
  });

  it("tables 옵션으로 특정 테이블만 덤프한다", () => {
    const dump = generateDump({ snapshot: snap, data }, { tables: ["users"] });
    expect(dump).toContain("CREATE TABLE `users`");
    expect(dump).not.toContain("`orders`");
  });

  it("뷰/루틴/트리거 객체를 스키마 덤프에 포함한다", () => {
    const withObjects = snapshot("app", [usersTable({ engine: "InnoDB" })]);
    withObjects.views = [{ name: "v_u", definition: "select id from users" }];
    withObjects.routines = [
      { name: "sp", type: "PROCEDURE", definition: "BEGIN END", createStatement: "CREATE PROCEDURE `sp`() BEGIN SELECT 1; END" },
    ];
    withObjects.triggers = [
      { name: "trg", table: "users", timing: "BEFORE", event: "INSERT", statement: "SET NEW.name=NEW.name" },
    ];
    const dump = generateDump({ snapshot: withObjects }, { mode: "schema" });
    expect(dump).toContain("CREATE VIEW `v_u`");
    expect(dump).toContain("CREATE PROCEDURE `sp`");
    expect(dump).toContain("CREATE TRIGGER `trg`");
    expect(dump).toContain("DELIMITER $$"); // 복합 본문 보호
  });

  it("특정 테이블 덤프에서는 DB 객체를 포함하지 않는다", () => {
    const withObjects = snapshot("app", [usersTable()]);
    withObjects.views = [{ name: "v_u", definition: "select 1" }];
    const dump = generateDump({ snapshot: withObjects }, { tables: ["users"] });
    expect(dump).not.toContain("CREATE VIEW");
  });

  it("생성된 덤프는 문장 단위로 다시 분리 가능하다(왕복 정합성)", () => {
    const dump = generateDump({ snapshot: snap, data }, { mode: "all" });
    const statements = splitStatements(dump);
    // SET 2 + (DROP+CREATE)*2 + INSERT*2 = 8
    expect(statements.filter((s) => /^CREATE TABLE/.test(s))).toHaveLength(2);
    expect(statements.filter((s) => /^INSERT INTO/.test(s))).toHaveLength(2);
    expect(statements.filter((s) => /^DROP TABLE/.test(s))).toHaveLength(2);
  });
});
