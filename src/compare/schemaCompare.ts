/**
 * Schema Compare 엔진.
 *
 * 두 SchemaSnapshot 을 받아 순수하게 구조 차이를 계산한다.
 * 테이블(컬럼/인덱스/FK) + DB 레벨 객체(View/Routine/Trigger/Event) 를 비교한다.
 * DB 접속/IO 는 전혀 하지 않는다(테스트 용이성·재현성 확보).
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
  ColumnDiff,
  FieldChange,
  NamedDiff,
  ObjectDiff,
  ObjectKind,
  SchemaDiff,
  TableDiff,
} from "../domain/diff.js";

/** 이름 → 항목 맵으로 변환(비교 시 O(1) 조회). */
function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((it) => [it.name, it]));
}

/**
 * 이름 기반 컬렉션의 상태 차이를 계산한다(인덱스/FK/객체 공용).
 * added=origin 에만 / removed=target 에만 / modified=equal 이 false.
 */
function diffNamed<T extends { name: string }>(
  origin: T[] | undefined,
  target: T[] | undefined,
  equal: (a: T, b: T) => boolean,
): NamedDiff[] {
  const o = byName(origin ?? []);
  const t = byName(target ?? []);
  const names = new Set([...o.keys(), ...t.keys()]);

  const result: NamedDiff[] = [];
  for (const name of names) {
    const a = o.get(name);
    const b = t.get(name);
    if (a && !b) result.push({ name, status: "added" });
    else if (!a && b) result.push({ name, status: "removed" });
    else if (a && b) result.push({ name, status: equal(a, b) ? "identical" : "modified" });
  }
  return result.sort((x, y) => x.name.localeCompare(y.name));
}

/** 두 컬럼의 속성을 비교해 바뀐 필드만 뽑아낸다. */
function diffColumn(origin: ColumnDef, target: ColumnDef): FieldChange[] {
  const changes: FieldChange[] = [];
  const push = (field: string, o: string | null, t: string | null) => {
    if (o !== t) changes.push({ field, origin: o, target: t });
  };
  push("dataType", origin.dataType, target.dataType);
  push("nullable", String(origin.nullable), String(target.nullable));
  push("default", origin.default, target.default);
  push("autoIncrement", String(origin.autoIncrement), String(target.autoIncrement));
  return changes;
}

/** 한 테이블의 컬럼 집합을 비교한다. */
function diffColumns(origin: TableDef, target: TableDef): ColumnDiff[] {
  const originCols = byName(origin.columns);
  const targetCols = byName(target.columns);
  const names = new Set([...originCols.keys(), ...targetCols.keys()]);

  const result: ColumnDiff[] = [];
  for (const name of names) {
    const o = originCols.get(name);
    const t = targetCols.get(name);
    if (o && !t) result.push({ name, status: "added", changes: [] });
    else if (!o && t) result.push({ name, status: "removed", changes: [] });
    else if (o && t) {
      const changes = diffColumn(o, t);
      result.push({ name, status: changes.length ? "modified" : "identical", changes });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** 인덱스 동등성: 유니크 여부 + 구성 컬럼(순서 포함). */
function indexEqual(a: IndexDef, b: IndexDef): boolean {
  return a.unique === b.unique && a.columns.join(",") === b.columns.join(",");
}

/** FK 동등성: 컬럼/참조 대상/참조 컬럼/동작. */
function fkEqual(a: ForeignKeyDef, b: ForeignKeyDef): boolean {
  return (
    a.columns.join(",") === b.columns.join(",") &&
    a.refTable === b.refTable &&
    a.refColumns.join(",") === b.refColumns.join(",") &&
    (a.onUpdate ?? "") === (b.onUpdate ?? "") &&
    (a.onDelete ?? "") === (b.onDelete ?? "")
  );
}

/** 정의 문자열 정규화(공백 차이로 인한 오탐 제거). */
function normalizeDef(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** 테이블 종합 상태: 컬럼/인덱스/FK 중 하나라도 다르면 modified. */
function tableStatus(
  columns: ColumnDiff[],
  indexes: NamedDiff[],
  foreignKeys: NamedDiff[],
): TableDiff["status"] {
  const allSame =
    columns.every((c) => c.status === "identical") &&
    indexes.every((i) => i.status === "identical") &&
    foreignKeys.every((f) => f.status === "identical");
  return allSame ? "identical" : "modified";
}

/** DB 레벨 객체(View/Routine/Trigger/Event) 차이를 계산한다. */
function diffObjects(origin: SchemaSnapshot, target: SchemaSnapshot): ObjectDiff[] {
  const viewEqual = (a: ViewDef, b: ViewDef) => normalizeDef(a.definition) === normalizeDef(b.definition);
  const routineEqual = (a: RoutineDef, b: RoutineDef) =>
    a.type === b.type && normalizeDef(a.definition) === normalizeDef(b.definition);
  const triggerEqual = (a: TriggerDef, b: TriggerDef) =>
    a.timing === b.timing &&
    a.event === b.event &&
    a.table === b.table &&
    normalizeDef(a.statement) === normalizeDef(b.statement);
  const eventEqual = (a: EventDef, b: EventDef) => normalizeDef(a.definition) === normalizeDef(b.definition);

  const tag = (kind: ObjectKind, diffs: NamedDiff[]): ObjectDiff[] =>
    diffs.map((d) => ({ ...d, kind }));

  return [
    ...tag("view", diffNamed(origin.views, target.views, viewEqual)),
    ...tag("routine", diffNamed(origin.routines, target.routines, routineEqual)),
    ...tag("trigger", diffNamed(origin.triggers, target.triggers, triggerEqual)),
    ...tag("event", diffNamed(origin.events, target.events, eventEqual)),
  ];
}

/**
 * Origin/Target 스키마를 비교한다.
 * added = Origin 에만 존재 / removed = Target 에만 존재.
 */
export function compareSchema(
  origin: SchemaSnapshot,
  target: SchemaSnapshot,
): SchemaDiff {
  const originTables = byName(origin.tables);
  const targetTables = byName(target.tables);
  const names = [
    ...new Set([...originTables.keys(), ...targetTables.keys()]),
  ].sort((a, b) => a.localeCompare(b));

  const tables: TableDiff[] = names.map((name) => {
    const o = originTables.get(name);
    const t = targetTables.get(name);
    if (o && !t) return { name, status: "added", columns: [], indexes: [], foreignKeys: [] };
    if (!o && t) return { name, status: "removed", columns: [], indexes: [], foreignKeys: [] };

    const columns = diffColumns(o!, t!);
    const indexes = diffNamed(o!.indexes, t!.indexes, indexEqual);
    const foreignKeys = diffNamed(o!.foreignKeys, t!.foreignKeys, fkEqual);
    return { name, status: tableStatus(columns, indexes, foreignKeys), columns, indexes, foreignKeys };
  });

  return {
    origin: origin.database,
    target: target.database,
    tables,
    objects: diffObjects(origin, target),
  };
}
