import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHistoryEntry, formatHistoryLine } from "../src/history/history.js";
import { HistoryStore } from "../src/history/historyStore.js";

const at = new Date(2026, 6, 16, 2, 30, 0);
const origin = { host: "h", port: 3306, user: "u", database: "prod" };
const target = { host: "h2", port: 3306, user: "u", database: "dev" };

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

describe("buildHistoryEntry", () => {
  it("성공 기록에 시각/방향/건수를 담는다", () => {
    const e = buildHistoryEntry(
      { id: "run1", kind: "syncFine", status: "success", origin, target, counts: { insert: 5, update: 2, delete: 0 } },
      at,
    );
    expect(e.at).toBe(at.toISOString());
    expect(e.counts?.insert).toBe(5);
  });

  it("한 줄 요약을 만든다", () => {
    const e = buildHistoryEntry(
      { id: "run1", kind: "syncFine", status: "success", origin, target, counts: { insert: 5, update: 2 } },
      at,
    );
    const line = formatHistoryLine(e);
    expect(line).toContain("prod → dev");
    expect(line).toContain("성공");
    expect(line).toContain("I:5 U:2 D:0");
  });
});

describe("HistoryStore", () => {
  it("append 한 기록을 최신순으로 로드하고 id 로 찾는다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsm-hist-"));
    dirs.push(dir);
    const store = new HistoryStore(join(dir, "history.jsonl"));

    await store.append(buildHistoryEntry({ id: "r1", kind: "backup", status: "success", target }, at));
    await store.append(buildHistoryEntry({ id: "r2", kind: "syncFine", status: "failure", origin, target, error: "권한 부족" }, at));

    const all = await store.list();
    expect(all.map((e) => e.id)).toEqual(["r2", "r1"]); // 최신순
    expect((await store.get("r2"))?.error).toBe("권한 부족");
  });

  it("파일이 없으면 빈 목록을 돌려준다", async () => {
    const store = new HistoryStore(join(tmpdir(), "dsm-nope", "history.jsonl"));
    expect(await store.list()).toEqual([]);
  });
});
