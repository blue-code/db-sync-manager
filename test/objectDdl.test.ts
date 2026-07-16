import { describe, it, expect } from "vitest";
import {
  buildCreateView,
  buildCreateTrigger,
  buildCreateRoutine,
  buildCreateEvent,
  stripDefiner,
} from "../src/dump/objectDdl.js";

describe("buildCreateView", () => {
  it("정의를 CREATE VIEW 로 감싼다", () => {
    const ddl = buildCreateView({ name: "v_users", definition: "select id from users" });
    expect(ddl).toBe("CREATE VIEW `v_users` AS select id from users;");
  });
  it("dropFirst 는 DROP VIEW 를 선행한다", () => {
    const ddl = buildCreateView({ name: "v", definition: "select 1" }, true);
    expect(ddl.startsWith("DROP VIEW IF EXISTS `v`;")).toBe(true);
  });
});

describe("buildCreateTrigger", () => {
  it("구성 필드에서 CREATE TRIGGER 를 재구성한다", () => {
    const ddl = buildCreateTrigger({
      name: "trg", table: "users", timing: "BEFORE", event: "INSERT", statement: "SET NEW.x=1",
    });
    expect(ddl).toBe("CREATE TRIGGER `trg` BEFORE INSERT ON `users` FOR EACH ROW SET NEW.x=1");
  });
});

describe("stripDefiner", () => {
  it("DEFINER 절을 제거한다(이식성)", () => {
    const sql = "CREATE DEFINER=`root`@`localhost` PROCEDURE `p`() BEGIN END";
    expect(stripDefiner(sql)).toBe("CREATE PROCEDURE `p`() BEGIN END");
  });
});

describe("buildCreateRoutine", () => {
  it("전체 DDL(createStatement)에서 DEFINER 를 제거해 사용한다", () => {
    const ddl = buildCreateRoutine({
      name: "p", type: "PROCEDURE", definition: "BEGIN END",
      createStatement: "CREATE DEFINER=`root`@`localhost` PROCEDURE `p`(IN x INT) BEGIN SELECT x; END",
    });
    expect(ddl).toBe("CREATE PROCEDURE `p`(IN x INT) BEGIN SELECT x; END");
  });
  it("전체 DDL 이 없으면 예외를 던진다", () => {
    expect(() => buildCreateRoutine({ name: "p", type: "PROCEDURE", definition: "" })).toThrow();
  });
});

describe("buildCreateEvent", () => {
  it("전체 DDL(createStatement)에서 DEFINER 를 제거해 사용한다", () => {
    const ddl = buildCreateEvent({
      name: "ev", definition: "DO SELECT 1",
      createStatement: "CREATE DEFINER=`root`@`localhost` EVENT `ev` ON SCHEDULE EVERY 1 DAY DO SELECT 1",
    });
    expect(ddl).toBe("CREATE EVENT `ev` ON SCHEDULE EVERY 1 DAY DO SELECT 1");
  });
  it("전체 DDL 이 없으면 예외를 던진다", () => {
    expect(() => buildCreateEvent({ name: "e", definition: "" })).toThrow();
  });
});
