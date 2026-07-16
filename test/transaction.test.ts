import { describe, it, expect } from "vitest";
import { runInTransaction, type TxConnection } from "../src/connector/transaction.js";

/** 호출 순서를 기록하는 가짜 커넥션. failOn 문장에서 예외를 던진다. */
class FakeConnection implements TxConnection {
  calls: string[] = [];
  constructor(private failOn?: string) {}

  async beginTransaction(): Promise<void> {
    this.calls.push("BEGIN");
  }
  async query(sql: string): Promise<unknown> {
    this.calls.push(`QUERY:${sql}`);
    if (sql === this.failOn) throw new Error(`실패: ${sql}`);
    return undefined;
  }
  async commit(): Promise<void> {
    this.calls.push("COMMIT");
  }
  async rollback(): Promise<void> {
    this.calls.push("ROLLBACK");
  }
}

describe("runInTransaction", () => {
  it("빈 문장 배열은 트랜잭션을 열지 않는다", async () => {
    const conn = new FakeConnection();
    const result = await runInTransaction(conn, []);
    expect(result.executed).toBe(0);
    expect(conn.calls).toEqual([]);
  });

  it("모든 문장을 BEGIN→QUERY→COMMIT 순으로 실행한다", async () => {
    const conn = new FakeConnection();
    const result = await runInTransaction(conn, ["A", "B"]);
    expect(result.executed).toBe(2);
    expect(conn.calls).toEqual(["BEGIN", "QUERY:A", "QUERY:B", "COMMIT"]);
  });

  it("중간 실패 시 ROLLBACK 하고 원인 에러를 던진다", async () => {
    const conn = new FakeConnection("B");
    await expect(runInTransaction(conn, ["A", "B", "C"])).rejects.toThrow("실패: B");
    // C 는 실행되지 않고, COMMIT 대신 ROLLBACK 이 호출돼야 한다.
    expect(conn.calls).toEqual(["BEGIN", "QUERY:A", "QUERY:B", "ROLLBACK"]);
  });
});
