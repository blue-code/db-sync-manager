/**
 * IPC 핸들러 로직(Electron 비의존).
 *
 * ipcMain/dialog/app 에 의존하지 않는 순수 로직으로 분리해, 실 MySQL 로
 * 직접 통합 테스트할 수 있게 한다. main.ts 는 이 팩토리를 ipcMain 에 배선한다.
 * 파일 대화상자가 필요한 부분(saveDump/planRestore)은 경로를 인자로 받는 형태로 노출한다.
 */

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  compareSchema,
  compareData,
  buildSyncPlan,
  generatePlanSql,
  generateSyncSql,
  generateObjectSync,
  analyzeStatements,
  previewSql,
  generateDump,
  autoDumpFilename,
  writeDumpFile,
  readDumpFile,
  planRestore,
  buildHistoryEntry,
  HistoryStore,
  TaskStore,
  stripPassword,
  createTask,
  validateTask,
  upsertTask,
  removeTask,
  nextRun,
  addRecent,
  type RecentConnection,
  type DbConnector,
  type TaskInput,
  type DataRow,
  type TableDef,
  type SafetyWarning,
  type RunCounts,
  type TaskKind,
} from "../src/index.js";
import type {
  ConnForm,
  TestConnectionResult,
  AnalyzeResult,
  ListTablesResult,
  SyncParams,
  PlanSyncParams,
  PlanSyncResult,
  ReviewSyncResult,
  ReviewRow,
  ApplySyncParams,
  ApplyResult,
  DumpParams,
  BuildDumpResult,
  SaveDumpResult,
  PlanRestoreResult,
  ApplyRestoreParams,
  TaskSaveInput,
  TaskListResult,
  TaskListItem,
  TaskMutateResult,
  ConnectionsState,
} from "./ipc.js";

export interface HandlerDeps {
  connector: DbConnector;
  /** history.jsonl / tasks.json / backups 를 둘 디렉터리. */
  userDataDir: string;
}

/**
 * 실패 메시지를 사용자에게 읽기 쉬운 한글로 다듬는다.
 * 원인을 숨기지 않도록, 힌트가 있으면 힌트 + 원문(raw)을 함께 보여준다.
 */
export function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const withRaw = (hint: string) => `${hint}\n원인: ${raw}`;

  // SSL 관련: 서버가 SSL 을 요구하거나, 인증서 검증 실패.
  if (/secure transport|insecure transport|SSL connection is required|ER_SECURE_TRANSPORT_REQUIRED/i.test(raw)) {
    return withRaw("서버가 SSL 접속을 요구합니다. 'SSL 사용'을 켜고 다시 시도하세요.");
  }
  if (/self.?signed|unable to (get|verify)|CERT_|certificate|SSL routines|wrong version number/i.test(raw)) {
    return withRaw("SSL 인증서를 검증할 수 없습니다. 'SSL 사용(인증서 미검증)'을 켜세요.");
  }
  if (/ECONNREFUSED/.test(raw)) return withRaw("접속 거부: 호스트/포트를 확인하세요.");
  if (/ENOTFOUND|EAI_AGAIN/.test(raw)) return withRaw("호스트를 찾을 수 없습니다(DNS).");
  if (/ETIMEDOUT|timeout/i.test(raw)) return withRaw("접속 시간 초과: 호스트/포트/방화벽을 확인하세요.");
  if (/Access denied/i.test(raw)) return withRaw("인증 실패: 계정/비밀번호를 확인하세요.");
  if (/Unknown database/i.test(raw)) return withRaw("존재하지 않는 데이터베이스입니다.");
  // 매칭 안 되면 원문을 그대로 노출한다(무엇이 문제인지 반드시 보이도록).
  return raw;
}

/** 미리보기가 너무 길면 잘라낸다(렌더러 부하 방지). */
function clipPreview(text: string, max = 8000): string {
  return text.length > max ? text.slice(0, max) + "\n... (이하 생략)" : text;
}

/** 키 객체를 선택 매칭용 안정 문자열로 만든다(renderer 와 규칙 일치). */
function keyStr(key: Record<string, unknown>, keyColumns: string[]): string {
  return keyColumns.map((c) => JSON.stringify(key[c] ?? null)).join("");
}

/** connections.json 을 읽어 정규화한다(없거나 손상 시 빈 상태). */
async function readConnections(userDataDir: string): Promise<ConnectionsState> {
  try {
    const parsed = JSON.parse(
      await readFile(join(userDataDir, "connections.json"), "utf8"),
    ) as Partial<ConnectionsState>;
    const state: ConnectionsState = { recents: parsed.recents ?? [] };
    if (parsed.origin) state.origin = parsed.origin;
    if (parsed.target) state.target = parsed.target;
    return state;
  } catch {
    return { recents: [] };
  }
}

