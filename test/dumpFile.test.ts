import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeDumpFile,
  readDumpFile,
  detectCompression,
} from "../src/dump/dumpFile.js";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "dsm-dump-"));
  dirs.push(d);
  return d;
}

afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

const sample = "-- dump\nCREATE TABLE `t` (`id` int);\nINSERT INTO `t` VALUES (1);\n";

describe("detectCompression", () => {
  it("확장자로 압축 방식을 판별한다", () => {
    expect(detectCompression("a.sql")).toBe("none");
    expect(detectCompression("a.sql.gz")).toBe("gzip");
    expect(detectCompression("a.sql.zip")).toBe("zip");
  });
});

describe("writeDumpFile / readDumpFile", () => {
  it("plain 왕복이 원문과 일치한다", async () => {
    const dir = await tempDir();
    const path = join(dir, "d.sql");
    await writeDumpFile(path, sample);
    expect(await readDumpFile(path)).toBe(sample);
  });

  it("gzip 왕복이 원문과 일치한다", async () => {
    const dir = await tempDir();
    const path = join(dir, "d.sql.gz");
    await writeDumpFile(path, sample);
    expect(await readDumpFile(path)).toBe(sample);
  });

  it("zip 왕복이 원문과 일치한다", async () => {
    const dir = await tempDir();
    const path = join(dir, "d.sql.zip");
    await writeDumpFile(path, sample);
    expect(await readDumpFile(path)).toBe(sample);
  });
});
