/**
 * 덤프 파일 I/O 어댑터.
 *
 * 순수 생성기(dumpGenerator)가 만든 텍스트를 파일로 쓰거나 읽는다.
 * 압축은 Node 내장 zlib(gzip)만 사용해 외부 의존성을 두지 않는다.
 * (zip 은 별도 검증이 필요해 후속 과제로 둔다 — 로드맵 참조)
 */

import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Compression } from "./filename.js";

/** 확장자로 압축 방식을 추정한다. */
export function detectCompression(filePath: string): Compression {
  return /\.gz$/i.test(filePath) ? "gzip" : "none";
}

/** 덤프 텍스트를 파일로 쓴다. gzip 이면 압축해 저장한다. */
export async function writeDumpFile(
  filePath: string,
  content: string,
  compression: Compression = detectCompression(filePath),
): Promise<void> {
  if (compression === "gzip") {
    await writeFile(filePath, gzipSync(Buffer.from(content, "utf8")));
  } else {
    await writeFile(filePath, content, "utf8");
  }
}

/** 덤프 파일을 읽어 텍스트로 돌려준다. .gz 는 자동 해제한다. */
export async function readDumpFile(
  filePath: string,
  compression: Compression = detectCompression(filePath),
): Promise<string> {
  if (compression === "gzip") {
    const buf = await readFile(filePath);
    return gunzipSync(buf).toString("utf8");
  }
  return readFile(filePath, "utf8");
}
