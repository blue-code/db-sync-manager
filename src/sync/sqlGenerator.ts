/**
 * SQL Generator.
 *
 * 데이터 행 집합 + 대상 테이블 정의 + Sync Mode 를 받아
 * 실행 전 미리보기가 가능한 SQL 문 배열을 생성한다(순수 함수).
 *
 * 실제 실행(Execution Engine)은 이 문장들을 트랜잭션으로 감싸 처리한다.
 */

import type { DataRow, TableDef } from "../domain/types.js";
import type { SyncMode } from "./syncMode.js";
import { quoteId, quoteValue } from "./sqlDialect.js";

export interface GenerateOptions {
  table: TableDef;
  rows: DataRow[];
  mode: SyncMode;
}

/** 지정 컬럼 순서대로 (컬럼목록, 값목록) 을 만든다. */
function columnList(cols: string[]): string {
  return cols.map(quoteId).join(", ");
}

function valueTuple(row: DataRow, cols: string[]): string {
  return "(" + cols.map((c) => quoteValue(row[c])).join(", ") + ")";
}

/** PK 를 제외한 갱신 대상 컬럼(UPDATE/UPSERT SET 절에 쓰인다). */
function nonKeyColumns(table: TableDef): string[] {
  const pk = new Set(table.primaryKey);
  return table.columns.map((c) => c.name).filter((c) => !pk.has(c));
}

/** INSERT ... VALUES 한 문장을 만든다(여러 행을 한 번에). */
function buildInsert(table: TableDef, rows: DataRow[]): string {
  const cols = table.columns.map((c) => c.name);
  const values = rows.map((r) => valueTuple(r, cols)).join(",\n  ");
  return (
    `INSERT INTO ${quoteId(table.name)} (${columnList(cols)}) VALUES\n  ${values};`
  );
}

/** UPSERT: INSERT ... ON DUPLICATE KEY UPDATE. */
function buildUpsert(table: TableDef, rows: DataRow[]): string {
  const insert = buildInsert(table, rows).replace(/;$/, "");
  const setClause = nonKeyColumns(table)
    .map((c) => `${quoteId(c)} = VALUES(${quoteId(c)})`)
    .join(", ");
  return `${insert}\nON DUPLICATE KEY UPDATE ${setClause};`;
}

/** UPDATE: PK 기준으로 행별 UPDATE 문을 만든다. */
function buildUpdates(table: TableDef, rows: DataRow[]): string[] {
  const setCols = nonKeyColumns(table);
  return rows.map((row) => {
    const set = setCols
      .map((c) => `${quoteId(c)} = ${quoteValue(row[c])}`)
      .join(", ");
    const where = table.primaryKey
      .map((c) => `${quoteId(c)} = ${quoteValue(row[c])}`)
      .join(" AND ");
    return `UPDATE ${quoteId(table.name)} SET ${set} WHERE ${where};`;
  });
}

/**
 * Sync Mode 에 맞는 SQL 문 배열을 생성한다.
 * 빈 rows 는 빈 배열을 돌려준다(불필요한 TRUNCATE 등을 만들지 않는다).
 */
export function generateSyncSql(opts: GenerateOptions): string[] {
  const { table, rows, mode } = opts;

  if (table.columns.length === 0) {
    throw new Error(`컬럼이 없는 테이블은 동기화할 수 없다: ${table.name}`);
  }
  if ((mode === "updateOnly" || mode === "upsert") && table.primaryKey.length === 0) {
    throw new Error(
      `${mode} 모드는 PK 가 필요하다(PK 없는 테이블: ${table.name})`,
    );
  }
  if (rows.length === 0) return [];

  switch (mode) {
    case "overwrite":
      // 구조는 유지하고 데이터만 교체: TRUNCATE 후 일괄 INSERT.
      return [`TRUNCATE TABLE ${quoteId(table.name)};`, buildInsert(table, rows)];

    case "insertOnly":
      // 신규만 추가. 중복 PK 는 무시(IGNORE)해 기존 행을 보존한다.
      return [buildInsert(table, rows).replace(/^INSERT INTO/, "INSERT IGNORE INTO")];

    case "updateOnly":
      return buildUpdates(table, rows);

    case "upsert":
      return [buildUpsert(table, rows)];
  }
}
