import { describe, it, expect } from "vitest";
import { zipSingleFile, unzipSingleFile, crc32 } from "../src/dump/zip.js";

describe("zip 단일 파일", () => {
  it("압축→해제 왕복이 원문과 일치한다(한글/이스케이프 포함)", () => {
    const text = "CREATE TABLE `t`;\nINSERT INTO `t` VALUES ('배''즙','포도;세트');\n한글 내용";
    const zipped = zipSingleFile("dump.sql", Buffer.from(text, "utf8"));
    const { name, content } = unzipSingleFile(zipped);
    expect(name).toBe("dump.sql");
    expect(content.toString("utf8")).toBe(text);
  });

  it("표준 ZIP 로컬 헤더 서명(PK\\x03\\x04)으로 시작한다", () => {
    const zipped = zipSingleFile("a.sql", Buffer.from("x"));
    expect(zipped.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("빈 내용도 왕복된다", () => {
    const { content } = unzipSingleFile(zipSingleFile("e.sql", Buffer.alloc(0)));
    expect(content.length).toBe(0);
  });

  it("손상된 바이트는 CRC 검증에서 예외를 던진다", () => {
    const zipped = zipSingleFile("a.sql", Buffer.from("hello world"));
    // 압축 데이터 영역 한 바이트를 훼손한다.
    zipped[30 + 5]! ^= 0xff;
    expect(() => unzipSingleFile(zipped)).toThrow();
  });

  it("crc32 는 알려진 값과 일치한다", () => {
    // "123456789" 의 표준 CRC32 = 0xCBF43926
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});
