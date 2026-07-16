import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MysqlConnector, compareSchema } from "../../src/index.js";
import { bootMysql, conf, runSetup, type MysqlInstance } from "./harness.js";

const connector = new MysqlConnector();
let mysqlInst: MysqlInstance | undefined;
let port = 0;
let up = false;

// ext_a 는 FK/View/Trigger 를 갖고, ext_b 는 없다.
const BASE = (db: string) => [
  `CREATE DATABASE IF NOT EXISTS ${db}`,
  `CREATE TABLE ${db}.dept (id INT PRIMARY KEY) ENGINE=InnoDB`,
  `CREATE TABLE ${db}.users (
     id INT PRIMARY KEY, dept_id INT, name VARCHAR(50)
   ) ENGINE=InnoDB`,
];

beforeAll(async () => {
  try {
    mysqlInst = await bootMysql();
    port = mysqlInst.port;
    await runSetup(port, [
      ...BASE("ext_a"),
      ...BASE("ext_b"),
      // ext_a 에만: FK, View, Trigger 추가
      `ALTER TABLE ext_a.users
         ADD CONSTRAINT fk_dept FOREIGN KEY (dept_id) REFERENCES ext_a.dept(id) ON DELETE CASCADE`,
      `CREATE VIEW ext_a.v_users AS SELECT id, name FROM ext_a.users`,
      `CREATE TRIGGER ext_a.trg_users BEFORE INSERT ON ext_a.users
         FOR EACH ROW SET NEW.name = NEW.name`,
    ]);
    up = true;
  } catch (err) {
    console.warn("[IT] MySQL 미가용, 통합 테스트를 건너뜁니다:", (err as Error).message);
  }
}, 180000);

afterAll(async () => {
  await mysqlInst?.stop();
});

describe("스키마 확장 비교(실 DB)", () => {
  it("FK/View/Trigger 차이를 실제로 감지한다", async (ctx) => {
    if (!up) return ctx.skip();
    const a = await connector.fetchSchema(conf(port, "ext_a"));
    const b = await connector.fetchSchema(conf(port, "ext_b"));

    // 수집 확인: ext_a 는 FK/뷰/트리거를 갖는다.
    const usersA = a.tables.find((t) => t.name === "users");
    expect(usersA?.foreignKeys?.some((f) => f.name === "fk_dept")).toBe(true);
    expect(a.views?.some((v) => v.name === "v_users")).toBe(true);
    expect(a.triggers?.some((t) => t.name === "trg_users")).toBe(true);

    const diff = compareSchema(a, b);

    // users 테이블: FK 가 Origin(ext_a) 에만 있으므로 added + 테이블 modified
    const usersDiff = diff.tables.find((t) => t.name === "users");
    expect(usersDiff?.status).toBe("modified");
    expect(usersDiff?.foreignKeys.find((f) => f.name === "fk_dept")?.status).toBe("added");

    // DB 객체: 뷰/트리거가 added 로 잡힌다.
    const obj = (name: string) => diff.objects.find((o) => o.name === name);
    expect(obj("v_users")).toMatchObject({ kind: "view", status: "added" });
    expect(obj("trg_users")).toMatchObject({ kind: "trigger", status: "added" });
  });
});
