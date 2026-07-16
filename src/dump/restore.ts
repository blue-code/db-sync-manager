/**
 * Restore(복원).
 *
 * 덤프 텍스트를 문장으로 나누고(옵션에 따라 스키마/데이터만 선별) 실행한다.
 * 문장 선별(planRestore)은 순수 함수라 실행 없이 검증 가능하다.
 */

import type { ConnectionConfig } from "../domain/types.js";
import type { DbConnector } from "../connector/DbConnector.js";
import { splitStatements } from "./sqlSplit.js";

export interface RestoreOptions {
  /** 스키마 관련 문(CREATE/DROP/ALTER)만 실행. */
  schemaOnly?: boolean;
  /** 데이터 문(INSERT/REPLACE)만 실행. */
  dataOnly?: boolean;
}

const SCHEMA_RE = /^\s*(CREATE|DROP|ALTER)\b/i;
const DATA_RE = /^\s*(INSERT|REPLACE)\b/i;
// SET 등 세션 제어문은 어떤 모드에서도 유지한다(FK 검사 토글 등).
const CONTROL_RE = /^\s*SET\b/i;

/** 덤프 텍스트를 실행 대상 문장 배열로 변환한다(순수). */
export function planRestore(sql: string, options: RestoreOptions = {}): string[] {
  const all = splitStatements(sql);
  const { schemaOnly, dataOnly } = options;
  if (!schemaOnly && !dataOnly) return all;

  return all.filter((s) => {
    if (CONTROL_RE.test(s)) return true;
    if (schemaOnly) return SCHEMA_RE.test(s);
    if (dataOnly) return DATA_RE.test(s);
    return true;
  });
}

/** 덤프 텍스트를 트랜잭션으로 복원한다. 실행된 문장 수를 돌려준다. */
export async function restore(
  connector: DbConnector,
  config: ConnectionConfig,
  sql: string,
  options: RestoreOptions = {},
): Promise<number> {
  const statements = planRestore(sql, options);
  return connector.execute(config, statements);
}
