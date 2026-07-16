/**
 * 비교 결과(Diff) 타입 정의.
 *
 * 기획서의 상태 표기와 1:1 대응한다.
 *   [=] identical / [+] added / [-] removed / [*] modified
 * added/removed 는 항상 "Origin 기준"이다.
 *   - added   : Origin 에만 있음 → Target 에 만들어야 함
 *   - removed : Target 에만 있음 → Target 에서 지워야 함(옵션)
 */

export type DiffStatus = "identical" | "added" | "removed" | "modified";

/** 단일 필드 값의 변경(예: 컬럼 타입 varchar(50) → varchar(100)). */
export interface FieldChange {
  field: string;
  origin: string | null;
  target: string | null;
}

/** 컬럼 단위 차이. */
export interface ColumnDiff {
  name: string;
  status: DiffStatus;
  /** modified 일 때만 채워진다. 어떤 속성이 바뀌었는지. */
  changes: FieldChange[];
}

/** 이름 기반 항목(인덱스/FK/객체)의 단순 상태 차이. */
export interface NamedDiff {
  name: string;
  status: DiffStatus;
}

/** 테이블 단위 차이(구조). */
export interface TableDiff {
  name: string;
  status: DiffStatus;
  columns: ColumnDiff[];
  /** 인덱스 차이(수집된 경우). */
  indexes: NamedDiff[];
  /** 외래 키 차이(수집된 경우). */
  foreignKeys: NamedDiff[];
}

/** DB 레벨 객체 종류. */
export type ObjectKind = "view" | "routine" | "trigger" | "event";

/** DB 레벨 객체 차이. */
export interface ObjectDiff extends NamedDiff {
  kind: ObjectKind;
}

/** 스키마 전체 비교 결과. */
export interface SchemaDiff {
  origin: string;
  target: string;
  tables: TableDiff[];
  /** View/Routine/Trigger/Event 등 DB 레벨 객체 차이. */
  objects: ObjectDiff[];
}

/** 비교 결과가 완전히 동일한지 판정한다. */
export function isSchemaIdentical(diff: SchemaDiff): boolean {
  return (
    diff.tables.every((t) => t.status === "identical") &&
    diff.objects.every((o) => o.status === "identical")
  );
}
