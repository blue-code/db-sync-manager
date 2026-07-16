/**
 * preload — 안전한 IPC 브리지.
 *
 * contextIsolation 하에서 renderer 에 최소한의 API 만 노출한다.
 * renderer 는 Node/Electron 에 직접 접근하지 못하고 window.dbsync 만 쓴다.
 */

import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type ConnForm, type TestConnectionResult, type AnalyzeResult } from "./ipc.js";

const api = {
  testConnection: (config: ConnForm): Promise<TestConnectionResult> =>
    ipcRenderer.invoke(CHANNELS.testConnection, config),
  analyze: (origin: ConnForm, target: ConnForm): Promise<AnalyzeResult> =>
    ipcRenderer.invoke(CHANNELS.analyze, origin, target),
  listHistory: (): Promise<unknown[]> => ipcRenderer.invoke(CHANNELS.listHistory),
};

contextBridge.exposeInMainWorld("dbsync", api);

export type DbSyncApi = typeof api;
