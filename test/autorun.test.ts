import { describe, it, expect } from "vitest";
import { createAutorun } from "../app/autorun.js";
import { createTask, type Task } from "../src/index.js";

const now = new Date(2026, 6, 16, 3, 0, 0);
const origin = { host: "h", port: 3306, user: "u", database: "prod" };

function scheduledTask(id: string): Task {
  return createTask(
    { name: id, kind: "backup", origin, schedule: { kind: "daily", hour: 2, minute: 0 } },
    now,
    id,
  );
}

describe("createAutorun.tick", () => {
  it("due 인 Task 를 실행하고 마지막 실행 시각을 기록한다", async () => {
    const lastRun = new Map<string, Date>();
    const runs: string[] = [];
    const autorun = createAutorun({
      loadTasks: async () => [scheduledTask("t1")],
      getLastRun: (id) => lastRun.get(id) ?? null,
      setLastRun: async (id, at) => void lastRun.set(id, at),
      runTask: async (t) => { runs.push(t.id); return { ok: true, message: "ok" }; },
    });

    const res = await autorun.tick(now);
    expect(res.ran).toEqual(["t1"]);
    expect(runs).toEqual(["t1"]);
    expect(lastRun.get("t1")).toEqual(now);
  });

  it("오늘 이미 실행한 Task 는 다시 실행하지 않는다", async () => {
    const lastRun = new Map<string, Date>([["t1", new Date(2026, 6, 16, 2, 30, 0)]]);
    const autorun = createAutorun({
      loadTasks: async () => [scheduledTask("t1")],
      getLastRun: (id) => lastRun.get(id) ?? null,
      setLastRun: async () => {},
      runTask: async () => { throw new Error("실행되면 안 됨"); },
    });
    expect((await autorun.tick(now)).ran).toEqual([]);
  });

  it("자격증명 없음(runTask=null)은 skip 하고 기록하지 않아 다음에 재시도된다", async () => {
    let setCalled = false;
    const autorun = createAutorun({
      loadTasks: async () => [scheduledTask("t1")],
      getLastRun: () => null,
      setLastRun: async () => { setCalled = true; },
      runTask: async () => null,
    });
    const res = await autorun.tick(now);
    expect(res.skipped).toEqual(["t1"]);
    expect(res.ran).toEqual([]);
    expect(setCalled).toBe(false); // 기록 안 함 → 재시도 가능
  });

  it("스케줄이 없는 Task 는 무시한다", async () => {
    const noSched = createTask({ name: "x", kind: "backup", origin }, now, "x");
    const autorun = createAutorun({
      loadTasks: async () => [noSched],
      getLastRun: () => null,
      setLastRun: async () => {},
      runTask: async () => { throw new Error("실행되면 안 됨"); },
    });
    expect((await autorun.tick(now)).ran).toEqual([]);
  });
});
