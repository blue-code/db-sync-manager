import { describe, it, expect } from "vitest";
import { formatLogLine, MemorySink, RunLogger } from "../src/logging/logger.js";

const at = new Date(2026, 6, 16, 2, 0, 0);

describe("formatLogLine", () => {
  it("SQL 이 없으면 한 줄로 포맷한다", () => {
    const line = formatLogLine({ at: at.toISOString(), level: "info", event: "start", message: "시작" });
    expect(line).toContain("INFO start 시작");
  });
  it("SQL 이 있으면 두 번째 줄에 표시한다", () => {
    const line = formatLogLine({
      at: at.toISOString(),
      level: "info",
      event: "sql",
      message: "문장 실행",
      sql: "DELETE FROM t WHERE id=1",
    });
    expect(line).toContain("SQL> DELETE FROM t WHERE id=1");
  });
});

describe("RunLogger", () => {
  it("start/statement/complete/error 를 순서대로 기록한다", async () => {
    const sink = new MemorySink();
    const logger = new RunLogger(sink, () => at);

    await logger.start("동기화 시작");
    await logger.statement("INSERT INTO t VALUES (1)");
    await logger.error("실패", "UPDATE t SET x=1");
    await logger.complete("종료");

    expect(sink.entries.map((e) => e.event)).toEqual(["start", "sql", "error", "complete"]);
    expect(sink.entries[2]!.level).toBe("error");
    expect(sink.entries[1]!.sql).toBe("INSERT INTO t VALUES (1)");
    expect(sink.render()).toContain("SQL> INSERT INTO t VALUES (1)");
  });
});
