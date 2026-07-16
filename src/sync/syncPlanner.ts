/**
 * Sync Planner(순수).
 *
 * Data Compare 결과(DataDiff)를 받아 "무엇을 어떻게 바꿀지"를 계획한다.
 * 계획은 사용자가 검토(Difference Review)한 뒤 SQL 로 변환·실행된다.
 *
 * 흐름: DataDiff → (선택 필터) → SyncPlan → generatePlanSql → SQL[]
 */

import type { DataRow, TableDef } from "../domain/types.js";
import type { DataDiff, RowDiff } from "../domain/dataDiff.js";
import type { SyncMode } from "./syncMode.js";
import { buildInsert, buildUpdates, buildDeletes } from "./sqlGenerator.js";

export type OperationKind = "insert" | "update" | "delete";

export interface PlannedOperation {
  kind: OperationKind;
  /** insert/update 는 Origin 행, delete 는 키(Target) 행. */
  rows: DataRow[];
}

export interface PlanSummary {
  insert: number;
  update: number;
  delete: number;
}

export interface SyncPlan {
  table: string;
  mode: SyncMode;
  operations: PlannedOperation[];
  summary: PlanSummary;
  /** DELETE 가 포함되는가(안전장치 경고 근거). */
  destructive: boolean;
}

export interface PlanOptions {
  mode: SyncMode;
  /** Target 에만 있는 행(removed)을 삭제할지. 기본 false(기존 유지). */
  includeDeletes?: boolean;
  /** 계획에 포함할 행만 남기는 선택 필터(Difference Review 의 적용/제외). */
  select?: (row: RowDiff) => boolean;
}

/** 상태별로 행을 분류한다(선택 필터 적용 후). */
function partition(diff: DataDiff, select?: (r: RowDiff) => boolean) {
  const rows = select ? diff.rows.filter(select) : diff.rows;
  return {
    added: rows.filter((r) => r.status === "added"),
    modified: rows.filter((r) => r.status === "modified"),
    removed: rows.filter((r) => r.status === "removed"),
  };
}

/**
 * DataDiff 로부터 동기화 계획을 만든다.
 * 모드별 포함 규칙:
 *   insertOnly → insert(added)
 *   updateOnly → update(modified)
 *   upsert     → insert(added) + update(modified)
 *   overwrite  → 이 파인 경로에서는 지원하지 않음(테이블 전체 코스 경로 사용)
 * includeDeletes=true 이면 removed 를 delete 로 추가한다.
 */
export function buildSyncPlan(diff: DataDiff, options: PlanOptions): SyncPlan {
  const { mode, includeDeletes = false, select } = options;
  if (mode === "overwrite") {
    throw new Error(
      "overwrite 는 diff 기반 계획이 아니라 테이블 전체 코스 경로(generateSyncSql)를 사용한다",
    );
  }

  const { added, modified, removed } = partition(diff, select);
  const wantInsert = mode === "insertOnly" || mode === "upsert";
  const wantUpdate = mode === "updateOnly" || mode === "upsert";

  const operations: PlannedOperation[] = [];
  if (wantInsert && added.length) {
    operations.push({ kind: "insert", rows: added.map((r) => r.originRow!) });
  }
  if (wantUpdate && modified.length) {
    operations.push({ kind: "update", rows: modified.map((r) => r.originRow!) });
  }
  if (includeDeletes && removed.length) {
    operations.push({ kind: "delete", rows: removed.map((r) => r.targetRow!) });
  }

  const summary: PlanSummary = {
    insert: opCount(operations, "insert"),
    update: opCount(operations, "update"),
    delete: opCount(operations, "delete"),
  };

  return { table: diff.table, mode, operations, summary, destructive: summary.delete > 0 };
}

function opCount(ops: PlannedOperation[], kind: OperationKind): number {
  return ops.filter((o) => o.kind === kind).reduce((n, o) => n + o.rows.length, 0);
}

/**
 * 계획을 실행 가능한 SQL 문 배열로 변환한다.
 * 순서: INSERT → UPDATE → DELETE.
 * added/removed 는 키가 서로소이므로 순서로 인한 충돌은 없다.
 * @param updateColumns UPDATE 시 갱신 컬럼 제한(특정 컬럼만 동기화).
 */
export function generatePlanSql(
  plan: SyncPlan,
  table: TableDef,
  updateColumns?: string[],
): string[] {
  const sql: string[] = [];
  for (const op of plan.operations) {
    if (op.rows.length === 0) continue;
    switch (op.kind) {
      case "insert":
        sql.push(buildInsert(table, op.rows));
        break;
      case "update":
        sql.push(...buildUpdates(table, op.rows, updateColumns));
        break;
      case "delete":
        sql.push(...buildDeletes(table, op.rows));
        break;
    }
  }
  return sql;
}
