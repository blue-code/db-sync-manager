/**
 * IPC 채널 계약(main ↔ renderer 공유).
 *
 * 채널명과 요청/응답 타입을 한곳에 두어 preload/renderer/main 이 어긋나지 않게 한다.
 */

import type { ConnectionConfig, SchemaDiff } from "../src/index.js";

export const CHANNELS = {
  testConnection: "dbsync:testConnection",
  analyze: "dbsync:analyze",
  listHistory: "dbsync:listHistory",
} as const;

/** 렌더러 폼이 넘겨주는 접속 정보(비밀번호 포함, 저장하지 않음). */
export type ConnForm = ConnectionConfig;

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface AnalyzeResult {
  ok: boolean;
  message: string;
  diff?: SchemaDiff;
}
