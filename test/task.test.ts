import { describe, it, expect } from "vitest";
import {
  createTask,
  validateTask,
  generateTaskId,
  stripPassword,
  type TaskInput,
} from "../src/task/task.js";
import { upsertTask, removeTask } from "../src/task/taskStore.js";

const now = new Date(2026, 6, 16, 2, 0, 0);
const origin = { host: "h", port: 3306, user: "u", database: "prod" };
const target = { host: "h2", port: 3306, user: "u", database: "dev" };

describe("stripPassword", () => {
  it("비밀번호를 제거한다(저장 안전)", () => {
    const saved = stripPassword({ ...origin, password: "secret" });
    expect(saved).not.toHaveProperty("password");
    expect(saved.database).toBe("prod");
  });
});

describe("generateTaskId / createTask", () => {
  it("task_YYYYMMDD_slug 형식 ID 를 만든다", () => {
    expect(generateTaskId("선물 필터 동기화", now)).toBe("task_20260716_선물_필터_동기화");
  });

  it("생성 시 createdAt 을 채운다", () => {
    const input: TaskInput = { name: "복제", kind: "syncCoarse", origin, target, mode: "overwrite" };
    const task = createTask(input, now);
    expect(task.id).toContain("task_20260716_");
    expect(task.createdAt).toBe(now.toISOString());
  });
});

describe("validateTask", () => {
  it("정상 sync Task 는 오류가 없다", () => {
    const task = createTask({ name: "s", kind: "syncFine", origin, target, mode: "upsert" }, now);
    expect(validateTask(task)).toEqual([]);
  });

  it("sync 인데 mode/target 이 없으면 오류를 낸다", () => {
    const task = createTask({ name: "s", kind: "syncCoarse", origin }, now);
    const errs = validateTask(task);
    expect(errs.some((e) => /target/.test(e))).toBe(true);
    expect(errs.some((e) => /mode/.test(e))).toBe(true);
  });

  it("syncFine 은 overwrite 를 거부한다", () => {
    const task = createTask({ name: "s", kind: "syncFine", origin, target, mode: "overwrite" }, now);
    expect(validateTask(task).some((e) => /overwrite/.test(e))).toBe(true);
  });
});

describe("upsertTask / removeTask", () => {
  it("신규는 추가, 동일 id 는 교체하며 updatedAt 을 갱신한다", () => {
    const t1 = createTask({ name: "a", kind: "backup", origin }, now);
    let list = upsertTask([], t1, now);
    expect(list).toHaveLength(1);

    const later = new Date(2026, 6, 17, 2, 0, 0);
    list = upsertTask(list, { ...t1, name: "a-수정" }, later);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("a-수정");
    expect(list[0]!.updatedAt).toBe(later.toISOString());
  });

  it("id 로 제거한다", () => {
    const t = createTask({ name: "a", kind: "backup", origin }, now);
    expect(removeTask([t], t.id)).toEqual([]);
  });
});
