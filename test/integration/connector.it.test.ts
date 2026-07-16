import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  MysqlConnector,
  compareData,
  buildSyncPlan,
  generatePlanSql,
  parseGrants,
  checkPrivileges,
  requiredPrivilegesForMode,
} from "../../src/index.js";
import { bootMysql, conf, runSetup, type MysqlInstance } from "./harness.js";

const connector = new MysqlConnector();
let mysqlInst: MysqlInstance | undefined;
let port = 0;
let up = false;

// origin/target 초기 데이터. target 은 id2 변경, id3 는 target 전용, id4 는 origin 전용.
const CREATE_USERS = (db: string) => [
  `CREATE DATABASE IF NOT EXISTS \`${db}\``,
  `CREATE TABLE \`${db}\`.\`users\` (
     id INT NOT NULL AUTO_INCREMENT,
     name VARCHAR(50) NOT NULL,
     email VARCHAR(100) DEFAULT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY uq_email (email)
   ) ENGINE=InnoDB`,
];

beforeAll(async () => {
  try {
    mysqlInst = await bootMysql();
    port = mysqlInst.port;
    await runSetup(port, [
      ...CREATE_USERS("origin_db"),
      ...CREATE_USERS("target_db"),
      `INSERT INTO origin_db.users (id,name,email) VALUES
         (1,'홍길동','a@x.com'),(2,'김철수','b_new@x.com'),(4,'신규','d@x.com')`,
      `INSERT INTO target_db.users (id,name,email) VALUES
         (1,'홍길동','a@x.com'),(2,'김철수','b_old@x.com'),(3,'삭제대상','c@x.com')`,
    ]);
    up = true;
  } catch (err) {
    console.warn("[IT] MySQL 미가용, 통합 테스트를 건너뜁니다:", (err as Error).message);
  }
}, 180000);

afterAll(async () => {
  await mysqlInst?.stop();
});

describe("MysqlConnector 통합", () => {
  it("ping: 정상/비정상 접속을 구분한다", async (ctx) => {
    if (!up) return ctx.skip();
    expect(await connector.ping(conf(port, "origin_db"))).toBe(true);
    expect(await connector.ping({ ...conf(port, "origin_db"), port: 1 })).toBe(false);
  });

  it("fetchSchema: INFORMATION_SCHEMA 를 스냅샷으로 매핑한다", async (ctx) => {
    if (!up) return ctx.skip();
    const snap = await connector.fetchSchema(conf(port, "origin_db"));
    const users = snap.tables.find((t) => t.name === "users");
    expect(users?.primaryKey).toEqual(["id"]);
    const id = users?.columns.find((c) => c.name === "id");
    expect(id?.autoIncrement).toBe(true);
    expect(id?.dataType).toBe("int");
    expect(users?.columns.find((c) => c.name === "email")?.dataType).toBe("varchar(100)");
    expect(users?.indexes.some((i) => i.name === "uq_email" && i.unique)).toBe(true);
  });

  it("fetchRows: 시드 데이터를 읽어 온다", async (ctx) => {
    if (!up) return ctx.skip();
    const rows = await connector.fetchRows(conf(port, "origin_db"), "users");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id).sort()).toEqual([1, 2, 4]);
  });

  it("fetchGrants: 권한을 읽어 모드별 필요 권한을 충족한다", async (ctx) => {
    if (!up) return ctx.skip();
    const grants = await connector.fetchGrants(conf(port, "origin_db"));
    const granted = parseGrants(grants);
    const check = checkPrivileges(granted, requiredPrivilegesForMode("overwrite"));
    expect(check.ok).toBe(true);
  });

  it("execute: 트랜잭션 중간 실패 시 전체 롤백한다", async (ctx) => {
    if (!up) return ctx.skip();
    const cfg = conf(port, "target_db");
    // 두 번째 문장이 PK 중복으로 실패 → 첫 INSERT 도 롤백되어야 한다.
    await expect(
      connector.execute(cfg, [
        "INSERT INTO users (id,name,email) VALUES (99,'temp','z@x.com')",
        "INSERT INTO users (id,name,email) VALUES (99,'dup','y@x.com')",
      ]),
    ).rejects.toThrow();
    const rows = await connector.fetchRows(cfg, "users");
    expect(rows.some((r) => r.id === 99)).toBe(false); // 롤백 확인
  });
});

