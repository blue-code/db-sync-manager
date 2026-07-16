/**
 * Electron 메인 프로세스.
 *
 * 창을 만들고, 렌더러의 IPC 요청을 코어 엔진에 연결한다.
 * 파괴적 작업(Sync/Restore)은 plan(미리보기) → apply(실행) 2단계로만 노출한다.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  MysqlConnector,
  compareSchema,
  compareData,
  buildSyncPlan,
  generatePlanSql,
  generateSyncSql,
  analyzeStatements,
  previewSql,
  generateDump,
  autoDumpFilename,
  writeDumpFile,
  readDumpFile,
  planRestore,
  buildHistoryEntry,
  HistoryStore,
  stripPassword,
  createTask,
  validateTask,
  upsertTask,
  removeTask,
  TaskStore,
  nextRun,
  type TaskInput,
  type DataRow,
  type TableDef,
  type SafetyWarning,
  type RunCounts,
  type TaskKind,
} from "../src/index.js";
import {
  CHANNELS,
  type ConnForm,
  type TestConnectionResult,
  type AnalyzeResult,
  type ListTablesResult,
  type SyncParams,
  type PlanSyncParams,
  type PlanSyncResult,
  type ReviewSyncResult,
  type ReviewRow,
  type ApplySyncParams,
  type ApplyResult,
  type DumpParams,
  type BuildDumpResult,
  type SaveDumpResult,
  type PlanRestoreResult,
  type ApplyRestoreParams,
  type TaskSaveInput,
  type TaskListResult,
  type TaskListItem,
  type TaskMutateResult,
} from "./ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const connector = new MysqlConnector();

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

/** 실패 메시지를 사용자에게 읽기 쉬운 한글로 다듬는다. */
function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED/.test(raw)) return "접속 거부: 호스트/포트를 확인하세요.";
  if (/ENOTFOUND|EAI_AGAIN/.test(raw)) return "호스트를 찾을 수 없습니다.";
  if (/Access denied/i.test(raw)) return "인증 실패: 계정/비밀번호를 확인하세요.";
  if (/Unknown database/i.test(raw)) return "존재하지 않는 데이터베이스입니다.";
  return raw;
}

function historyStore(): HistoryStore {
  return new HistoryStore(join(app.getPath("userData"), "history.jsonl"));
}

function taskStore(): TaskStore {
  return new TaskStore(join(app.getPath("userData"), "tasks.json"));
}

/** 미리보기가 너무 길면 잘라낸다(렌더러 부하 방지). */
function clipPreview(text: string, max = 8000): string {
  return text.length > max ? text.slice(0, max) + "\n... (이하 생략)" : text;
}

/** 실행 기록을 남긴다(성공/실패 공통). */
async function record(
  kind: TaskKind,
  status: "success" | "failure",
  origin: ConnForm | undefined,
  target: ConnForm | undefined,
  extra: { counts?: RunCounts; error?: string },
): Promise<void> {
  const input: Parameters<typeof buildHistoryEntry>[0] = {
    id: String(Date.now()),
    kind,
    status,
  };
  if (origin) input.origin = stripPassword(origin);
  if (target) input.target = stripPassword(target);
  if (extra.counts) input.counts = extra.counts;
  if (extra.error) input.error = extra.error;
  await historyStore().append(buildHistoryEntry(input, new Date()));
}

// ---- Sync 계획 계산(plan/apply 공유) ----

interface SyncComputation {
  statements: string[];
  targetTable: TableDef;
  summary: { insert: number; update: number; delete: number };
  destructive: boolean;
  warnings: SafetyWarning[];
}

/** 키 객체를 선택 매칭용 안정 문자열로 만든다(renderer 와 규칙 일치). */
function keyStr(key: Record<string, unknown>, keyColumns: string[]): string {
  return keyColumns.map((c) => JSON.stringify(key[c] ?? null)).join("");
}

