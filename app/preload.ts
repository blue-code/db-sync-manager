/**
 * preload — 안전한 IPC 브리지.
 *
 * contextIsolation 하에서 renderer 에 최소한의 API 만 노출한다.
 * renderer 는 Node/Electron 에 직접 접근하지 못하고 window.dbsync 만 쓴다.
 */

import { contextBridge, ipcRenderer } from "electron";
import {
  CHANNELS,
  type ConnForm,
  type TestConnectionResult,
  type AnalyzeResult,
  type ListTablesResult,
  type SyncParams,
  type ReviewSyncResult,
  type PlanSyncParams,
  type PlanSyncResult,
  type ApplySyncParams,
  type ApplyResult,
  type DumpParams,
  type BuildDumpResult,
  type SaveDumpResult,
  type PlanRestoreResult,
  type ApplyRestoreParams,
} from "./ipc.js";

const api = {
  testConnection: (config: ConnForm): Promise<TestConnectionResult> =>
    ipcRenderer.invoke(CHANNELS.testConnection, config),
  analyze: (origin: ConnForm, target: ConnForm): Promise<AnalyzeResult> =>
    ipcRenderer.invoke(CHANNELS.analyze, origin, target),
  listTables: (config: ConnForm): Promise<ListTablesResult> =>
    ipcRenderer.invoke(CHANNELS.listTables, config),

  reviewSync: (origin: ConnForm, target: ConnForm, params: SyncParams): Promise<ReviewSyncResult> =>
    ipcRenderer.invoke(CHANNELS.reviewSync, origin, target, params),
  planSync: (origin: ConnForm, target: ConnForm, params: PlanSyncParams): Promise<PlanSyncResult> =>
    ipcRenderer.invoke(CHANNELS.planSync, origin, target, params),
  applySync: (origin: ConnForm, target: ConnForm, params: ApplySyncParams): Promise<ApplyResult> =>
    ipcRenderer.invoke(CHANNELS.applySync, origin, target, params),

  buildDump: (origin: ConnForm, params: DumpParams): Promise<BuildDumpResult> =>
    ipcRenderer.invoke(CHANNELS.buildDump, origin, params),
  saveDump: (origin: ConnForm, params: DumpParams): Promise<SaveDumpResult> =>
    ipcRenderer.invoke(CHANNELS.saveDump, origin, params),

  planRestore: (): Promise<PlanRestoreResult> => ipcRenderer.invoke(CHANNELS.planRestore),
  applyRestore: (target: ConnForm, params: ApplyRestoreParams): Promise<ApplyResult> =>
    ipcRenderer.invoke(CHANNELS.applyRestore, target, params),

  listHistory: (): Promise<unknown[]> => ipcRenderer.invoke(CHANNELS.listHistory),
};

contextBridge.exposeInMainWorld("dbsync", api);

export type DbSyncApi = typeof api;
