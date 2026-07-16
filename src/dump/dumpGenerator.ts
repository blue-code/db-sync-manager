/**
 * Dump 생성기(순수).
 *
 * SchemaSnapshot(+테이블별 데이터)를 받아 재실행 가능한 .sql 텍스트를 만든다.
 * 파일 쓰기/압축은 하지 않는다(dumpFile 이 담당). 이 분리가 테스트를 쉽게 한다.
 */

import type { DataRow, SchemaSnapshot, TableDef } from "../domain/types.js";
import { buildInsert } from "../sync/sqlGenerator.js";
import { buildCreateTable } from "./ddlGenerator.js";

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

  if (disableForeignKeyChecks) blocks.push("SET FOREIGN_KEY_CHECKS=1;");
  return blocks.join("\n\n") + "\n";
}
