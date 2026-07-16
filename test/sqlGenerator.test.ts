import { describe, it, expect } from "vitest";
import { generateSyncSql } from "../src/sync/sqlGenerator.js";
import { usersTable } from "./fixtures.js";

const table = usersTable();
const rows = [
  { id: 1, name: "홍길동", email: "a@x.com" },
  { id: 2, name: "김철수", email: "b@x.com" },
];

describe("generateSyncSql", () => {
  it("빈 rows 는 빈 배열을 반환한다(불필요한 TRUNCATE 방지)", () => {
    expect(generateSyncSql({ table, rows: [], mode: "overwrite" })).toEqual([]);
  });

  it("overwrite: TRUNCATE 후 일괄 INSERT 를 생성한다", () => {
    const sql = generateSyncSql({ table, rows, mode: "overwrite" });
    expect(sql[0]).toBe("TRUNCATE TABLE `users`;");
    expect(sql[1]).toContain("INSERT INTO `users` (`id`, `name`, `email`) VALUES");
    expect(sql[1]).toContain("(1, '홍길동', 'a@x.com')");
    expect(sql[1]).toContain("(2, '김철수', 'b@x.com')");
  });

  it("insertOnly: INSERT IGNORE 로 기존 행을 보존한다", () => {
    const sql = generateSyncSql({ table, rows, mode: "insertOnly" });
    expect(sql).toHaveLength(1);
    expect(sql[0]!.startsWith("INSERT IGNORE INTO `users`")).toBe(true);
  });

  it("upsert: ON DUPLICATE KEY UPDATE 절에 비 PK 컬럼만 포함한다", () => {
    const sql = generateSyncSql({ table, rows, mode: "upsert" });
    expect(sql[0]).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql[0]).toContain("`name` = VALUES(`name`)");
    expect(sql[0]).toContain("`email` = VALUES(`email`)");
    expect(sql[0]).not.toContain("`id` = VALUES(`id`)"); // PK 는 갱신 대상 아님
  });

  it("updateOnly: PK 기준 UPDATE 문을 행마다 생성한다", () => {
    const sql = generateSyncSql({ table, rows, mode: "updateOnly" });
    expect(sql).toHaveLength(2);
    expect(sql[0]).toBe(
      "UPDATE `users` SET `name` = '홍길동', `email` = 'a@x.com' WHERE `id` = 1;",
    );
  });

  it("PK 없는 테이블에 updateOnly/upsert 를 쓰면 예외를 던진다", () => {
    const noPk = usersTable({ primaryKey: [] });
    expect(() => generateSyncSql({ table: noPk, rows, mode: "upsert" })).toThrow();
    expect(() => generateSyncSql({ table: noPk, rows, mode: "updateOnly" })).toThrow();
  });

  it("작은따옴표가 포함된 값을 안전하게 이스케이프한다", () => {
    const sql = generateSyncSql({
      table,
      rows: [{ id: 3, name: "O'Brien", email: "c@x.com" }],
      mode: "overwrite",
    });
    expect(sql[1]).toContain("'O\\'Brien'");
  });
});
