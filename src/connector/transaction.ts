/**
 * 트랜잭션 실행 코어(Execution Engine).
 *
 * 커넥션 유사 객체(TxConnection)에 대해 문장들을 순서대로 실행하고,
 * 중간 실패 시 롤백한다. mysql2 커넥션이 이 인터페이스를 만족하므로,
 * 여기서는 드라이버를 몰라도 되고 테스트에서는 가짜 커넥션으로 대체한다.
 */

/** 트랜잭션에 필요한 최소 커넥션 계약. */
export interface TxConnection {
  beginTransaction(): Promise<void>;
  query(sql: string): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ExecuteResult {
  /** 실제로 실행 완료된 문장 수. */
  executed: number;
}

/**
 * 문장들을 하나의 트랜잭션으로 실행한다.
 * - 빈 배열은 아무 것도 하지 않는다(트랜잭션도 열지 않는다).
 * - 어느 문장이든 실패하면 즉시 ROLLBACK 후 원인 에러를 다시 던진다.
 * - 롤백 자체가 실패해도 원본 에러를 우선 전파한다.
 */
export async function runInTransaction(
  conn: TxConnection,
  statements: string[],
): Promise<ExecuteResult> {
  if (statements.length === 0) return { executed: 0 };

  await conn.beginTransaction();
  let executed = 0;
  try {
    for (const sql of statements) {
      await conn.query(sql);
      executed += 1;
    }
    await conn.commit();
    return { executed };
  } catch (err) {
    // 롤백 실패는 삼키고(로그 대상), 실행 중단의 근본 원인을 전파한다.
    try {
      await conn.rollback();
    } catch {
      /* 롤백 실패는 원본 에러를 가리지 않는다. */
    }
    throw err;
  }
}
