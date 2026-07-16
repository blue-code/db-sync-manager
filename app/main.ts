/**
 * Electron 메인 프로세스(배선 전용).
 *
 * 창을 만들고, 렌더러의 IPC 요청을 handlers(Electron 비의존 로직)에 연결한다.
 * 파일 대화상자가 필요한 saveDump/planRestore 만 여기서 경로를 얻어 핸들러에 넘긴다.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MysqlConnector, autoDumpFilename } from "../src/index.js";
import { createHandlers } from "./handlers.js";
import {
  CHANNELS,
  type ConnForm,
  type DumpParams,
  type SaveDumpResult,
  type PlanRestoreResult,
} from "./ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
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

function registerIpc(): void {
  const h = createHandlers({
    connector: new MysqlConnector(),
    userDataDir: app.getPath("userData"),
  });

  // 인자를 그대로 넘기는 단순 채널.
  ipcMain.handle(CHANNELS.testConnection, (_e, c: ConnForm) => h.testConnection(c));
  ipcMain.handle(CHANNELS.analyze, (_e, o: ConnForm, t: ConnForm) => h.analyze(o, t));
  ipcMain.handle(CHANNELS.listTables, (_e, c: ConnForm) => h.listTables(c));
  ipcMain.handle(CHANNELS.reviewSync, (_e, o, t, p) => h.reviewSync(o, t, p));
  ipcMain.handle(CHANNELS.planSync, (_e, o, t, p) => h.planSync(o, t, p));
  ipcMain.handle(CHANNELS.applySync, (_e, o, t, p) => h.applySync(o, t, p));
  ipcMain.handle(CHANNELS.buildDump, (_e, o: ConnForm, p: DumpParams) => h.buildDump(o, p));
  ipcMain.handle(CHANNELS.applyRestore, (_e, t, p) => h.applyRestore(t, p));
  ipcMain.handle(CHANNELS.taskSave, (_e, inp) => h.taskSave(inp));
  ipcMain.handle(CHANNELS.taskList, () => h.taskList());
  ipcMain.handle(CHANNELS.taskRemove, (_e, id: string) => h.taskRemove(id));
  ipcMain.handle(CHANNELS.listHistory, () => h.listHistory());

  // 파일 대화상자가 필요한 채널: 경로만 여기서 얻어 핸들러에 위임한다.
  ipcMain.handle(
    CHANNELS.saveDump,
    async (_e, origin: ConnForm, params: DumpParams): Promise<SaveDumpResult> => {
      const picked = await dialog.showSaveDialog({
        title: "덤프 저장",
        defaultPath: autoDumpFilename(origin.database, new Date(), params.compression),
        filters: [{ name: "SQL Dump", extensions: params.compression === "gzip" ? ["gz"] : ["sql"] }],
      });
      if (picked.canceled || !picked.filePath) return { ok: false, message: "저장이 취소되었습니다." };
      return h.saveDumpTo(origin, params, picked.filePath);
    },
  );

  ipcMain.handle(CHANNELS.planRestore, async (): Promise<PlanRestoreResult> => {
    const picked = await dialog.showOpenDialog({
      title: "복원할 덤프 선택",
      properties: ["openFile"],
      filters: [{ name: "SQL Dump", extensions: ["sql", "gz"] }],
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { ok: false, message: "선택이 취소되었습니다." };
    return h.planRestoreFile(filePath);
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
