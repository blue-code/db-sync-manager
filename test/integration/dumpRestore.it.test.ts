import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  MysqlConnector,
  generateDump,
  planRestore,
  type DataRow,
} from "../../src/index.js";
import { bootMysql, conf, runSetup, type MysqlInstance } from "./harness.js";

const connector = new MysqlConnector();
let mysqlInst: MysqlInstance | undefined;
let port = 0;
let up = false;

beforeAll(async () => {
  try {
    mysqlInst = await bootMysql();
    port = mysqlInst.port;
    await runSetup(port, [
      "CREATE DATABASE IF NOT EXISTS src_db",
      `CREATE TABLE src_db.products (
         id INT NOT NULL AUTO_INCREMENT,
         title VARCHAR(80) NOT NULL,
         price INT NOT NULL DEFAULT 0,
         PRIMARY KEY (id)
       ) ENGINE=InnoDB`,
      `INSERT INTO src_db.products (id,title,price) VALUES
         (1,'사과',1000),(2,'배''즙',2500),(3,'포도;세트',5000)`,
      // 뷰/프로시저/트리거를 src_db 에 추가(덤프·복원 대상)
      "CREATE VIEW src_db.v_products AS SELECT id, title FROM src_db.products",
      "CREATE PROCEDURE src_db.sp_count() BEGIN SELECT COUNT(*) FROM src_db.products; END",
      "CREATE TRIGGER src_db.trg_products BEFORE INSERT ON src_db.products FOR EACH ROW SET NEW.title = NEW.title",
      "CREATE EVENT src_db.ev_clean ON SCHEDULE EVERY 1 DAY DO DELETE FROM src_db.products WHERE price < 0",
      "CREATE DATABASE IF NOT EXISTS restore_db",
      "CREATE DATABASE IF NOT EXISTS restore_db2",
    ]);
    up = true;
  } catch (err) {
    console.warn("[IT] MySQL 미가용, 통합 테스트를 건너뜁니다:", (err as Error).message);
  }
}, 180000);

afterAll(async () => {
  await mysqlInst?.stop();
});

describe("Dump → Restore 라운드트립(실 DB)", () => {
  it("스키마+데이터 덤프를 새 DB 에 복원하면 원본과 일치한다", async (ctx) => {
    if (!up) return ctx.skip();
    const srcCfg = conf(port, "src_db");
    const restoreCfg = conf(port, "restore_db");

    // 1) 원본 스냅샷 + 데이터로 덤프 텍스트 생성
    const snapshot = await connector.fetchSchema(srcCfg);
    const data = new Map<string, DataRow[]>();
    for (const t of snapshot.tables) {
      data.set(t.name, await connector.fetchRows(srcCfg, t.name));
    }
    const dump = generateDump({ snapshot, data }, { mode: "all", dropTable: true });

    // 2) 덤프를 문장으로 분리해 복원 대상 DB 에 실행
    const statements = planRestore(dump);
    await connector.execute(restoreCfg, statements);

    // 3) 복원 결과 검증: 스키마와 데이터가 원본과 동일
    const restored = await connector.fetchSchema(restoreCfg);
    const products = restored.tables.find((t) => t.name === "products");
    expect(products?.primaryKey).toEqual(["id"]);
    expect(products?.columns.map((c) => c.name)).toEqual(["id", "title", "price"]);

    const rows = await connector.fetchRows(restoreCfg, "products");
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 이스케이프가 필요한 값들이 온전히 왕복되는지 확인
    expect(byId.get(2)?.title).toBe("배'즙");
    expect(byId.get(3)?.title).toBe("포도;세트");
    expect(byId.get(1)?.price).toBe(1000);
  });

  it("뷰/프로시저/트리거를 덤프해 새 DB 에 복원한다", async (ctx) => {
    if (!up) return ctx.skip();
    const srcCfg = conf(port, "src_db");
    const restoreCfg = conf(port, "restore_db2");

    // src_db 전체(스키마+데이터+객체)를 덤프한다.
    const snapshot = await connector.fetchSchema(srcCfg);
    const data = new Map<string, DataRow[]>();
    for (const t of snapshot.tables) data.set(t.name, await connector.fetchRows(srcCfg, t.name));

    // 루틴 전체 DDL(SHOW CREATE)이 수집됐는지 확인.
    expect(snapshot.routines?.find((r) => r.name === "sp_count")?.createStatement).toContain("CREATE");

    const dump = generateDump({ snapshot, data }, { mode: "all", dropTable: true });
    expect(dump).toContain("DELIMITER $$"); // 복합 본문 보호 확인

    // 복원 후 객체가 실제로 생성됐는지 검증.
    await connector.execute(restoreCfg, planRestore(dump));
    const restored = await connector.fetchSchema(restoreCfg);

    expect(restored.views?.some((v) => v.name === "v_products")).toBe(true);
    expect(restored.routines?.some((r) => r.name === "sp_count")).toBe(true);
    expect(restored.triggers?.some((t) => t.name === "trg_products")).toBe(true);
    expect(restored.events?.some((e) => e.name === "ev_clean")).toBe(true);
  });
});
