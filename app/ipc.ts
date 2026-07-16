/**
 * IPC 채널 계약(main ↔ renderer 공유).
 *
 * 채널명과 요청/응답 타입을 한곳에 두어 preload/renderer/main 이 어긋나지 않게 한다.
 * 파괴적 작업(Sync/Restore)은 항상 plan(미리보기) → apply(실행) 2단계다.
 */

import type {
  ConnectionConfig,
  SchemaDiff,
  SyncMode,
  DumpMode,
  Compression,
  SafetyWarning,
  DataDiffSummary,
  RowDiffStatus,
  Task,
  TaskKind,
  Schedule,
} from "../src/index.js";

export const CHANNELS = {
  testConnection: "dbsync:testConnection",
  analyze: "dbsync:analyze",
  listTables: "dbsync:listTables",
  reviewSync: "dbsync:reviewSync",
  planSync: "dbsync:planSync",
  applySync: "dbsync:applySync",
  buildDump: "dbsync:buildDump",
  saveDump: "dbsync:saveDump",
  planRestore: "dbsync:planRestore",
  applyRestore: "dbsync:applyRestore",
  listHistory: "dbsync:listHistory",
  taskList: "dbsync:taskList",
  taskSave: "dbsync:taskSave",
  taskRemove: "dbsync:taskRemove",
} as const;

/** 렌더러 폼이 넘겨주는 접속 정보(비밀번호 포함, 저장하지 않음). */
export type ConnForm = ConnectionConfig;

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface AnalyzeResult {
  ok: boolean;
  message: string;
  diff?: SchemaDiff;
}

/** 테이블 목록 항목(동기화 대상 선택 + PK 유무 판단용). */
export interface TableInfo {
  name: string;
  primaryKey: string[];
}

export interface ListTablesResult {
  ok: boolean;
  message: string;
  tables?: TableInfo[];
}

// ----- Sync -----

export interface SyncParams {
  table: string;
  mode: SyncMode;
  includeDeletes: boolean;
}

/** Difference Review 의 한 행(변경 대상만). */
export interface ReviewRow {
  /** 선택 매칭용 안정 키 문자열(apply 시 재사용). */
  keyStr: string;
  /** 사람이 읽는 키 표기(예: id=2). */
  keyLabel: string;
  status: RowDiffStatus;
  /** modified 일 때 변경 셀. */
  changes?: { column: string; origin: unknown; target: unknown }[];
}

export interface ReviewSyncResult {
  ok: boolean;
  message: string;
  summary?: DataDiffSummary;
  keyColumns?: string[];
  rows?: ReviewRow[];
  /** 표시 상한을 넘겨 잘렸는지. */
  truncated?: boolean;
}

/** plan/apply 공통: 선택된 행 키(미지정 시 전체 적용). */
export interface PlanSyncParams extends SyncParams {
  selectedKeys?: string[];
}

export interface PlanSyncResult {
  ok: boolean;
  message: string;
  summary?: { insert: number; update: number; delete: number };
  preview?: string;
  warnings?: SafetyWarning[];
  destructive?: boolean;
  /** 실행할 문장 수(0 이면 변경 없음). */
  statementCount?: number;
}

export interface ApplySyncParams extends PlanSyncParams {
  /** 파괴적 작업 전에 Target 을 자동 백업할지. */
  backup: boolean;
}

export interface ApplyResult {
  ok: boolean;
  message: string;
  executed?: number;
  backupPath?: string;
}

// ----- Dump -----

export interface DumpParams {
  mode: DumpMode;
  tables?: string[];
  compression: Compression;
}

export interface BuildDumpResult {
  ok: boolean;
  message: string;
  preview?: string;
  byteLength?: number;
}

export interface SaveDumpResult {
  ok: boolean;
  message: string;
  filePath?: string;
}

// ----- Restore -----

export interface RestoreOptionsForm {
  schemaOnly: boolean;
  dataOnly: boolean;
}

export interface PlanRestoreResult {
  ok: boolean;
  message: string;
  /** 선택된 덤프 파일 경로(apply 시 재사용). */
  filePath?: string;
  preview?: string;
  warnings?: SafetyWarning[];
  statementCount?: number;
}

export interface ApplyRestoreParams extends RestoreOptionsForm {
  filePath: string;
}

// ----- Task / Scheduler -----

/** 저장 요청. 접속은 폼값(비밀번호 포함 가능) — main 이 저장 전 제거한다. */
export interface TaskSaveInput {
  name: string;
  kind: TaskKind;
  origin?: ConnForm;
  target?: ConnForm;
  table?: string;
  mode?: SyncMode;
  includeDeletes?: boolean;
  dumpMode?: DumpMode;
  tables?: string[];
  schedule?: Schedule;
}

/** 목록 항목: 저장된 Task + 계산된 다음 실행 시각. */
export interface TaskListItem extends Task {
  nextRunAt?: string;
}

export interface TaskListResult {
  ok: boolean;
  message: string;
  tasks?: TaskListItem[];
}

export interface TaskMutateResult {
  ok: boolean;
  message: string;
}
