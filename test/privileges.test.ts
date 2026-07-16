import { describe, it, expect } from "vitest";
import {
  parseGrants,
  hasPrivilege,
  checkPrivileges,
  requiredPrivilegesForMode,
} from "../src/connector/privileges.js";

describe("parseGrants", () => {
  it("GRANT 절에서 개별 권한을 대문자로 추출한다", () => {
    const g = parseGrants([
      "GRANT SELECT, INSERT, UPDATE ON `app`.* TO `u`@`%`",
    ]);
    expect(g.has("SELECT")).toBe(true);
    expect(g.has("INSERT")).toBe(true);
    expect(g.has("UPDATE")).toBe(true);
    expect(g.has("DELETE")).toBe(false);
  });

  it("여러 라인을 병합한다", () => {
    const g = parseGrants([
      "GRANT SELECT ON `app`.* TO `u`@`%`",
      "GRANT DROP ON `app`.`users` TO `u`@`%`",
    ]);
    expect(g.has("SELECT")).toBe(true);
    expect(g.has("DROP")).toBe(true);
  });
});

describe("hasPrivilege", () => {
  it("ALL PRIVILEGES 는 모든 권한을 포함한다", () => {
    const g = parseGrants(["GRANT ALL PRIVILEGES ON *.* TO `root`@`localhost`"]);
    expect(hasPrivilege(g, "DROP")).toBe(true);
    expect(hasPrivilege(g, "SELECT")).toBe(true);
  });
});

describe("requiredPrivilegesForMode", () => {
  it("overwrite 는 TRUNCATE 때문에 DROP+INSERT 를 요구한다", () => {
    expect(requiredPrivilegesForMode("overwrite")).toEqual(["DROP", "INSERT"]);
  });

  it("upsert 는 INSERT+UPDATE 를 요구한다", () => {
    expect(requiredPrivilegesForMode("upsert")).toEqual(["INSERT", "UPDATE"]);
  });
});

describe("checkPrivileges", () => {
  it("부족한 권한을 정확히 집어낸다", () => {
    const g = parseGrants(["GRANT INSERT ON `app`.* TO `u`@`%`"]);
    const result = checkPrivileges(g, requiredPrivilegesForMode("overwrite"));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["DROP"]);
  });

  it("충분하면 ok=true, missing 은 빈 배열", () => {
    const g = parseGrants(["GRANT ALL PRIVILEGES ON *.* TO `u`@`%`"]);
    const result = checkPrivileges(g, requiredPrivilegesForMode("upsert"));
    expect(result).toEqual({ ok: true, missing: [] });
  });
});
