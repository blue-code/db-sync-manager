/**
 * 자동 백업.
 *
 * 위험한 동기화(overwrite/DELETE 포함) 실행 전에 Target 을 덤프로 보존한다.
 * 커넥터로 스키마/데이터를 읽어 덤프 텍스트를 만드는 부분(buildBackupDump)은
 * DbConnector 목으로 테스트 가능하고, 파일 저장(createBackup)만 실제 I/O 다.
 */

import { join } from "node:path";
import type { ConnectionConfig, DataRow } from "../domain/types.js";
import type { DbConnector } from "../connector/DbConnector.js";
import { generateDump, type DumpMode } from "./dumpGenerator.js";
import { autoDumpFilename, type Compression } from "./filename.js";
import { writeDumpFile } from "./dumpFile.js";

export interface BackupOptions {
  /** 백업 파일을 저장할 디렉터리. */
  dir: string;
  /** 파일명 접두어. 기본은 데이터베이스명. */
  prefix?: string;
  /** 압축 방식. 기본 gzip(백업은 용량을 아끼는 편이 낫다). */
  compression?: Compression;
  /** 덤프 범위. 기본 all(스키마+데이터). */
  mode?: DumpMode;
}

/** Target 접속에서 덤프 텍스트를 만든다(파일 저장은 하지 않음). */
export async function buildBackupDump(
  connector: DbConnector,
  config: ConnectionConfig,
  mode: DumpMode,
  generatedAt?: string,
): Promise<string> {
  const snapshot = await connector.fetchSchema(config);

  const data = new Map<string, DataRow[]>();
  if (mode === "data" || mode === "all") {
    for (const table of snapshot.tables) {
      data.set(table.name, await connector.fetchRows(config, table.name));
    }
  }

  return generateDump({ snapshot, data }, { mode }, generatedAt);
}

export interface BackupResult {
  filePath: string;
  bytes: number;
}

/** Target 을 덤프해 파일로 저장한다. 저장 경로/크기를 돌려준다. */
export async function createBackup(
  connector: DbConnector,
  config: ConnectionConfig,
  options: BackupOptions,
  date: Date,
): Promise<BackupResult> {
  const mode = options.mode ?? "all";
  const compression = options.compression ?? "gzip";
  const prefix = options.prefix ?? config.database;

  const dump = await buildBackupDump(connector, config, mode, date.toISOString());
  const filePath = join(options.dir, autoDumpFilename(prefix, date, compression));
  await writeDumpFile(filePath, dump, compression);

  return { filePath, bytes: Buffer.byteLength(dump, "utf8") };
}
