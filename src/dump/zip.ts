/**
 * 최소 단일 파일 ZIP 리더/라이터(외부 의존성 없음).
 *
 * Node 내장 zlib 의 raw deflate 와 자체 CRC32 로 표준 ZIP(메서드 8) 한 항목을
 * 만들고 읽는다. 덤프 한 개를 담는 용도라 다중 엔트리는 지원하지 않는다.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

/** CRC32 룩업 테이블(표준 다항식 0xEDB88320). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const METHOD_DEFLATE = 8;

/** 단일 파일을 ZIP 바이트로 만든다. */
export function zipSingleFile(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(content);
  const crc = crc32(content);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(SIG_LOCAL, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(METHOD_DEFLATE, 8);
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0, 12); // mod date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra length

  const central = Buffer.alloc(46);
  central.writeUInt32LE(SIG_CENTRAL, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(METHOD_DEFLATE, 10);
  central.writeUInt16LE(0, 12); // mod time
  central.writeUInt16LE(0, 14); // mod date
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk start
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(0, 42); // local header offset

  const localBlock = Buffer.concat([local, nameBuf, compressed]);
  const centralBlock = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(1, 8); // entries this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralBlock.length, 12); // cd size
  eocd.writeUInt32LE(localBlock.length, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

/** ZIP 바이트에서 첫(유일) 파일을 읽는다. */
export function unzipSingleFile(buf: Buffer): { name: string; content: Buffer } {
  if (buf.readUInt32LE(0) !== SIG_LOCAL) {
    throw new Error("올바른 ZIP 파일이 아닙니다(로컬 헤더 서명 불일치).");
  }
  const method = buf.readUInt16LE(8);
  const crc = buf.readUInt32LE(14);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);

  const name = buf.toString("utf8", 30, 30 + nameLen);
  const dataStart = 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + compSize);

  const content =
    method === METHOD_DEFLATE ? inflateRawSync(compressed) : Buffer.from(compressed);
  if (crc32(content) !== crc) {
    throw new Error("ZIP CRC 검증 실패(데이터 손상).");
  }
  return { name, content };
}
