/**
 * Dump 생성기(순수).
 *
 * SchemaSnapshot(+테이블별 데이터)를 받아 재실행 가능한 .sql 텍스트를 만든다.
 * 파일 쓰기/압축은 하지 않는다(dumpFile 이 담당). 이 분리가 테스트를 쉽게 한다.
 */

import type { DataRow, SchemaSnapshot, TableDef } from "../domain/types.js";
import { buildInsert } from "../sync/sqlGenerator.js";
import { quoteId } from "../sync/sqlDialect.js";
import { buildCreateTable } from "./ddlGenerator.js";
import {
  buildCreateView,
  buildCreateTrigger,
  buildCreateRoutine,
  buildCreateEvent,
} from "./objectDdl.js";

export type DumpMode = "schema" | "data" | "all";

export interface DumpOptions {
  /** 스키마만/데이터만/둘 다. 기본 all. */
  mode?: DumpMode;
  /** 이 테이블들만 덤프한다(미지정 시 전체). */
  tables?: string[];
  /** CREATE 앞에 DROP TABLE IF EXISTS 를 넣는다. 기본 true. */
  dropTable?: boolean;
  /** 복원 안전을 위해 FK 검사를 잠시 끈다. 기본 true. */
  disableForeignKeyChecks?: boolean;
}

export interface DumpInput {
  snapshot: SchemaSnapshot;
  /** 테이블명 → 행 배열(data/all 모드에서 사용). 없으면 데이터 생략. */
  data?: Map<string, DataRow[]>;
}

/** 덤프 대상 테이블을 옵션에 맞게 고른다(입력 순서 유지). */
function selectTables(snapshot: SchemaSnapshot, only?: string[]): TableDef[] {
  if (!only) return snapshot.tables;
  const allow = new Set(only);
  return snapshot.tables.filter((t) => allow.has(t.name));
}

/** 복합 본문(프로시저/트리거)을 한 문장으로 유지하기 위해 DELIMITER 로 감싼다. */
function delimited(create: string): string {
  return `DELIMITER $$\n${create.trim()} $$\nDELIMITER ;`;
}

/**
 * DB 레벨 객체(뷰/루틴/트리거) DDL 블록을 만든다.
 * 뷰는 단일 문, 루틴/트리거는 DELIMITER 로 감싼다. dropFirst 시 DROP 을 선행한다.
 */
function objectBlocks(snapshot: SchemaSnapshot, dropFirst: boolean): string[] {
  const blocks: string[] = [];

  for (const v of snapshot.views ?? []) {
    blocks.push(`-- view ${v.name}\n` + buildCreateView(v, dropFirst));
  }
  for (const r of snapshot.routines ?? []) {
    if (!r.createStatement) continue; // 전체 DDL 미수집 루틴은 건너뛴다.
    const drop = dropFirst ? `DROP ${r.type} IF EXISTS ${quoteId(r.name)};\n` : "";
    blocks.push(`-- routine ${r.name}\n` + drop + delimited(buildCreateRoutine(r)));
  }
  for (const t of snapshot.triggers ?? []) {
    const drop = dropFirst ? `DROP TRIGGER IF EXISTS ${quoteId(t.name)};\n` : "";
    blocks.push(`-- trigger ${t.name}\n` + drop + delimited(buildCreateTrigger(t)));
  }
  for (const e of snapshot.events ?? []) {
    if (!e.createStatement) continue; // 전체 DDL 미수집 이벤트는 건너뛴다.
    const drop = dropFirst ? `DROP EVENT IF EXISTS ${quoteId(e.name)};\n` : "";
    blocks.push(`-- event ${e.name}\n` + drop + delimited(buildCreateEvent(e)));
  }

  return blocks;
}

/** 헤더 주석(재현성 위해 시각은 인자로 받은 것만 쓴다). */
function header(database: string, mode: DumpMode, generatedAt?: string): string {
  const lines = [
    "-- DB Sync Manager dump",
    `-- database: ${database}`,
    `-- mode: ${mode}`,
  ];
  if (generatedAt) lines.push(`-- generated_at: ${generatedAt}`);
  return lines.join("\n");
}

/**
 * 덤프 SQL 텍스트를 생성한다.
 * @param generatedAt 헤더에 남길 시각 문자열(순수성 유지를 위해 외부 주입).
 */
export function generateDump(
  input: DumpInput,
  options: DumpOptions = {},
  generatedAt?: string,
): string {
  const {
    mode = "all",
    tables,
    dropTable = true,
    disableForeignKeyChecks = true,
  } = options;

  const snapshot = input.snapshot;
  const targets = selectTables(snapshot, tables);
  const includeSchema = mode === "schema" || mode === "all";
  const includeData = mode === "data" || mode === "all";

  const blocks: string[] = [header(snapshot.database, mode, generatedAt)];
  if (disableForeignKeyChecks) blocks.push("SET FOREIGN_KEY_CHECKS=0;");

  for (const table of targets) {
    const parts: string[] = [`-- ----- ${table.name} -----`];

    if (includeSchema) {
      parts.push(buildCreateTable(table, { dropTable }));
    }
    if (includeData) {
      const rows = input.data?.get(table.name) ?? [];
      if (rows.length) parts.push(buildInsert(table, rows));
    }
    blocks.push(parts.join("\n"));
  }

  // DB 레벨 객체(뷰/루틴/트리거)는 전체 스키마 덤프(테이블 미지정)에서만 포함한다.
  if (includeSchema && !tables) {
    for (const block of objectBlocks(snapshot, dropTable)) blocks.push(block);
  }

  if (disableForeignKeyChecks) blocks.push("SET FOREIGN_KEY_CHECKS=1;");
  return blocks.join("\n\n") + "\n";
}
