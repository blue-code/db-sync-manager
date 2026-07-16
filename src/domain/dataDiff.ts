/**
 * 데이터(행) 비교 결과 타입.
 *
 * 스키마 비교(SchemaDiff)와 별개로, 같은 테이블의 "행"을 키 기준으로 대조한 결과다.
 * 색상 표기(기획): 신규(초록)/삭제(빨강)/변경(노랑) 과 1:1 대응한다.
 *   added = Origin 에만 / removed = Target 에만 / modified = 키 동일·값 상이
 */

import type { DataRow } from "./types.js";

export type RowDiffStatus = "identical" | "added" | "removed" | "modified";

/** 한 셀(컬럼) 값의 변경. 값은 원본 타입 그대로 보관해 미리보기에 쓴다. */
export interface CellChange {
  column: string;
  origin: unknown;
  target: unknown;
}

/** 한 행의 비교 결과. */
export interface RowDiff {
  /** 키 컬럼 값(예: { id: 100 }). 안정적 정렬/식별의 기준. */
  key: Record<string, unknown>;
  status: RowDiffStatus;
  /** modified 일 때 변경된 셀 목록. */
  changes: CellChange[];
  /** Origin 쪽 원본 행(added/modified 에서 존재). */
  originRow?: DataRow;
  /** Target 쪽 원본 행(removed/modified 에서 존재). */
  targetRow?: DataRow;
}

export interface DataDiffSummary {
  added: number;
  removed: number;
  modified: number;
  identical: number;
}

/** 테이블 데이터 비교 전체 결과. */
export interface DataDiff {
  table: string;
  keyColumns: string[];
  rows: RowDiff[];
  summary: DataDiffSummary;
}