async function computeSync(
  origin: ConnForm,
  target: ConnForm,
  params: PlanSyncParams,
): Promise<SyncComputation> {
  const targetSchema = await connector.fetchSchema(target);
  const targetTable = targetSchema.tables.find((t) => t.name === params.table);
  if (!targetTable) throw new Error(`Target 에 '${params.table}' 테이블이 없습니다.`);

  let statements: string[];
  let summary = { insert: 0, update: 0, delete: 0 };
  let destructive = false;

  if (params.mode === "overwrite") {
    // 코스 경로: 데이터만 덮어쓰기(TRUNCATE + INSERT). 행 선택은 적용되지 않는다.
    const originRows = await connector.fetchRows(origin, params.table);
    statements = generateSyncSql({ table: targetTable, rows: originRows, mode: "overwrite" });
    summary = { insert: originRows.length, update: 0, delete: 0 };
    destructive = true; // TRUNCATE 로 기존 행 제거
  } else {
    // 파인 경로: diff 기반 계획. selectedKeys 가 있으면 그 행만 포함한다.
    if (targetTable.primaryKey.length === 0) {
      throw new Error(`'${params.table}' 에 PK 가 없어 데이터 비교 동기화가 불가합니다.`);
    }
    const pk = targetTable.primaryKey;
    const [originRows, targetRows] = await Promise.all([
      connector.fetchRows(origin, params.table),
      connector.fetchRows(target, params.table),
    ]);
    const diff = compareData(params.table, originRows, targetRows, pk);

    const selected = params.selectedKeys ? new Set(params.selectedKeys) : undefined;
    const plan = buildSyncPlan(diff, {
      mode: params.mode,
      includeDeletes: params.includeDeletes,
      ...(selected ? { select: (row) => selected.has(keyStr(row.key, pk)) } : {}),
    });
    statements = generatePlanSql(plan, targetTable);
    summary = plan.summary;
    destructive = plan.destructive;
  }

  return { statements, targetTable, summary, destructive, warnings: analyzeStatements(statements) };
}

/** Difference Review: 변경 대상 행 목록을 만든다(파인 모드 전용). */
async function computeReview(
  origin: ConnForm,
  target: ConnForm,
  params: SyncParams,
  max = 1000,
): Promise<ReviewSyncResult> {
  const targetSchema = await connector.fetchSchema(target);
  const targetTable = targetSchema.tables.find((t) => t.name === params.table);
  if (!targetTable) throw new Error(`Target 에 '${params.table}' 테이블이 없습니다.`);
  if (targetTable.primaryKey.length === 0) {
    throw new Error(`'${params.table}' 에 PK 가 없어 행 단위 검토가 불가합니다.`);
  }
  const pk = targetTable.primaryKey;

  const [originRows, targetRows] = await Promise.all([
    connector.fetchRows(origin, params.table),
    connector.fetchRows(target, params.table),
  ]);
  const diff = compareData(params.table, originRows, targetRows, pk);

  // 변경 대상만(동일 제외). includeDeletes 가 아니면 removed 는 검토 목록에서 제외.
  const changed = diff.rows.filter((r) => {
    if (r.status === "identical") return false;
    if (r.status === "removed" && !params.includeDeletes) return false;
    return true;
  });

  const rows: ReviewRow[] = changed.slice(0, max).map((r) => {
    const label = pk.map((c) => `${c}=${String(r.key[c])}`).join(", ");
    const row: ReviewRow = { keyStr: keyStr(r.key, pk), keyLabel: label, status: r.status };
    if (r.status === "modified") row.changes = r.changes;
    return row;
  });

  return {
    ok: true,
    message: `검토 대상 ${changed.length}건`,
    summary: diff.summary,
    keyColumns: pk,
    rows,
    truncated: changed.length > max,
  };
}

