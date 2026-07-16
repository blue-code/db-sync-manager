/**
 * HistoryStore — 실행 기록 영속화(I/O).
 *
 * 기록은 append-only JSONL 로 남긴다(한 줄 = 한 실행). 추가만 하므로
 * 대용량에도 안전하고, 과거 기록을 훼손하지 않는다.
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { HistoryEntry } from "./history.js";

export class HistoryStore {
  constructor(private filePath: string) {}

  /** 항목 하나를 JSONL 한 줄로 추가한다. */
  async append(entry: HistoryEntry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf8");
  }

  /** 전체 기록을 최신순으로 로드한다. 파일이 없으면 빈 배열. */
  async list(): Promise<HistoryEntry[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const entries = raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as HistoryEntry);
      return entries.reverse();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  /** id 로 특정 기록을 찾는다(재실행용). */
  async get(id: string): Promise<HistoryEntry | undefined> {
    const all = await this.list();
    return all.find((e) => e.id === id);
  }
}
