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
} from "../src/index.js";

export const CHANNELS = {
  testConnection: "dbsync:testConnection",
  analyze: "dbsync:analyze",
  listTables: "dbsync:listTables",
  planSync: "dbsync:planSync",
  applySync: "dbsync:applySync",
  buildDump: "dbsync:buildDump",
  saveDump: "dbsync:saveDump",
  planRestore: "dbsync:planRestore",
  applyRestore: "dbsync:applyRestore",
  listHistory: "dbsync:listHistory",
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

export interface ApplySyncParams extends SyncParams {
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
