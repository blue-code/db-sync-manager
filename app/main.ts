/**
 * Electron 메인 프로세스(배선 전용).
 *
 * 창을 만들고, 렌더러의 IPC 요청을 handlers(Electron 비의존 로직)에 연결한다.
 * 파일 대화상자가 필요한 saveDump/planRestore 만 여기서 경로를 얻어 핸들러에 넘긴다.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { MysqlConnector, autoDumpFilename, type Task } from "../src/index.js";
import { createHandlers, type Handlers } from "./handlers.js";
import { createAutorun } from "./autorun.js";
import { Vault } from "./vault.js";
import {
  CHANNELS,
  type ConnForm,
  type DumpParams,
  type SaveDumpResult,
  type PlanRestoreResult,
  type SaveSecretInput,
  type TaskMutateResult,
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

/** 예약 자동 실행에 필요한 접속 정보를 볼트의 비밀번호와 합쳐 만든다(없으면 null). */
async function resolveConn(
  vault: Vault,
  task: Task,
  role: "origin" | "target",
): Promise<ConnForm | null> {
  const saved = task[role];
  if (!saved) return null;
  const password = await vault.get(`${task.id}:${role}`);
  if (password === null) return null;
  return { ...saved, password };
}

/** 예약 Task 한 건을 실행한다(자격증명 없으면 null → 다음 tick 재시도). */
async function runScheduledTask(
  h: Handlers,
  vault: Vault,
  userDataDir: string,
  task: Task,
): Promise<{ ok: boolean; message: string } | null> {
  if (task.kind === "syncFine" || task.kind === "syncCoarse") {
    const origin = await resolveConn(vault, task, "origin");
    const target = await resolveConn(vault, task, "target");
    if (!origin || !target || !task.table || !task.mode) return null;
    return h.applySync(origin, target, {
      table: task.table,
      mode: task.mode,
      includeDeletes: task.includeDeletes ?? false,
      backup: true, // 무인 실행은 항상 백업 선행
    });
  }
  if (task.kind === "dump" || task.kind === "backup") {
    const origin = await resolveConn(vault, task, "origin");
    if (!origin) return null;
    const file = join(userDataDir, "backups", autoDumpFilename(origin.database, new Date(), "gzip"));
    return h.saveDumpTo(origin, { mode: task.dumpMode ?? "all", compression: "gzip" }, file);
  }
  return null; // restore 등은 무인 실행 미지원
}

/** 자동 실행 타이머를 시작한다(앱이 열려 있는 동안 1분 간격). */
function startAutorun(h: Handlers, vault: Vault, userDataDir: string): void {
  const runStateFile = join(userDataDir, "runstate.json");
  const lastRun = new Map<string, Date>();
  let loaded = false;

  const load = async () => {
    try {
      const raw = JSON.parse(await readFile(runStateFile, "utf8")) as Record<string, string>;
      for (const [id, iso] of Object.entries(raw)) lastRun.set(id, new Date(iso));
    } catch {
      /* 없으면 빈 상태 */
    }
    loaded = true;
  };
  const persist = async () => {
    const obj: Record<string, string> = {};
    for (const [id, at] of lastRun) obj[id] = at.toISOString();
    await writeFile(runStateFile, JSON.stringify(obj), "utf8");
  };

  const autorun = createAutorun({
    loadTasks: () => h.taskList().then((r) => (r.tasks ?? []) as Task[]),
    getLastRun: (id) => lastRun.get(id) ?? null,
    setLastRun: async (id, at) => {
      lastRun.set(id, at);
      await persist();
    },
    runTask: (task) => runScheduledTask(h, vault, userDataDir, task),
    log: (m) => console.log(m),
  });

  setInterval(async () => {
    if (!loaded) await load();
    try {
      await autorun.tick(new Date());
    } catch (err) {
      console.error("[autorun] tick 실패:", err);
    }
  }, 60_000);
}

function registerIpc(): void {
  const userDataDir = app.getPath("userData");
  const vault = new Vault(join(userDataDir, "vault.json"));
  const h = createHandlers({ connector: new MysqlConnector(), userDataDir });

  startAutorun(h, vault, userDataDir);

  ipcMain.handle(
    CHANNELS.taskSaveSecret,
    async (_e, inp: SaveSecretInput): Promise<TaskMutateResult> => {
      try {
        await vault.set(`${inp.taskId}:${inp.role}`, inp.password);
        return { ok: true, message: "비밀번호를 암호화해 저장했습니다." };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // 인자를 그대로 넘기는 단순 채널.
  ipcMain.handle(CHANNELS.testConnection, (_e, c: ConnForm) => h.testConnection(c));
  ipcMain.handle(CHANNELS.analyze, (_e, o: ConnForm, t: ConnForm) => h.analyze(o, t));
  ipcMain.handle(CHANNELS.listTables, (_e, c: ConnForm) => h.listTables(c));
  ipcMain.handle(CHANNELS.reviewSync, (_e, o, t, p) => h.reviewSync(o, t, p));
  ipcMain.handle(CHANNELS.planSync, (_e, o, t, p) => h.planSync(o, t, p));
  ipcMain.handle(CHANNELS.applySync, (_e, o, t, p) => h.applySync(o, t, p));
  ipcMain.handle(CHANNELS.planObjectSync, (_e, o: ConnForm, t: ConnForm) => h.planObjectSync(o, t));
  ipcMain.handle(CHANNELS.applyObjectSync, (_e, o: ConnForm, t: ConnForm) => h.applyObjectSync(o, t));
  ipcMain.handle(CHANNELS.buildDump, (_e, o: ConnForm, p: DumpParams) => h.buildDump(o, p));
  ipcMain.handle(CHANNELS.applyRestore, (_e, t, p) => h.applyRestore(t, p));
  ipcMain.handle(CHANNELS.taskSave, (_e, inp) => h.taskSave(inp));
  ipcMain.handle(CHANNELS.taskList, () => h.taskList());
  ipcMain.handle(CHANNELS.taskRemove, (_e, id: string) => h.taskRemove(id));
  ipcMain.handle(CHANNELS.listHistory, () => h.listHistory());
  ipcMain.handle(CHANNELS.connectionsLoad, () => h.connectionsLoad());
  ipcMain.handle(CHANNELS.connectionsSave, (_e, role, config: ConnForm) => h.connectionsSave(role, config));

  // 파일 대화상자가 필요한 채널: 경로만 여기서 얻어 핸들러에 위임한다.
  ipcMain.handle(
    CHANNELS.saveDump,
    async (_e, origin: ConnForm, params: DumpParams): Promise<SaveDumpResult> => {
      const picked = await dialog.showSaveDialog({
        title: "덤프 저장",
        defaultPath: autoDumpFilename(origin.database, new Date(), params.compression),
        filters: [
          {
            name: "SQL Dump",
            extensions:
              params.compression === "gzip" ? ["gz"] : params.compression === "zip" ? ["zip"] : ["sql"],
          },
        ],
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