describe("데이터 동기화 라운드트립(실 DB)", () => {
  it("upsert 계획을 생성·실행해 Target 이 기대대로 바뀐다", async (ctx) => {
    if (!up) return ctx.skip();
    const originCfg = conf(port, "origin_db");
    const targetCfg = conf(port, "target_db");

    const targetSchema = await connector.fetchSchema(targetCfg);
    const targetTable = targetSchema.tables.find((t) => t.name === "users")!;

    const [originRows, targetRows] = await Promise.all([
      connector.fetchRows(originCfg, "users"),
      connector.fetchRows(targetCfg, "users"),
    ]);

    const diff = compareData("users", originRows, targetRows, ["id"]);
    // added=id4, modified=id2, removed=id3, identical=id1
    expect(diff.summary).toEqual({ added: 1, modified: 1, removed: 1, identical: 1 });

    const plan = buildSyncPlan(diff, { mode: "upsert" });
    const sql = generatePlanSql(plan, targetTable);
    const executed = await connector.execute(targetCfg, sql);
    expect(executed).toBe(sql.length);

    const after = await connector.fetchRows(targetCfg, "users");
    const byId = new Map(after.map((r) => [r.id, r]));
    expect(byId.get(2)?.email).toBe("b_new@x.com"); // 갱신됨
    expect(byId.get(4)?.name).toBe("신규"); // 삽입됨
    expect(byId.has(3)).toBe(true); // includeDeletes=false 라 유지
  });

  it("행 단위 선택(Difference Review): 고른 행만 반영한다", async (ctx) => {
    if (!up) return ctx.skip();
    // 독립 테이블로 셋업(다른 테스트 상태와 격리).
    await runSetup(port, [
      "CREATE DATABASE IF NOT EXISTS sel_src",
      "CREATE DATABASE IF NOT EXISTS sel_dst",
      `CREATE TABLE sel_src.items (id INT PRIMARY KEY, v VARCHAR(20)) ENGINE=InnoDB`,
      `CREATE TABLE sel_dst.items (id INT PRIMARY KEY, v VARCHAR(20)) ENGINE=InnoDB`,
      `INSERT INTO sel_src.items VALUES (1,'a'),(2,'b'),(3,'c')`,
    ]);
    const srcCfg = conf(port, "sel_src");
    const dstCfg = conf(port, "sel_dst");
    const dstTable = (await connector.fetchSchema(dstCfg)).tables.find((t) => t.name === "items")!;

    const diff = compareData(
      "items",
      await connector.fetchRows(srcCfg, "items"),
      await connector.fetchRows(dstCfg, "items"),
      ["id"],
    );
    expect(diff.summary.added).toBe(3);

    // main 핸들러와 동일한 키 문자열 규칙으로 id 1, 3 만 선택.
    const keyStr = (key: Record<string, unknown>) => JSON.stringify(key["id"] ?? null);
    const selected = new Set([keyStr({ id: 1 }), keyStr({ id: 3 })]);

    const plan = buildSyncPlan(diff, {
      mode: "insertOnly",
      includeDeletes: false,
      select: (row) => selected.has(keyStr(row.key)),
    });
    await connector.execute(dstCfg, generatePlanSql(plan, dstTable));

    const ids = (await connector.fetchRows(dstCfg, "items")).map((r) => r.id).sort();
    expect(ids).toEqual([1, 3]); // 선택한 행만 반영, id2 제외
  });
});
