import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandlers } from "../app/handlers.js";
import type { DbConnector } from "../src/index.js";

// 접속 저장/불러오기는 DB 를 쓰지 않으므로 커넥터는 스텁으로 충분하다.
const stub = {} as DbConnector;

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function handlers() {
  const dir = await mkdtemp(join(tmpdir(), "dsm-conn-"));
  dirs.push(dir);
  return createHandlers({ connector: stub, userDataDir: dir });
}

const conf = (host: string, database = "app") => ({
  host, port: 3306, user: "root", password: "secret", database,
});

describe("접속 정보 기억 핸들러", () => {
  it("초기에는 빈 상태", async () => {
    const h = await handlers();
    expect(await h.connectionsLoad()).toEqual({ recents: [] });
  });

  it("저장하면 마지막 접속과 최근 목록에 남는다(비밀번호 제외)", async () => {
    const h = await handlers();
    await h.connectionsSave("origin", conf("db-prod"));
    const state = await h.connectionsLoad();

    expect(state.origin).toEqual({ host: "db-prod", port: 3306, user: "root", database: "app" });
    expect(state.origin).not.toHaveProperty("password"); // 비밀번호 미저장
    expect(state.recents).toHaveLength(1);
  });

  it("여러 대상을 최근 목록에 누적하고 최신을 앞에 둔다", async () => {
    const h = await handlers();
    await h.connectionsSave("origin", conf("a"));
    await h.connectionsSave("target", conf("b"));
    const state = await h.connectionsLoad();
    expect(state.recents.map((r) => r.host)).toEqual(["b", "a"]);
    expect(state.origin?.host).toBe("a");
    expect(state.target?.host).toBe("b");
  });
});
