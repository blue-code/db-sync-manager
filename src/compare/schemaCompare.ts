/**
 * Schema Compare 엔진.
 *
 * 두 SchemaSnapshot 을 받아 순수하게 구조 차이를 계산한다.
 * DB 접속/IO 는 전혀 하지 않는다(테스트 용이성·재현성 확보).
 */

import type { ColumnDef, SchemaSnapshot, TableDef } from "../domain/types.js";
import type {
  ColumnDiff,
  FieldChange,
  SchemaDiff,
  TableDiff,
} from "../domain/diff.js";

/** 이름 → 항목 맵으로 변환(비교 시 O(1) 조회). */
function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((it) => [it.name, it]));
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

    if (o && !t) {
      result.push({ name, status: "added", changes: [] });
    } else if (!o && t) {
      result.push({ name, status: "removed", changes: [] });
    } else if (o && t) {
      const changes = diffColumn(o, t);
      result.push({
        name,
        status: changes.length ? "modified" : "identical",
        changes,
      });
    }
  }

  // 결정론적 출력을 위해 컬럼명 정렬(재현성 규칙 준수).
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** 컬럼 diff 목록으로부터 테이블의 종합 상태를 도출한다. */
function tableStatusOf(columns: ColumnDiff[]): TableDiff["status"] {
  return columns.every((c) => c.status === "identical") ? "identical" : "modified";
}

/**
 * Origin/Target 스키마를 비교한다.
 * added  = Origin 에만 존재 / removed = Target 에만 존재.
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

    if (o && !t) return { name, status: "added", columns: [] };
    if (!o && t) return { name, status: "removed", columns: [] };

    const columns = diffColumns(o!, t!);
    return { name, status: tableStatusOf(columns), columns };
  });

  return { origin: origin.database, target: target.database, tables };
}
