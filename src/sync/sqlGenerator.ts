/**
 * SQL Generator.
 *
 * 데이터 행 집합 + 대상 테이블 정의 + Sync Mode 를 받아
 * 실행 전 미리보기가 가능한 SQL 문 배열을 생성한다(순수 함수).
 *
 * generateSyncSql : 테이블 전체를 한 모드로 동기화하는 "코스(coarse)" 경로.
 * build* 빌딩 블록 : diff 기반 Sync Planner 가 조합하는 "파인(fine)" 경로.
 */

import type { DataRow, TableDef } from "../domain/types.js";
import type { SyncMode } from "./syncMode.js";
import { quoteId, quoteValue } from "./sqlDialect.js";

export interface GenerateOptions {
  table: TableDef;
  rows: DataRow[];
  mode: SyncMode;
  /** UPDATE/UPSERT 시 갱신할 컬럼을 제한한다(특정 컬럼만 동기화). 미지정 시 비 PK 전체. */
  updateColumns?: string[];
}

function columnList(cols: string[]): string {
  return cols.map(quoteId).join(", ");
}

function valueTuple(row: DataRow, cols: string[]): string {
  return "(" + cols.map((c) => quoteValue(row[c])).join(", ") + ")";
}

/** PK 를 제외한 갱신 대상 컬럼. only 를 주면 그 교집합만 사용한다. */
function updatableColumns(table: TableDef, only?: string[]): string[] {
  const pk = new Set(table.primaryKey);
  const nonKey = table.columns.map((c) => c.name).filter((c) => !pk.has(c));
  if (!only) return nonKey;
  const allow = new Set(only);
  return nonKey.filter((c) => allow.has(c));
}

/** INSERT ... VALUES (여러 행 일괄). */
export function buildInsert(table: TableDef, rows: DataRow[]): string {
  const cols = table.columns.map((c) => c.name);
  const values = rows.map((r) => valueTuple(r, cols)).join(",\n  ");
  return `INSERT INTO ${quoteId(table.name)} (${columnList(cols)}) VALUES\n  ${values};`;
}

/** INSERT ... ON DUPLICATE KEY UPDATE (UPSERT). */
export function buildUpsert(
  table: TableDef,
  rows: DataRow[],
  updateColumns?: string[],
): string {
  const insert = buildInsert(table, rows).replace(/;$/, "");
  const setClause = updatableColumns(table, updateColumns)
    .map((c) => `${quoteId(c)} = VALUES(${quoteId(c)})`)
    .join(", ");
  return `${insert}\nON DUPLICATE KEY UPDATE ${setClause};`;
}

/** PK 기준 행별 UPDATE 문. */
export function buildUpdates(
  table: TableDef,
  rows: DataRow[],
  updateColumns?: string[],
): string[] {
  const setCols = updatableColumns(table, updateColumns);
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

/** PK 기준 행별 DELETE 문. keyRows 는 최소한 PK 컬럼을 담고 있어야 한다. */
export function buildDeletes(table: TableDef, keyRows: DataRow[]): string[] {
  if (table.primaryKey.length === 0) {
    throw new Error(`DELETE 생성에는 PK 가 필요하다: ${table.name}`);
  }
  return keyRows.map((row) => {
    const where = table.primaryKey
      .map((c) => `${quoteId(c)} = ${quoteValue(row[c])}`)
      .join(" AND ");
    return `DELETE FROM ${quoteId(table.name)} WHERE ${where};`;
  });
}

/**
 * Sync Mode 에 맞는 SQL 문 배열을 생성한다(테이블 전체 대상 코스 경로).
 * 빈 rows 는 빈 배열을 돌려준다.
 */
export function generateSyncSql(opts: GenerateOptions): string[] {
  const { table, rows, mode, updateColumns } = opts;

  if (table.columns.length === 0) {
    throw new Error(`컬럼이 없는 테이블은 동기화할 수 없다: ${table.name}`);
  }
  if ((mode === "updateOnly" || mode === "upsert") && table.primaryKey.length === 0) {
    throw new Error(`${mode} 모드는 PK 가 필요하다(PK 없는 테이블: ${table.name})`);
  }
  if (rows.length === 0) return [];

  switch (mode) {
    case "overwrite":
      return [`TRUNCATE TABLE ${quoteId(table.name)};`, buildInsert(table, rows)];
    case "insertOnly":
      return [buildInsert(table, rows).replace(/^INSERT INTO/, "INSERT IGNORE INTO")];
    case "updateOnly":
      return buildUpdates(table, rows, updateColumns);
    case "upsert":
      return [buildUpsert(table, rows, updateColumns)];
  }
}
