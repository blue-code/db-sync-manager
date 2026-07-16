/** 테스트용 스키마/테이블 픽스처 빌더. */

import type { ColumnDef, SchemaSnapshot, TableDef } from "../src/domain/types.js";

export function col(name: string, dataType: string, over: Partial<ColumnDef> = {}): ColumnDef {
  return {
    name,
    dataType,
    nullable: false,
    default: null,
    autoIncrement: false,
    position: 0,
    ...over,
  };
}

export function usersTable(over: Partial<TableDef> = {}): TableDef {
  return {
    name: "users",
    columns: [
      col("id", "int", { autoIncrement: true, position: 1 }),
      col("name", "varchar(50)", { position: 2 }),
      col("email", "varchar(50)", { position: 3 }),
    ],
    primaryKey: ["id"],
    indexes: [{ name: "PRIMARY", unique: true, columns: ["id"] }],
    ...over,
  };
}

export function snapshot(database: string, tables: TableDef[]): SchemaSnapshot {
  return { database, tables };
}
