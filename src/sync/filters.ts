/**
 * 행 필터(순수).
 *
 * 비교/동기화 범위를 좁히는 술어(predicate)를 조합 가능하게 제공한다.
 * 기획의 WHERE 조건 / PK 범위 / 날짜 범위 / 특정 컬럼 동기화에 대응한다.
 *
 * 주의: 여기서는 이미 가져온 행(DataRow[])에 대한 클라이언트측 필터다.
 * 대용량은 커넥터가 SQL WHERE 로 선(先)필터하는 것이 원칙이며, 이 모듈은
 * 소규모 대조나 SQL 로 표현하기 애매한 조건의 보조 수단이다.
 */

import type { DataRow } from "../domain/types.js";

export type RowPredicate = (row: DataRow) => boolean;

/** 비교 가능한 스칼라만 범위 비교에 허용한다. */
type Comparable = number | string | Date;

function toComparable(value: unknown): Comparable | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string" || value instanceof Date) {
    return value;
  }
  return null;
}

/** a <= b 비교(숫자/문자열/날짜). 비교 불가는 false. */
function lte(a: Comparable, b: Comparable): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as never).getTime() <= new Date(b as never).getTime();
  }
  return a <= b;
}

/** PK/숫자 범위 필터: min/max 는 각각 생략 가능(경계 포함). */
export function rangeFilter(
  column: string,
  bounds: { min?: Comparable; max?: Comparable },
): RowPredicate {
  return (row) => {
    const v = toComparable(row[column]);
    if (v === null) return false;
    if (bounds.min !== undefined && !lte(bounds.min, v)) return false;
    if (bounds.max !== undefined && !lte(v, bounds.max)) return false;
    return true;
  };
}

/** 날짜 범위 필터: 문자열/Date 컬럼을 시간값으로 비교(경계 포함). */
export function dateRangeFilter(
  column: string,
  bounds: { from?: string | Date; to?: string | Date },
): RowPredicate {
  const from = bounds.from !== undefined ? new Date(bounds.from).getTime() : undefined;
  const to = bounds.to !== undefined ? new Date(bounds.to).getTime() : undefined;
  return (row) => {
    const raw = row[column];
    if (raw === null || raw === undefined) return false;
    const t = new Date(raw as never).getTime();
    if (Number.isNaN(t)) return false;
    if (from !== undefined && t < from) return false;
    if (to !== undefined && t > to) return false;
    return true;
  };
}

/** 동등 필터: status='READY' 같은 단순 조건. */
export function equalsFilter(column: string, value: unknown): RowPredicate {
  return (row) => row[column] === value;
}

/** 여러 술어를 AND 로 결합한다(모두 통과해야 true). */
export function and(...predicates: RowPredicate[]): RowPredicate {
  return (row) => predicates.every((p) => p(row));
}

/** 술어로 행을 걸러낸다. */
export function applyFilter(rows: DataRow[], predicate: RowPredicate): DataRow[] {
  return rows.filter(predicate);
}

/**
 * 특정 컬럼만 남긴다(특정 컬럼만 동기화 시나리오).
 * keyColumns 는 식별을 위해 항상 유지하고, 그 외에는 columns 만 남긴다.
 */
export function pickColumns(
  rows: DataRow[],
  columns: string[],
  keyColumns: string[] = [],
): DataRow[] {
  const keep = new Set([...keyColumns, ...columns]);
  return rows.map((row) => {
    const out: DataRow = {};
    for (const c of keep) {
      if (c in row) out[c] = row[c];
    }
    return out;
  });
}
