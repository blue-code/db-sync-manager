import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTask } from "../src/task/task.js";
import { TaskStore, upsertTask } from "../src/task/taskStore.js";
import { nextRun } from "../src/scheduler/schedule.js";

const now = new Date(2026, 6, 16, 2, 0, 0);
const origin = { host: "h", port: 3306, user: "u", database: "prod" };
const target = { host: "h2", port: 3306, user: "u", database: "dev" };

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function store(): Promise<TaskStore> {
  const dir = await mkdtemp(join(tmpdir(), "dsm-task-"));
  dirs.push(dir);
  return new TaskStore(join(dir, "tasks.json"));
}

describe("TaskStore 영속화", () => {
  it("없는 파일은 빈 목록을 돌려준다", async () => {
    expect(await (await store()).load()).toEqual([]);
  });

  it("저장한 Task 를 그대로 다시 읽는다(스케줄 포함)", async () => {
    const s = await store();
    const task = createTask(
      {
        name: "야간 백업",
        kind: "backup",
        origin,
        schedule: { kind: "daily", hour: 2, minute: 0 },
      },
      now,
    );
    await s.save(upsertTask([], task, now));

    const loaded = await s.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe("야간 백업");
    expect(loaded[0]!.schedule).toEqual({ kind: "daily", hour: 2, minute: 0 });
  });

  it("비밀번호가 저장되지 않음을 파일 형태로 재확인한다", async () => {
    const s = await store();
    const task = createTask({ name: "s", kind: "syncFine", origin, target, mode: "upsert" }, now);
    await s.save(upsertTask([], task, now));
    const loaded = await s.load();
    expect(loaded[0]!.origin).not.toHaveProperty("password");
  });

  it("저장된 스케줄로 다음 실행 시각을 계산할 수 있다", async () => {
    const s = await store();
    const task = createTask(
      { name: "s", kind: "backup", origin, schedule: { kind: "daily", hour: 2, minute: 0 } },
      now,
    );
    await s.save(upsertTask([], task, now));
    const loaded = (await s.load())[0]!;

    const from = new Date(2026, 6, 16, 3, 0, 0); // 이미 지난 시각
    expect(nextRun(loaded.schedule!, from)).toEqual(new Date(2026, 6, 17, 2, 0, 0));
  });
});