/** 특정 테이블만 덤프해 백업 파일로 저장한다(파괴적 동기화 전). */
async function backupTargetTable(target: ConnForm, table: string): Promise<string> {
  const schema = await connector.fetchSchema(target);
  const data = new Map<string, DataRow[]>();
  data.set(table, await connector.fetchRows(target, table));
  const text = generateDump({ snapshot: schema, data }, { tables: [table] }, new Date().toISOString());

  const dir = join(app.getPath("userData"), "backups");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, autoDumpFilename(`${target.database}_${table}`, new Date(), "gzip"));
  await writeDumpFile(filePath, text, "gzip");
  return filePath;
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
        return { ok: true, message: "비교 완료", diff: compareSchema(os, ts) };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(
    CHANNELS.listTables,
    async (_e, config: ConnForm): Promise<ListTablesResult> => {
      try {
        const schema = await connector.fetchSchema(config);
        return {
          ok: true,
          message: `${schema.tables.length}개 테이블`,
          tables: schema.tables.map((t) => ({ name: t.name, primaryKey: t.primaryKey })),
        };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  // ----- Sync: review → plan → apply -----

  ipcMain.handle(
    CHANNELS.reviewSync,
    async (_e, origin: ConnForm, target: ConnForm, params: SyncParams): Promise<ReviewSyncResult> => {
      try {
        return await computeReview(origin, target, params);
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(
    CHANNELS.planSync,
    async (_e, origin: ConnForm, target: ConnForm, params: PlanSyncParams): Promise<PlanSyncResult> => {
      try {
        const c = await computeSync(origin, target, params);
        return {
          ok: true,
          message: c.statements.length ? "미리보기 생성됨" : "변경 사항이 없습니다.",
          summary: c.summary,
          preview: clipPreview(previewSql(c.statements)),
          warnings: c.warnings,
          destructive: c.destructive,
          statementCount: c.statements.length,
        };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(
    CHANNELS.applySync,
    async (_e, origin: ConnForm, target: ConnForm, params: ApplySyncParams): Promise<ApplyResult> => {
      const kind: TaskKind = params.mode === "overwrite" ? "syncCoarse" : "syncFine";
      try {
        const c = await computeSync(origin, target, params);
        if (c.statements.length === 0) return { ok: true, message: "변경 사항이 없습니다.", executed: 0 };

        let backupPath: string | undefined;
        if (c.destructive && params.backup) {
          backupPath = await backupTargetTable(target, params.table);
        }

        const executed = await connector.execute(target, c.statements);
        await record(kind, "success", origin, target, { counts: { ...c.summary, statements: executed } });

        const result: ApplyResult = { ok: true, message: `실행 완료 (${executed}문)`, executed };
        if (backupPath) result.backupPath = backupPath;
        return result;
      } catch (err) {
        const message = toMessage(err);
        await record(kind, "failure", origin, target, { error: message });
        return { ok: false, message };
      }
    },
  );

  // ----- Dump: build(preview) → save -----

  async function buildDumpText(origin: ConnForm, params: DumpParams): Promise<string> {
    const schema = await connector.fetchSchema(origin);
    const data = new Map<string, DataRow[]>();
    if (params.mode === "data" || params.mode === "all") {
      const targets = params.tables?.length
        ? schema.tables.filter((t) => params.tables!.includes(t.name))
        : schema.tables;
      for (const t of targets) data.set(t.name, await connector.fetchRows(origin, t.name));
    }
    const opts = params.tables?.length ? { mode: params.mode, tables: params.tables } : { mode: params.mode };
    return generateDump({ snapshot: schema, data }, opts, new Date().toISOString());
  }

  ipcMain.handle(
    CHANNELS.buildDump,
    async (_e, origin: ConnForm, params: DumpParams): Promise<BuildDumpResult> => {
      try {
        const text = await buildDumpText(origin, params);
        return {
          ok: true,
          message: "덤프 미리보기 생성됨",
          preview: clipPreview(text),
          byteLength: Buffer.byteLength(text, "utf8"),
        };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  ipcMain.handle(
    CHANNELS.saveDump,
    async (_e, origin: ConnForm, params: DumpParams): Promise<SaveDumpResult> => {
      try {
        const text = await buildDumpText(origin, params);
        const defaultName = autoDumpFilename(origin.database, new Date(), params.compression);
        const picked = await dialog.showSaveDialog({
          title: "덤프 저장",
          defaultPath: defaultName,
          filters: [{ name: "SQL Dump", extensions: params.compression === "gzip" ? ["gz"] : ["sql"] }],
        });
        if (picked.canceled || !picked.filePath) return { ok: false, message: "저장이 취소되었습니다." };

        await writeDumpFile(picked.filePath, text, params.compression);
        await record("dump", "success", origin, undefined, {});
        return { ok: true, message: "덤프를 저장했습니다.", filePath: picked.filePath };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },
  );

  // ----- Restore: pick+plan → apply -----

  ipcMain.handle(CHANNELS.planRestore, async (): Promise<PlanRestoreResult> => {
    try {
      const picked = await dialog.showOpenDialog({
        title: "복원할 덤프 선택",
        properties: ["openFile"],
        filters: [{ name: "SQL Dump", extensions: ["sql", "gz"] }],
      });
      const filePath = picked.filePaths[0];
      if (picked.canceled || !filePath) return { ok: false, message: "선택이 취소되었습니다." };

      const sql = await readDumpFile(filePath);
      const statements = planRestore(sql);
      return {
        ok: true,
        message: `${statements.length}개 문장`,
        filePath,
        preview: clipPreview(previewSql(statements)),
        warnings: analyzeStatements(statements),
        statementCount: statements.length,
      };
    } catch (err) {
      return { ok: false, message: toMessage(err) };
    }
  });

  ipcMain.handle(
    CHANNELS.applyRestore,
    async (_e, target: ConnForm, params: ApplyRestoreParams): Promise<ApplyResult> => {
      try {
        const sql = await readDumpFile(params.filePath);
        const statements = planRestore(sql, {
          schemaOnly: params.schemaOnly,
          dataOnly: params.dataOnly,
        });
        const executed = await connector.execute(target, statements);
        await record("restore", "success", undefined, target, { counts: { statements: executed } });
        return { ok: true, message: `복원 완료 (${executed}문)`, executed };
      } catch (err) {
        const message = toMessage(err);
        await record("restore", "failure", undefined, target, { error: message });
        return { ok: false, message };
      }
    },
  );

  // ----- Task / Scheduler -----

  const buildTaskInput = (inp: TaskSaveInput): TaskInput => {
    const t: TaskInput = { name: inp.name, kind: inp.kind };
    if (inp.origin) t.origin = stripPassword(inp.origin); // 비밀번호 제거 후 저장
    if (inp.target) t.target = stripPassword(inp.target);
    if (inp.table !== undefined) t.table = inp.table;
    if (inp.mode !== undefined) t.mode = inp.mode;
    if (inp.includeDeletes !== undefined) t.includeDeletes = inp.includeDeletes;
    if (inp.dumpMode !== undefined) t.dumpMode = inp.dumpMode;
    if (inp.tables !== undefined) t.tables = inp.tables;
    if (inp.schedule !== undefined) t.schedule = inp.schedule;
    return t;
  };

  ipcMain.handle(CHANNELS.taskSave, async (_e, inp: TaskSaveInput): Promise<TaskMutateResult> => {
    try {
      const task = createTask(buildTaskInput(inp), new Date());
      const errors = validateTask(task);
      if (errors.length) return { ok: false, message: errors.join(" / ") };
      const tasks = await taskStore().load();
      await taskStore().save(upsertTask(tasks, task, new Date()));
      return { ok: true, message: `저장됨: ${task.name}` };
    } catch (err) {
      return { ok: false, message: toMessage(err) };
    }
  });

  ipcMain.handle(CHANNELS.taskList, async (): Promise<TaskListResult> => {
    try {
      const tasks = await taskStore().load();
      const now = new Date();
      const items: TaskListItem[] = tasks.map((t) => {
        const item: TaskListItem = { ...t };
        if (t.schedule) item.nextRunAt = nextRun(t.schedule, now).toISOString();
        return item;
      });
      return { ok: true, message: `${items.length}개 작업`, tasks: items };
    } catch (err) {
      return { ok: false, message: toMessage(err) };
    }
  });

  ipcMain.handle(CHANNELS.taskRemove, async (_e, id: string): Promise<TaskMutateResult> => {
    try {
      const tasks = await taskStore().load();
      await taskStore().save(removeTask(tasks, id));
      return { ok: true, message: "삭제됨" };
    } catch (err) {
      return { ok: false, message: toMessage(err) };
    }
  });

  ipcMain.handle(CHANNELS.listHistory, async () => historyStore().list());
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
