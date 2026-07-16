import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { buildBackupDump, createBackup } from "../src/dump/backup.js";
import { readDumpFile } from "../src/dump/dumpFile.js";
import type { DbConnector } from "../src/connector/DbConnector.js";
import type {
  ConnectionConfig,
  DataRow,
  SchemaSnapshot,
} from "../src/domain/types.js";
import { snapshot, usersTable } from "./fixtures.js";

const config: ConnectionConfig = {
  host: "localhost",
  port: 3306,
  user: "u",
  password: "p",
  database: "app",
};

/** fetchSchema/fetchRows 만 의미 있게 구현한 목 커넥터. */
class FakeConnector implements DbConnector {
  fetchedTables: string[] = [];
  constructor(
    private snap: SchemaSnapshot,
    private rows: Record<string, DataRow[]>,
  ) {}
  async ping(): Promise<boolean> {
    return true;
  }
  async fetchSchema(): Promise<SchemaSnapshot> {
    return this.snap;
  }
  async fetchRows(_c: ConnectionConfig, table: string): Promise<DataRow[]> {
    this.fetchedTables.push(table);
    return this.rows[table] ?? [];
  }
  async fetchGrants(): Promise<string[]> {
    return [];
  }
  async execute(): Promise<number> {
    return 0;
  }
}

const snap = snapshot("app", [usersTable({ engine: "InnoDB" })]);
const rows = { users: [{ id: 1, name: "홍길동", email: "a@x.com" }] };
const date = new Date(2026, 6, 16, 3, 0, 0);

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

describe("buildBackupDump", () => {
  it("all 모드는 스키마와 데이터를 모두 읽어 덤프한다", async () => {
    const conn = new FakeConnector(snap, rows);
    const dump = await buildBackupDump(conn, config, "all");
    expect(dump).toContain("CREATE TABLE `users`");
    expect(dump).toContain("INSERT INTO `users`");
    expect(conn.fetchedTables).toEqual(["users"]);
  });

  it("schema 모드는 데이터를 읽지 않는다", async () => {
    const conn = new FakeConnector(snap, rows);
    const dump = await buildBackupDump(conn, config, "schema");
    expect(dump).not.toContain("INSERT INTO");
    expect(conn.fetchedTables).toEqual([]); // fetchRows 미호출
  });
});

describe("createBackup", () => {
  it("자동 파일명으로 gzip 백업을 저장하고 왕복 복원된다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsm-backup-"));
    dirs.push(dir);
    const conn = new FakeConnector(snap, rows);

    const result = await createBackup(conn, config, { dir }, date);

    expect(basename(result.filePath)).toBe("app_20260716.sql.gz");
    // 실제 파일이 존재하고, 복원 시 원문이 나온다.
    await stat(result.filePath);
    const restored = await readDumpFile(result.filePath);
    expect(restored).toContain("INSERT INTO `users`");
  });
});
