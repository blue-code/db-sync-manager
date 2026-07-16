/**
 * 스키마 매퍼(순수).
 *
 * INFORMATION_SCHEMA 원시 행 → SchemaSnapshot 으로 정규화한다.
 * DB 접속 없이 목 데이터로 완전히 테스트 가능한 것이 이 모듈의 존재 이유다.
 */

import type {
  ColumnDef,
  IndexDef,
  SchemaSnapshot,
  TableDef,
} from "../domain/types.js";
import type {
  RawColumnRow,
  RawIndexRow,
  RawTableRow,
} from "./informationSchema.js";

/** 컬럼 원시 행을 ColumnDef 로 변환한다. */
function toColumn(row: RawColumnRow): ColumnDef {
  const col: ColumnDef = {
    name: row.COLUMN_NAME,
    dataType: row.COLUMN_TYPE.toLowerCase(),
    nullable: row.IS_NULLABLE === "YES",
    default: row.COLUMN_DEFAULT,
    autoIncrement: row.EXTRA.toLowerCase().includes("auto_increment"),
    position: row.ORDINAL_POSITION,
  };
  // 빈 코멘트는 굳이 담지 않는다(스냅샷 비교 노이즈 최소화).
  if (row.COLUMN_COMMENT) col.comment = row.COLUMN_COMMENT;
  return col;
}

/** 특정 테이블의 인덱스 행들을 IndexDef[] 로 묶는다(INDEX_NAME 기준). */
function groupIndexes(rows: RawIndexRow[]): IndexDef[] {
  const map = new Map<string, IndexDef>();
  for (const r of rows) {
    let idx = map.get(r.INDEX_NAME);
    if (!idx) {
      idx = { name: r.INDEX_NAME, unique: r.NON_UNIQUE === 0, columns: [] };
      map.set(r.INDEX_NAME, idx);
    }
    idx.columns.push(r.COLUMN_NAME);
  }
  return [...map.values()];
}

/** 인덱스 목록에서 PK(name="PRIMARY") 구성 컬럼을 뽑는다. */
function primaryKeyOf(indexes: IndexDef[]): string[] {
  return indexes.find((i) => i.name === "PRIMARY")?.columns ?? [];
}

/**
 * 원시 행 3종을 받아 SchemaSnapshot 을 구성한다.
 * TABLES 를 기준 목록으로 삼아, 컬럼이 없는 테이블도 누락하지 않는다.
 */
export function buildSnapshot(
  database: string,
  tableRows: RawTableRow[],
  columnRows: RawColumnRow[],
  indexRows: RawIndexRow[],
): SchemaSnapshot {
  const colsByTable = groupBy(columnRows, (r) => r.TABLE_NAME);
  const idxByTable = groupBy(indexRows, (r) => r.TABLE_NAME);

  const tables: TableDef[] = tableRows.map((t) => {
    const columns = (colsByTable.get(t.TABLE_NAME) ?? []).map(toColumn);
    const indexes = groupIndexes(idxByTable.get(t.TABLE_NAME) ?? []);
    const table: TableDef = {
      name: t.TABLE_NAME,
      columns,
      primaryKey: primaryKeyOf(indexes),
      indexes,
    };
    if (t.ENGINE) table.engine = t.ENGINE;
    if (t.TABLE_COLLATION) table.charset = t.TABLE_COLLATION;
    return table;
  });

  return { database, tables };
}

/** 키 함수로 배열을 그룹핑한다(입력 순서 보존). */
function groupBy<T>(items: T[], keyOf: (it: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = keyOf(it);
    const bucket = map.get(key);
    if (bucket) bucket.push(it);
    else map.set(key, [it]);
  }
  return map;
}
