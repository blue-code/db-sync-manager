/**
 * MySQL/MariaDB 커넥터 구현체.
 *
 * DbConnector 포트를 mysql2 로 구현한다. 이 파일은 "배선(wiring)"만 담당하고,
 * 실제 판단 로직(매핑/권한/트랜잭션)은 순수 모듈에 위임한다.
 * 접속은 요청 단위로 열고 반드시 닫는다(도구 특성상 상시 풀 유지 불필요).
 */

import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import type {
  ConnectionConfig,
  DataRow,
  SchemaSnapshot,
} from "../domain/types.js";
import type { DbConnector } from "./DbConnector.js";
import {
  QUERY_COLUMNS,
  QUERY_INDEXES,
  QUERY_TABLES,
  QUERY_FOREIGN_KEYS,
  QUERY_VIEWS,
  QUERY_ROUTINES,
  QUERY_TRIGGERS,
  QUERY_EVENTS,
  type RawColumnRow,
  type RawEventRow,
  type RawForeignKeyRow,
  type RawIndexRow,
  type RawRoutineRow,
  type RawTableRow,
  type RawTriggerRow,
  type RawViewRow,
} from "./informationSchema.js";
import { buildSnapshot } from "./schemaMapper.js";
import { runInTransaction } from "./transaction.js";
import { quoteId } from "../sync/sqlDialect.js";

/** ConnectionConfig → mysql2 접속 옵션. */
function toConnectionOptions(config: ConnectionConfig): mysql.ConnectionOptions {
  const opts: mysql.ConnectionOptions = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    // 큰 정수 손실을 막고, 날짜는 문자열로 받아 방언 매핑을 일관되게 한다.
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    multipleStatements: false,
    // 접속 불가한 호스트에서 무한 대기하지 않도록 8초 제한(연결 테스트 응답성).
    connectTimeout: 8000,
  };
  // SSL: 접속은 하되 서버 인증서는 검증하지 않는다(self-signed 허용).
  if (config.ssl) opts.ssl = { rejectUnauthorized: false };
  return opts;
}

export class MysqlConnector implements DbConnector {
  /** 접속 후 콜백을 실행하고 반드시 커넥션을 종료한다. */
  private async withConnection<T>(
    config: ConnectionConfig,
    fn: (conn: mysql.Connection) => Promise<T>,
  ): Promise<T> {
    const conn = await mysql.createConnection(toConnectionOptions(config));
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  async ping(config: ConnectionConfig): Promise<boolean> {
    try {
      await this.withConnection(config, async (conn) => {
        await conn.query("SELECT 1");
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchSchema(config: ConnectionConfig): Promise<SchemaSnapshot> {
    return this.withConnection(config, async (conn) => {
      const db = config.database;
      const q = async <T>(sql: string) =>
        (await conn.query<RowDataPacket[]>(sql, [db]))[0] as unknown as T[];

      const routines = await q<RawRoutineRow>(QUERY_ROUTINES);
      // 루틴 전체 DDL(파라미터/반환 포함)은 SHOW CREATE 로만 얻는다.
      for (const r of routines) {
        const col = r.ROUTINE_TYPE === "PROCEDURE" ? "Create Procedure" : "Create Function";
        const [rows] = await conn.query<RowDataPacket[]>(
          `SHOW CREATE ${r.ROUTINE_TYPE} ${quoteId(db)}.${quoteId(r.ROUTINE_NAME)}`,
        );
        const row = rows[0];
        if (row) r.CREATE_STATEMENT = String(row[col] ?? "");
      }

      const events = await q<RawEventRow>(QUERY_EVENTS);
      // 이벤트 전체 DDL(스케줄 포함)도 SHOW CREATE 로 얻는다.
      for (const e of events) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SHOW CREATE EVENT ${quoteId(db)}.${quoteId(e.EVENT_NAME)}`,
        );
        const row = rows[0];
        if (row) e.CREATE_STATEMENT = String(row["Create Event"] ?? "");
      }

      return buildSnapshot(db, {
        tables: await q<RawTableRow>(QUERY_TABLES),
        columns: await q<RawColumnRow>(QUERY_COLUMNS),
        indexes: await q<RawIndexRow>(QUERY_INDEXES),
        foreignKeys: await q<RawForeignKeyRow>(QUERY_FOREIGN_KEYS),
        views: await q<RawViewRow>(QUERY_VIEWS),
        routines,
        triggers: await q<RawTriggerRow>(QUERY_TRIGGERS),
        events,
      });
    });
  }

  async fetchRows(config: ConnectionConfig, table: string): Promise<DataRow[]> {
    return this.withConnection(config, async (conn) => {
      // 테이블명은 식별자 인용으로 처리한다(파라미터 바인딩 대상이 아님).
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${quoteId(table)}`,
      );
      return rows as DataRow[];
    });
  }

  async fetchGrants(config: ConnectionConfig): Promise<string[]> {
    return this.withConnection(config, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SHOW GRANTS");
      // SHOW GRANTS 는 단일 컬럼 결과다. 각 행의 첫 값을 문자열로 취한다.
      return rows.map((r) => String(Object.values(r)[0]));
    });
  }

  async execute(
    config: ConnectionConfig,
    statements: string[],
  ): Promise<number> {
    return this.withConnection(config, async (conn) => {
      const result = await runInTransaction(conn, statements);
      return result.executed;
    });
  }
}
