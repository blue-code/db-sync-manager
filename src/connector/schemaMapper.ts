/**
 * 스키마 매퍼(순수).
 *
 * INFORMATION_SCHEMA 원시 행 → SchemaSnapshot 으로 정규화한다.
 * DB 접속 없이 목 데이터로 완전히 테스트 가능한 것이 이 모듈의 존재 이유다.
 */

import type {
  ColumnDef,
  EventDef,
  ForeignKeyDef,
  IndexDef,
  RoutineDef,
  SchemaSnapshot,
  TableDef,
  TriggerDef,
  ViewDef,
} from "../domain/types.js";
import type {
  RawColumnRow,
  RawEventRow,
  RawForeignKeyRow,
  RawIndexRow,
  RawRoutineRow,
  RawTableRow,
  RawTriggerRow,
  RawViewRow,
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

/** 특정 테이블의 FK 행들을 CONSTRAINT_NAME 기준으로 묶는다. */
function groupForeignKeys(rows: RawForeignKeyRow[]): ForeignKeyDef[] {
  const map = new Map<string, ForeignKeyDef>();
  for (const r of rows) {
    let fk = map.get(r.CONSTRAINT_NAME);
    if (!fk) {
      fk = {
        name: r.CONSTRAINT_NAME,
        columns: [],
        refTable: r.REFERENCED_TABLE_NAME,
        refColumns: [],
      };
      if (r.UPDATE_RULE) fk.onUpdate = r.UPDATE_RULE;
      if (r.DELETE_RULE) fk.onDelete = r.DELETE_RULE;
      map.set(r.CONSTRAINT_NAME, fk);
    }
    fk.columns.push(r.COLUMN_NAME);
    fk.refColumns.push(r.REFERENCED_COLUMN_NAME);
  }
  return [...map.values()];
}

/** 원시 행 묶음(선택 항목 포함). 커넥터가 조회 결과를 담아 넘긴다. */
export interface RawSchema {
  tables: RawTableRow[];
  columns: RawColumnRow[];
  indexes: RawIndexRow[];
  foreignKeys?: RawForeignKeyRow[];
  views?: RawViewRow[];
  routines?: RawRoutineRow[];
  triggers?: RawTriggerRow[];
  events?: RawEventRow[];
}

/**
 * 원시 행 묶음을 받아 SchemaSnapshot 을 구성한다.
 * TABLES 를 기준 목록으로 삼아, 컬럼이 없는 테이블도 누락하지 않는다.
 * FK/View/Routine/Trigger/Event 는 제공된 경우에만 채운다.
 */
export function buildSnapshot(database: string, raw: RawSchema): SchemaSnapshot {
  const colsByTable = groupBy(raw.columns, (r) => r.TABLE_NAME);
  const idxByTable = groupBy(raw.indexes, (r) => r.TABLE_NAME);
  const fkByTable = groupBy(raw.foreignKeys ?? [], (r) => r.TABLE_NAME);

  const tables: TableDef[] = raw.tables.map((t) => {
    const columns = (colsByTable.get(t.TABLE_NAME) ?? []).map(toColumn);
    const indexes = groupIndexes(idxByTable.get(t.TABLE_NAME) ?? []);
    const table: TableDef = {
      name: t.TABLE_NAME,
      columns,
      primaryKey: primaryKeyOf(indexes),
      indexes,
      foreignKeys: groupForeignKeys(fkByTable.get(t.TABLE_NAME) ?? []),
    };
    if (t.ENGINE) table.engine = t.ENGINE;
    if (t.TABLE_COLLATION) table.charset = t.TABLE_COLLATION;
    return table;
  });

  const views: ViewDef[] = (raw.views ?? []).map((v) => ({
    name: v.TABLE_NAME,
    definition: v.VIEW_DEFINITION ?? "",
  }));
  const routines: RoutineDef[] = (raw.routines ?? []).map((r) => {
    const def: RoutineDef = {
      name: r.ROUTINE_NAME,
      type: r.ROUTINE_TYPE,
      definition: r.ROUTINE_DEFINITION ?? "",
    };
    if (r.CREATE_STATEMENT) def.createStatement = r.CREATE_STATEMENT;
    return def;
  });
  const triggers: TriggerDef[] = (raw.triggers ?? []).map((t) => ({
    name: t.TRIGGER_NAME,
    table: t.EVENT_OBJECT_TABLE,
    timing: t.ACTION_TIMING,
    event: t.EVENT_MANIPULATION,
    statement: t.ACTION_STATEMENT,
  }));
  const events: EventDef[] = (raw.events ?? []).map((e) => {
    const def: EventDef = { name: e.EVENT_NAME, definition: e.EVENT_DEFINITION ?? "" };
    if (e.CREATE_STATEMENT) def.createStatement = e.CREATE_STATEMENT;
    return def;
  });

  return { database, tables, views, routines, triggers, events };
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
