import { describe, it, expect } from "vitest";
import { buildCreateTable } from "../src/dump/ddlGenerator.js";
import { col, usersTable } from "./fixtures.js";

describe("buildCreateTable", () => {
  it("컬럼/PK/엔진을 갖춘 CREATE TABLE 을 생성한다", () => {
    const table = usersTable({ engine: "InnoDB" });
    const ddl = buildCreateTable(table);

    expect(ddl).toContain("CREATE TABLE `users` (");
    expect(ddl).toContain("`id` int NOT NULL AUTO_INCREMENT");
    expect(ddl).toContain("PRIMARY KEY (`id`)");
    expect(ddl).toContain(") ENGINE=InnoDB;");
  });

  it("nullable 컬럼은 DEFAULT NULL 로 표기한다", () => {
    const table = usersTable({
      columns: [col("id", "int", { autoIncrement: true }), col("bio", "text", { nullable: true })],
    });
    const ddl = buildCreateTable(table);
    expect(ddl).toContain("`bio` text DEFAULT NULL");
  });

  it("숫자 기본값은 무인용, 문자열 기본값은 인용, 함수는 그대로", () => {
    const table = usersTable({
      columns: [
        col("id", "int", { autoIncrement: true }),
        col("cnt", "int", { default: "0" }),
        col("grade", "varchar(10)", { default: "A" }),
        col("created", "datetime", { default: "CURRENT_TIMESTAMP" }),
      ],
    });
    const ddl = buildCreateTable(table);
    expect(ddl).toContain("`cnt` int NOT NULL DEFAULT 0");
    expect(ddl).toContain("`grade` varchar(10) NOT NULL DEFAULT 'A'");
    expect(ddl).toContain("`created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP");
  });

  it("UNIQUE/일반 인덱스를 렌더링한다", () => {
    const table = usersTable({
      indexes: [
        { name: "PRIMARY", unique: true, columns: ["id"] },
        { name: "uq_email", unique: true, columns: ["email"] },
        { name: "idx_name", unique: false, columns: ["name"] },
      ],
    });
    const ddl = buildCreateTable(table);
    expect(ddl).toContain("UNIQUE KEY `uq_email` (`email`)");
    expect(ddl).toContain("KEY `idx_name` (`name`)");
    // PRIMARY 는 KEY 목록이 아니라 PRIMARY KEY 로만 나온다.
    expect(ddl).not.toContain("KEY `PRIMARY`");
  });

  it("dropTable 옵션은 DROP TABLE IF EXISTS 를 선행한다", () => {
    const ddl = buildCreateTable(usersTable(), { dropTable: true });
    expect(ddl.startsWith("DROP TABLE IF EXISTS `users`;")).toBe(true);
  });
});
