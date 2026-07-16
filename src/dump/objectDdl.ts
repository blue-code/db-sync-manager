/**
 * DB 객체 DDL 생성기(순수).
 *
 * View 는 정의(SELECT)에서, Trigger 는 구성 필드에서 재구성한다.
 * Routine 은 파라미터/반환까지 필요해 SHOW CREATE 로 수집한 전체 문(createStatement)을 쓴다.
 * 이식성을 위해 DEFINER 절은 제거한다(대상 서버에 동일 계정이 없을 수 있음).
 */

import type { RoutineDef, TriggerDef, ViewDef } from "../domain/types.js";
import { quoteId } from "../sync/sqlDialect.js";

/** DEFINER=`user`@`host` 절을 제거한다(이식성). */
export function stripDefiner(sql: string): string {
  return sql.replace(/DEFINER=\s*`(?:[^`]|``)*`@`(?:[^`]|``)*`\s*/gi, "");
}

/** CREATE VIEW (단일 문). */
export function buildCreateView(view: ViewDef, dropFirst = false): string {
  const create = `CREATE VIEW ${quoteId(view.name)} AS ${view.definition};`;
  return dropFirst ? `DROP VIEW IF EXISTS ${quoteId(view.name)};\n${create}` : create;
}

/** CREATE TRIGGER (구성 필드에서 재구성, 복합 본문 가능). */
export function buildCreateTrigger(trigger: TriggerDef, dropFirst = false): string {
  const create =
    `CREATE TRIGGER ${quoteId(trigger.name)} ${trigger.timing} ${trigger.event} ` +
    `ON ${quoteId(trigger.table)} FOR EACH ROW ${trigger.statement}`;
  return dropFirst ? `DROP TRIGGER IF EXISTS ${quoteId(trigger.name)};\n${create}` : create;
}

/** CREATE PROCEDURE/FUNCTION (SHOW CREATE 전체 문 사용, DEFINER 제거). */
export function buildCreateRoutine(routine: RoutineDef, dropFirst = false): string {
  if (!routine.createStatement) {
    throw new Error(`루틴 전체 DDL(createStatement)이 없습니다: ${routine.name}`);
  }
  const create = stripDefiner(routine.createStatement).trim();
  if (!dropFirst) return create;
  return `DROP ${routine.type} IF EXISTS ${quoteId(routine.name)};\n${create}`;
}
