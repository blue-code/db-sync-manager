import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MysqlConnector } from "../../src/index.js";
import { createHandlers } from "../../app/handlers.js";
import { bootMysql, conf, runSetup, type MysqlInstance } from "./harness.js";

let mysqlInst: MysqlInstance | undefined;
let port = 0;
let up = false;
let userDataDir = "";
let h: ReturnType<typeof createHandlers>;

const dirs: string[] = [];

const USERS = (db: string) => [
  `CREATE DATABASE IF NOT EXISTS ${db}`,
  `CREATE TABLE ${db}.users (id INT PRIMARY KEY, name VARCHAR(50), email VARCHAR(100)) ENGINE=InnoDB`,
];

beforeAll(async () => {
  try {
    mysqlInst = await bootMysql();
    port = mysqlInst.port;
    await runSetup(port, [
      ...USERS("origin_h"),
      ...USERS("target_h"),
      "CREATE DATABASE IF NOT EXISTS restore_h",
      `INSERT INTO origin_h.users VALUES (1,'a','a@x'),(2,'b','bnew@x'),(4,'d','d@x')`,
      `INSERT INTO target_h.users VALUES (1,'a','a@x'),(2,'b','bold@x'),(3,'c','c@x')`,
    ]);
    userDataDir = await mkdtemp(join(tmpdir(), "dsm-hnd-"));
    dirs.push(userDataDir);
    h = createHandlers({ connector: new MysqlConnector(), userDataDir });
    up = true;
  } catch (err) {
    console.warn("[IT] MySQL 미가용, 통합 테스트를 건너뜁니다:", (err as Error).message);
  }
}, 180000);

afterAll(async () => {
  await mysqlInst?.stop();
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

describe("IPC 핸들러 통합(실 DB)", () => {
  it("testConnection: 정상/비정상을 구분한다", async (ctx) => {
    if (!up) return ctx.skip();
    expect((await h.testConnection(conf(port, "origin_h"))).ok).toBe(true);
    expect((await h.testConnection({ ...conf(port, "origin_h"), port: 1 })).ok).toBe(false);
  });

  it("listTables/analyze 가 실제 스키마를 반환한다", async (ctx) => {
    if (!up) return ctx.skip();
    const list = await h.listTables(conf(port, "origin_h"));
    expect(list.ok).toBe(true);
    expect(list.tables?.some((t) => t.name === "users")).toBe(true);

    const an = await h.analyze(conf(port, "origin_h"), conf(port, "target_h"));
    expect(an.ok).toBe(true);
    expect(an.diff?.tables.some((t) => t.name === "users")).toBe(true);
  });

  it("reviewSync 가 변경 행을 집계한다", async (ctx) => {
    if (!up) return ctx.skip();
    const rv = await h.reviewSync(conf(port, "origin_h"), conf(port, "target_h"), {
      table: "users", mode: "upsert", includeDeletes: false,
    });
    expect(rv.ok).toBe(true);
    // added=id4, modified=id2 → 검토 대상 2건(removed 는 includeDeletes=false 라 제외)
    expect(rv.rows?.length).toBe(2);
  });

  it("planSync→applySync 로 Target 을 갱신하고 History 를 남긴다", async (ctx) => {
    if (!up) return ctx.skip();
    const origin = conf(port, "origin_h");
    const target = conf(port, "target_h");
    const params = { table: "users", mode: "upsert" as const, includeDeletes: false };

    const plan = await h.planSync(origin, target, params);
    expect(plan.ok).toBe(true);
    expect(plan.summary).toEqual({ insert: 1, update: 1, delete: 0 });

    const applied = await h.applySync(origin, target, { ...params, backup: false });
    expect(applied.ok).toBe(true);

    const rows = await new MysqlConnector().fetchRows(target, "users");
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(2)?.email).toBe("bnew@x");
    expect(byId.get(4)?.name).toBe("d");

    const history = await h.listHistory();
    expect(history.some((e) => e.kind === "syncFine" && e.status === "success")).toBe(true);
  });

  it("buildDump → saveDumpTo → planRestoreFile → applyRestore 왕복", async (ctx) => {
    if (!up) return ctx.skip();
    const origin = conf(port, "origin_h");

    const preview = await h.buildDump(origin, { mode: "schema", compression: "none" });
    expect(preview.ok).toBe(true);
    expect(preview.preview).toContain("CREATE TABLE `users`");

    const file = join(userDataDir, "dump.sql");
    const saved = await h.saveDumpTo(origin, { mode: "all", compression: "none" }, file);
    expect(saved.ok).toBe(true);

    const plan = await h.planRestoreFile(file);
    expect(plan.ok).toBe(true);
    expect(plan.statementCount).toBeGreaterThan(0);

    const restored = await h.applyRestore(conf(port, "restore_h"), {
      filePath: file, schemaOnly: false, dataOnly: false,
    });
    expect(restored.ok).toBe(true);

    const rows = await new MysqlConnector().fetchRows(conf(port, "restore_h"), "users");
    expect(rows.length).toBe(3); // origin_h 의 3행
  });

  it("task 저장/목록/삭제 CRUD(비밀번호 미저장, 다음 실행 시각 계산)", async (ctx) => {
    if (!up) return ctx.skip();
    const save = await h.taskSave({
      name: "야간 동기화",
      kind: "syncFine",
      origin: conf(port, "origin_h"),
      target: conf(port, "target_h"),
      table: "users",
      mode: "upsert",
      schedule: { kind: "daily", hour: 2, minute: 0 },
    });
    expect(save.ok).toBe(true);

    const list = await h.taskList();
    expect(list.tasks?.length).toBe(1);
    const task = list.tasks![0]!;
    expect(task.origin).not.toHaveProperty("password"); // 비밀번호 미저장
    expect(task.nextRunAt).toBeTruthy(); // 예약 → 다음 실행 시각 계산됨

    const removed = await h.taskRemove(task.id);
    expect(removed.ok).toBe(true);
    expect((await h.taskList()).tasks?.length).toBe(0);
  });
});
