/**
 * TaskStore — Task 영속화(I/O).
 *
 * Task 목록을 단일 JSON 파일에 저장/로드한다. 비밀번호는 애초에 Task 에
 * 없으므로 파일에도 남지 않는다. 순수 조작(upsert/remove)은 별도 함수로 두어
 * 파일 없이도 검증 가능하게 했다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Task } from "./task.js";

interface TaskFile {
  version: 1;
  tasks: Task[];
}

/** 목록에 Task 를 upsert 한다(같은 id 면 교체, updatedAt 갱신). 순수. */
export function upsertTask(tasks: Task[], task: Task, now: Date): Task[] {
  const next = { ...task, updatedAt: now.toISOString() };
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) return [...tasks, next];
  const copy = tasks.slice();
  copy[idx] = next;
  return copy;
}

/** 목록에서 id 로 제거한다. 순수. */
export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id);
}

export class TaskStore {
  constructor(private filePath: string) {}

  /** 파일에서 Task 목록을 로드한다. 없으면 빈 목록. */
  async load(): Promise<Task[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TaskFile;
      return parsed.tasks ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  /** Task 목록을 파일에 저장한다(디렉터리 자동 생성). */
  async save(tasks: Task[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const file: TaskFile = { version: 1, tasks };
    await writeFile(this.filePath, JSON.stringify(file, null, 2), "utf8");
  }
}
