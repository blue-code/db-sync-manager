/**
 * Electron 메인 프로세스.
 *
 * 창을 만들고, 렌더러의 IPC 요청을 코어 엔진에 연결한다.
 * 실제 DB 접속/비교는 순수 라이브러리(../src)를 그대로 사용한다.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MysqlConnector,
  compareSchema,
  HistoryStore,
} from "../src/index.js";
import { CHANNELS, type ConnForm, type TestConnectionResult, type AnalyzeResult } from "./ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const connector = new MysqlConnector();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    title: "DB Sync Manager",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ESM preload 사용을 위해 비활성화
    },
  });
  win.removeMenu();
  void win.loadFile(join(__dirname, "renderer", "index.html"));
}

/** 실패 메시지를 사용자에게 읽기 쉬운 한글로 다듬는다. */
function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED/.test(raw)) return "접속 거부: 호스트/포트를 확인하세요.";
  if (/ENOTFOUND|EAI_AGAIN/.test(raw)) return "호스트를 찾을 수 없습니다.";
  if (/Access denied/i.test(raw)) return "인증 실패: 계정/비밀번호를 확인하세요.";
  if (/Unknown database/i.test(raw)) return "존재하지 않는 데이터베이스입니다.";
  return raw;
}

/** History 파일 경로(사용자 데이터 폴더). */
function historyStore(): HistoryStore {
  return new HistoryStore(join(app.getPath("userData"), "history.jsonl"));
}

function registerIpc(): void {
  ipcMain.handle(
    CHANNELS.testConnection,
    async (_e, config: ConnForm): Promise<TestConnectionResult> => {
      try {
        const ok = await connector.ping(config);
        return { ok, message: ok ? "접속 성공" : "접속 실패" };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(
    CHANNELS.analyze,
    async (_e, origin: ConnForm, target: ConnForm): Promise<AnalyzeResult> => {
      try {
        const [os, ts] = await Promise.all([
          connector.fetchSchema(origin),
          connector.fetchSchema(target),
        ]);
        const diff = compareSchema(os, ts);
        return { ok: true, message: "비교 완료", diff };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(CHANNELS.listHistory, async () => {
    return historyStore().list();
  });
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // 스모크 모드: 창/IPC 초기화가 끝나면 즉시 종료(구동 검증용, CI/로컬).
  if (process.env.DSM_SMOKE === "1") {
    setTimeout(() => app.quit(), 1500);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
