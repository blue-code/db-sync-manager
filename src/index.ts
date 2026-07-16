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
  TableDef,
  SchemaSnapshot,
  DataRow,
} from "./domain/types.js";
export type {
  DiffStatus,
  FieldChange,
  ColumnDiff,
  TableDiff,
  SchemaDiff,
} from "./domain/diff.js";
export { isSchemaIdentical } from "./domain/diff.js";

// Compare 엔진
export { compareSchema } from "./compare/schemaCompare.js";

// Sync 엔진
export type { SyncMode } from "./sync/syncMode.js";
export { mayDeleteRows } from "./sync/syncMode.js";
export { generateSyncSql } from "./sync/sqlGenerator.js";
export type { GenerateOptions } from "./sync/sqlGenerator.js";
export { quoteId, quoteValue, escapeString } from "./sync/sqlDialect.js";

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
