/**
 * DB 객체 단위 동기화(순수).
 *
 * Origin 스냅샷에 맞춰 Target 의 View/Routine/Trigger/Event 를 정렬하는 SQL 을 만든다.
 *   added(Origin 전용)    → CREATE
 *   removed(Target 전용)  → DROP
 *   modified              → DROP + CREATE
 *
 * 각 문장은 "한 문장 = 한 배열 원소"로 반환한다. 복합 본문(프로시저 등)의
 * 내부 세미콜론은 커넥터가 문장별로 실행하므로 안전하다(문자열 분리를 거치지 않음).
 */

import type { SchemaSnapshot } from "../domain/types.js";
import { compareSchema } from "../compare/schemaCompare.js";
import { quoteId } from "./sqlDialect.js";
import {
  buildCreateView,
  buildCreateTrigger,
  buildCreateRoutine,
  buildCreateEvent,
} from "../dump/objectDdl.js";

function dropRoutineType(snapshot: SchemaSnapshot, name: string): "PROCEDURE" | "FUNCTION" {
  return snapshot.routines?.find((r) => r.name === name)?.type ?? "PROCEDURE";
}

/** 종류별 DROP 문. 루틴은 PROCEDURE/FUNCTION 구분이 필요하다. */
function dropObject(kind: string, name: string, routineType?: string): string {
  switch (kind) {
    case "view":
      return `DROP VIEW IF EXISTS ${quoteId(name)};`;
    case "trigger":
      return `DROP TRIGGER IF EXISTS ${quoteId(name)};`;
    case "event":
      return `DROP EVENT IF EXISTS ${quoteId(name)};`;
    case "routine":
      return `DROP ${routineType ?? "PROCEDURE"} IF EXISTS ${quoteId(name)};`;
    default:
      throw new Error(`알 수 없는 객체 종류: ${kind}`);
  }
}

/** Origin 정의로부터 CREATE 문을 만든다(생성 불가 시 null). */
function createObject(origin: SchemaSnapshot, kind: string, name: string): string | null {
  switch (kind) {
    case "view": {
      const v = origin.views?.find((x) => x.name === name);
      return v ? buildCreateView(v) : null;
    }
    case "trigger": {
      const t = origin.triggers?.find((x) => x.name === name);
      return t ? buildCreateTrigger(t) : null;
    }
    case "routine": {
      const r = origin.routines?.find((x) => x.name === name);
      return r?.createStatement ? buildCreateRoutine(r) : null;
    }
    case "event": {
      const e = origin.events?.find((x) => x.name === name);
      return e?.createStatement ? buildCreateEvent(e) : null;
    }
    default:
      return null;
  }
}

/**
 * Target 의 DB 객체를 Origin 에 맞추는 SQL 문 배열을 만든다.
 * 커넥터로 곧바로 실행 가능한 형태(문장별 분리)다.
 */
export function generateObjectSync(
  origin: SchemaSnapshot,
  target: SchemaSnapshot,
): string[] {
  const diff = compareSchema(origin, target);
  const statements: string[] = [];

  for (const o of diff.objects) {
    if (o.status === "identical") continue;

    if (o.status === "removed") {
      statements.push(dropObject(o.kind, o.name, dropRoutineType(target, o.name)));
      continue;
    }

    // added / modified
    if (o.status === "modified") {
      statements.push(dropObject(o.kind, o.name, dropRoutineType(origin, o.name)));
    }
    const create = createObject(origin, o.kind, o.name);
    if (create) statements.push(create);
  }

  return statements;
}
