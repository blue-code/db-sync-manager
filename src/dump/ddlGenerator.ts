/**
 * DDL 생성기(순수).
 *
 * TableDef → CREATE TABLE 문. Dump(스키마) 및 Restore 의 기반이다.
 * INFORMATION_SCHEMA 에서 뽑은 정규화 정보만으로 재현 가능한 수준을 목표로 한다.
 * (FK/트리거/파티션 등 고급 요소는 후속 확장 대상)
 */

import type { ColumnDef, IndexDef, TableDef } from "../domain/types.js";
import { quoteId, quoteValue } from "../sync/sqlDialect.js";

/** DEFAULT 절을 렌더링한다. 함수/키워드는 그대로, 숫자는 무인용, 문자열은 인용. */
function renderDefault(col: ColumnDef): string {
  if (col.autoIncrement) return "";
  const dv = col.default;
  if (dv === null) return col.nullable ? "DEFAULT NULL" : "";

  // CURRENT_TIMESTAMP, NOW(), TRUE/FALSE 등 표현식/키워드는 인용하지 않는다.
  if (/^(current_timestamp|now|null|true|false)/i.test(dv) || dv.includes("(")) {
    return `DEFAULT ${dv}`;
  }
  // 순수 숫자 리터럴은 무인용.
  if (/^-?\d+(\.\d+)?$/.test(dv)) return `DEFAULT ${dv}`;
  // 그 외 문자열 기본값.
  return `DEFAULT ${quoteValue(dv)}`;
}

/** 컬럼 한 줄을 렌더링한다. */
function renderColumn(col: ColumnDef): string {
  const parts = [quoteId(col.name), col.dataType];

  if (col.autoIncrement) {
    parts.push("NOT NULL", "AUTO_INCREMENT");
  } else {
    if (!col.nullable) parts.push("NOT NULL");
    const def = renderDefault(col);
    if (def) parts.push(def);
  }
  if (col.comment) parts.push(`COMMENT ${quoteValue(col.comment)}`);

  return parts.join(" ");
}

/** 인덱스(PK 제외) 한 줄을 렌더링한다. */
function renderIndex(idx: IndexDef): string {
  const cols = idx.columns.map(quoteId).join(", ");
  const kind = idx.unique ? "UNIQUE KEY" : "KEY";
  return `${kind} ${quoteId(idx.name)} (${cols})`;
}

export interface CreateTableOptions {
  /** CREATE TABLE 앞에 DROP TABLE IF EXISTS 를 붙인다. */
  dropTable?: boolean;
  /** CREATE TABLE IF NOT EXISTS 로 생성한다. */
  ifNotExists?: boolean;
}

/** TableDef 로부터 CREATE TABLE 문을 만든다. */
export function buildCreateTable(
  table: TableDef,
  options: CreateTableOptions = {},
): string {
  if (table.columns.length === 0) {
    throw new Error(`컬럼이 없는 테이블은 DDL 을 생성할 수 없다: ${table.name}`);
  }

  const lines: string[] = table.columns.map((c) => "  " + renderColumn(c));

  if (table.primaryKey.length) {
    const pk = table.primaryKey.map(quoteId).join(", ");
    lines.push(`  PRIMARY KEY (${pk})`);
  }
  for (const idx of table.indexes) {
    if (idx.name === "PRIMARY") continue; // PK 는 위에서 처리했다.
    lines.push("  " + renderIndex(idx));
  }

  const head =
    `CREATE TABLE ${options.ifNotExists ? "IF NOT EXISTS " : ""}` +
    quoteId(table.name);
  const tail = table.engine ? ` ENGINE=${table.engine}` : "";
  const create = `${head} (\n${lines.join(",\n")}\n)${tail};`;

  return options.dropTable
    ? `DROP TABLE IF EXISTS ${quoteId(table.name)};\n${create}`
    : create;
}
