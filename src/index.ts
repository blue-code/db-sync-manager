/**
 * 공개 진입점(barrel).
 * 코어 엔진의 계약과 순수 함수를 한곳에서 노출한다.
 */

// 도메인 타입 & 비교 결과
export type {
  ConnectionConfig,
  DbEngine,
  ColumnDef,
  IndexDef,
  ForeignKeyDef,
  TableDef,
  ViewDef,
  RoutineDef,
  TriggerDef,
  EventDef,
  SchemaSnapshot,
  DataRow,
} from "./domain/types.js";
export type {
  DiffStatus,
  FieldChange,
  ColumnDiff,
  NamedDiff,
  ObjectDiff,
  ObjectKind,
  TableDiff,
  SchemaDiff,
} from "./domain/diff.js";
export { isSchemaIdentical } from "./domain/diff.js";

// Compare 엔진 (스키마 & 데이터)
export { compareSchema } from "./compare/schemaCompare.js";
export { compareData, valueEquals } from "./compare/dataCompare.js";
export type {
  DataDiff,
  DataDiffSummary,
  RowDiff,
  RowDiffStatus,
  CellChange,
} from "./domain/dataDiff.js";

// Sync 엔진
export type { SyncMode } from "./sync/syncMode.js";
export { mayDeleteRows } from "./sync/syncMode.js";
export {
  generateSyncSql,
  buildInsert,
  buildUpdates,
  buildUpsert,
  buildDeletes,
} from "./sync/sqlGenerator.js";
export type { GenerateOptions } from "./sync/sqlGenerator.js";
export { quoteId, quoteValue, escapeString } from "./sync/sqlDialect.js";

// Sync Planner
export { buildSyncPlan, generatePlanSql } from "./sync/syncPlanner.js";
export type {
  SyncPlan,
  PlannedOperation,
  PlanSummary,
  PlanOptions,
  OperationKind,
} from "./sync/syncPlanner.js";

// 필터
export {
  rangeFilter,
  dateRangeFilter,
  equalsFilter,
  and,
  applyFilter,
  pickColumns,
} from "./sync/filters.js";
export type { RowPredicate } from "./sync/filters.js";

// 안전장치
export {
  analyzeStatements,
  analyzePlan,
  confirmationRequired,
  previewSql,
} from "./sync/safety.js";
export type { SafetyWarning, Severity } from "./sync/safety.js";

// Dump / Restore / Backup
export { buildCreateTable } from "./dump/ddlGenerator.js";
export type { CreateTableOptions } from "./dump/ddlGenerator.js";
export { generateDump } from "./dump/dumpGenerator.js";
export type { DumpMode, DumpOptions, DumpInput } from "./dump/dumpGenerator.js";
export { autoDumpFilename, extensionFor } from "./dump/filename.js";
export type { Compression } from "./dump/filename.js";
export { splitStatements } from "./dump/sqlSplit.js";
export {
  writeDumpFile,
  readDumpFile,
  detectCompression,
} from "./dump/dumpFile.js";
export { planRestore, restore } from "./dump/restore.js";
export type { RestoreOptions } from "./dump/restore.js";
export { buildBackupDump, createBackup } from "./dump/backup.js";
export type { BackupOptions, BackupResult } from "./dump/backup.js";

// Task 추상화 (저장·재실행)
export {
  createTask,
  validateTask,
  generateTaskId,
  stripPassword,
} from "./task/task.js";
export type { Task, TaskKind, TaskInput, SavedConnection } from "./task/task.js";
export { TaskStore, upsertTask, removeTask } from "./task/taskStore.js";

// History (기록·재실행)
export { buildHistoryEntry, formatHistoryLine } from "./history/history.js";
export type {
  HistoryEntry,
  HistoryInput,
  RunStatus,
  RunCounts,
} from "./history/history.js";
export { HistoryStore } from "./history/historyStore.js";

// Scheduler (예약)
export { nextRun, validateSchedule } from "./scheduler/schedule.js";
export type { Schedule, Weekday } from "./scheduler/schedule.js";

// 로깅
export {
  formatLogLine,
  MemorySink,
  RunLogger,
} from "./logging/logger.js";
export type { LogEntry, LogLevel, LogSink } from "./logging/logger.js";

// 커넥터 포트 & MySQL 구현
export type { DbConnector } from "./connector/DbConnector.js";
export { MysqlConnector } from "./connector/mysqlConnector.js";
export { buildSnapshot } from "./connector/schemaMapper.js";
export { runInTransaction } from "./connector/transaction.js";
export type { TxConnection, ExecuteResult } from "./connector/transaction.js";
export {
  parseGrants,
  hasPrivilege,
  checkPrivileges,
  requiredPrivilegesForMode,
} from "./connector/privileges.js";
export type { Privilege, PrivilegeCheck } from "./connector/privileges.js";
