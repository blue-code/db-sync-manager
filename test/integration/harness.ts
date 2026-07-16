/**
 * 통합 테스트 하네스.
 *
 * 임베디드 MySQL(mysql-memory-server)을 한 번 띄우고, 셋업용 원시 SQL 을
 * 실행하는 유틸을 제공한다. 최초 실행은 MySQL 바이너리를 내려받는다.
 */

import { createDB } from "mysql-memory-server";
import mysql from "mysql2/promise";
import type { ConnectionConfig } from "../../src/index.js";

export interface MysqlInstance {
  port: number;
  stop: () => Promise<void>;
}

/** MySQL 인스턴스를 기동한다. */
export async function bootMysql(): Promise<MysqlInstance> {
  const db = await createDB({ dbName: "bootstrap", logLevel: "ERROR" });
  return { port: db.port, stop: db.stop };
}

/** 특정 데이터베이스를 가리키는 접속 설정. */
export function conf(port: number, database: string): ConnectionConfig {
  return { host: "127.0.0.1", port, user: "root", password: "", database };
}

/** 셋업용 SQL 을 순서대로 실행한다(데이터베이스 미선택 접속). */
export async function runSetup(port: number, statements: string[]): Promise<void> {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port,
    user: "root",
    password: "",
  });
  try {
    for (const s of statements) await conn.query(s);
  } finally {
    await conn.end();
  }
}