interface SyncComputation {
  statements: string[];
  targetTable: TableDef;
  summary: { insert: number; update: number; delete: number };
  destructive: boolean;
  warnings: SafetyWarning[];
}

export function createHandlers(deps: HandlerDeps) {
  const { connector, userDataDir } = deps;
  const historyStore = () => new HistoryStore(join(userDataDir, "history.jsonl"));
  const taskStore = () => new TaskStore(join(userDataDir, "tasks.json"));

  async function record(
    kind: TaskKind,
    status: "success" | "failure",
    origin: ConnForm | undefined,
    target: ConnForm | undefined,
    extra: { counts?: RunCounts; error?: string },
  ): Promise<void> {
    const input: Parameters<typeof buildHistoryEntry>[0] = { id: String(Date.now()), kind, status };
    if (origin) input.origin = stripPassword(origin);
    if (target) input.target = stripPassword(target);
    if (extra.counts) input.counts = extra.counts;
    if (extra.error) input.error = extra.error;
    await historyStore().append(buildHistoryEntry(input, new Date()));
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
      const originRows = await connector.fetchRows(origin, params.table);
      statements = generateSyncSql({ table: targetTable, rows: originRows, mode: "overwrite" });
      summary = { insert: originRows.length, update: 0, delete: 0 };
      destructive = true;
    } else {
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

  async function backupTargetTable(target: ConnForm, table: string): Promise<string> {
    const schema = await connector.fetchSchema(target);
    const data = new Map<string, DataRow[]>();
    data.set(table, await connector.fetchRows(target, table));
    const text = generateDump({ snapshot: schema, data }, { tables: [table] }, new Date().toISOString());
    const dir = join(userDataDir, "backups");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, autoDumpFilename(`${target.database}_${table}`, new Date(), "gzip"));
    await writeDumpFile(filePath, text, "gzip");
    return filePath;
  }

  async function dumpText(origin: ConnForm, params: DumpParams): Promise<string> {
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

  const buildTaskInput = (inp: TaskSaveInput): TaskInput => {
    const t: TaskInput = { name: inp.name, kind: inp.kind };
    if (inp.origin) t.origin = stripPassword(inp.origin);
    if (inp.target) t.target = stripPassword(inp.target);
    if (inp.table !== undefined) t.table = inp.table;
    if (inp.mode !== undefined) t.mode = inp.mode;
    if (inp.includeDeletes !== undefined) t.includeDeletes = inp.includeDeletes;
    if (inp.dumpMode !== undefined) t.dumpMode = inp.dumpMode;
    if (inp.tables !== undefined) t.tables = inp.tables;
    if (inp.schedule !== undefined) t.schedule = inp.schedule;
    return t;
  };

  return {
    async testConnection(config: ConnForm): Promise<TestConnectionResult> {
      try {
        // fetchGrants 는 실패 시 실제 오류를 던지므로 원인을 정확히 보여줄 수 있다.
        // (ping 은 boolean 만 돌려줘 원인이 사라진다)
        await connector.fetchGrants(config);
        return { ok: true, message: "접속 성공" };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    async analyze(origin: ConnForm, target: ConnForm): Promise<AnalyzeResult> {
      try {
        const [os, ts] = await Promise.all([connector.fetchSchema(origin), connector.fetchSchema(target)]);
        return { ok: true, message: "비교 완료", diff: compareSchema(os, ts) };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    async listTables(config: ConnForm): Promise<ListTablesResult> {
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

    async reviewSync(origin: ConnForm, target: ConnForm, params: SyncParams): Promise<ReviewSyncResult> {
      try {
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
        const changed = diff.rows.filter((r) => {
          if (r.status === "identical") return false;
          if (r.status === "removed" && !params.includeDeletes) return false;
          return true;
        });
        const max = 1000;
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
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    async planSync(origin: ConnForm, target: ConnForm, params: PlanSyncParams): Promise<PlanSyncResult> {
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

    async applySync(origin: ConnForm, target: ConnForm, params: ApplySyncParams): Promise<ApplyResult> {
      const kind: TaskKind = params.mode === "overwrite" ? "syncCoarse" : "syncFine";
      try {
        const c = await computeSync(origin, target, params);
        if (c.statements.length === 0) return { ok: true, message: "변경 사항이 없습니다.", executed: 0 };
        let backupPath: string | undefined;
        if (c.destructive && params.backup) backupPath = await backupTargetTable(target, params.table);
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

    /** 객체(뷰/루틴/트리거/이벤트) 동기화 미리보기. */
    async planObjectSync(origin: ConnForm, target: ConnForm): Promise<PlanSyncResult> {
      try {
        const [o, t] = await Promise.all([connector.fetchSchema(origin), connector.fetchSchema(target)]);
        const statements = generateObjectSync(o, t);
        const warnings = analyzeStatements(statements);
        return {
          ok: true,
          message: statements.length ? "객체 변경 미리보기" : "객체 차이가 없습니다.",
          preview: clipPreview(previewSql(statements)),
          warnings,
          destructive: warnings.length > 0,
          statementCount: statements.length,
        };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    /** 객체 동기화 실행(Target 의 객체를 Origin 에 맞춤). */
    async applyObjectSync(origin: ConnForm, target: ConnForm): Promise<ApplyResult> {
      try {
        const [o, t] = await Promise.all([connector.fetchSchema(origin), connector.fetchSchema(target)]);
        const statements = generateObjectSync(o, t);
        if (statements.length === 0) return { ok: true, message: "객체 차이가 없습니다.", executed: 0 };
        const executed = await connector.execute(target, statements);
        await record("syncCoarse", "success", origin, target, { counts: { statements: executed } });
        return { ok: true, message: `객체 동기화 완료 (${executed}문)`, executed };
      } catch (err) {
        const message = toMessage(err);
        await record("syncCoarse", "failure", origin, target, { error: message });
        return { ok: false, message };
      }
    },

    async buildDump(origin: ConnForm, params: DumpParams): Promise<BuildDumpResult> {
      try {
        const text = await dumpText(origin, params);
        return { ok: true, message: "덤프 미리보기 생성됨", preview: clipPreview(text), byteLength: Buffer.byteLength(text, "utf8") };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    /** 대화상자에서 고른 경로에 덤프를 저장한다(경로는 main 이 주입). */
    async saveDumpTo(origin: ConnForm, params: DumpParams, filePath: string): Promise<SaveDumpResult> {
      try {
        const text = await dumpText(origin, params);
        await writeDumpFile(filePath, text, params.compression);
        await record("dump", "success", origin, undefined, {});
        return { ok: true, message: "덤프를 저장했습니다.", filePath };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    /** 대화상자에서 고른 덤프 파일의 복원 미리보기를 만든다. */
    async planRestoreFile(filePath: string): Promise<PlanRestoreResult> {
      try {
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
    },

    async applyRestore(target: ConnForm, params: ApplyRestoreParams): Promise<ApplyResult> {
      try {
        const sql = await readDumpFile(params.filePath);
        const statements = planRestore(sql, { schemaOnly: params.schemaOnly, dataOnly: params.dataOnly });
        const executed = await connector.execute(target, statements);
        await record("restore", "success", undefined, target, { counts: { statements: executed } });
        return { ok: true, message: `복원 완료 (${executed}문)`, executed };
      } catch (err) {
        const message = toMessage(err);
        await record("restore", "failure", undefined, target, { error: message });
        return { ok: false, message };
      }
    },

    async taskSave(inp: TaskSaveInput): Promise<TaskMutateResult> {
      try {
        const task = createTask(buildTaskInput(inp), new Date());
        const errors = validateTask(task);
        if (errors.length) return { ok: false, message: errors.join(" / ") };
        const tasks = await taskStore().load();
        await taskStore().save(upsertTask(tasks, task, new Date()));
        return { ok: true, message: `저장됨: ${task.name}`, taskId: task.id };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    async taskList(): Promise<TaskListResult> {
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
    },

    async taskRemove(id: string): Promise<TaskMutateResult> {
      try {
        const tasks = await taskStore().load();
        await taskStore().save(removeTask(tasks, id));
        return { ok: true, message: "삭제됨" };
      } catch (err) {
        return { ok: false, message: toMessage(err) };
      }
    },

    listHistory() {
      return historyStore().list();
    },

    /** 저장된 최근 접속(입력 정보)을 불러온다. */
    async connectionsLoad(): Promise<ConnectionsState> {
      return readConnections(userDataDir);
    },

    /** 입력한 접속 정보를 기억한다(비밀번호 제외). */
    async connectionsSave(role: "origin" | "target", config: ConnForm): Promise<{ ok: boolean }> {
      const entry: RecentConnection = {
        host: config.host,
        port: config.port,
        user: config.user,
        database: config.database,
      };
      if (config.ssl) entry.ssl = true;
      const state = await readConnections(userDataDir);
      state[role] = entry;
      state.recents = addRecent(state.recents, entry);
      await mkdir(userDataDir, { recursive: true });
      await writeFile(join(userDataDir, "connections.json"), JSON.stringify(state, null, 2), "utf8");
      return { ok: true };
    },
  };
}

export type Handlers = ReturnType<typeof createHandlers>;
