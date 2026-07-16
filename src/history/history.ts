/**
 * History — 작업 기록(순수 부분).
 *
 * 모든 실행(동기화/덤프/복원/백업)의 결과를 한 줄 기록으로 남긴다.
 * 재실행을 위해 taskId 와 핵심 파라미터를 함께 보관한다.
 * 저장은 HistoryStore(JSONL) 가 담당한다.
 */

import type { SavedConnection, TaskKind } from "../task/task.js";

export type RunStatus = "success" | "failure";

/** 실행 결과 건수 요약(해당 시). */
export interface RunCounts {
  insert?: number;
  update?: number;
  delete?: number;
  statements?: number;
}

export interface HistoryEntry {
  /** 실행 식별자(외부 주입). */
  id: string;
  at: string;
  kind: TaskKind;
  /** 연관 Task(있으면 재실행 근거). */
  taskId?: string;
  origin?: SavedConnection;
  target?: SavedConnection;
  status: RunStatus;
  counts?: RunCounts;
  /** 실패 시 원인 메시지. */
  error?: string;
}

export interface HistoryInput {
  id: string;
  kind: TaskKind;
  status: RunStatus;
  taskId?: string;
  origin?: SavedConnection;
  target?: SavedConnection;
  counts?: RunCounts;
  error?: string;
}

/** 실행 결과로부터 History 항목을 만든다. 시각은 외부 주입. */
export function buildHistoryEntry(input: HistoryInput, at: Date): HistoryEntry {
  const entry: HistoryEntry = {
    id: input.id,
    at: at.toISOString(),
    kind: input.kind,
    status: input.status,
  };
  if (input.taskId !== undefined) entry.taskId = input.taskId;
  if (input.origin !== undefined) entry.origin = input.origin;
  if (input.target !== undefined) entry.target = input.target;
  if (input.counts !== undefined) entry.counts = input.counts;
  if (input.error !== undefined) entry.error = input.error;
  return entry;
}

/** 한 줄 요약 텍스트(History 목록 표시용). */
export function formatHistoryLine(e: HistoryEntry): string {
  const dir =
    e.origin && e.target
      ? `${e.origin.database} → ${e.target.database}`
      : e.target?.database ?? e.origin?.database ?? "-";
  const c = e.counts
    ? ` [I:${e.counts.insert ?? 0} U:${e.counts.update ?? 0} D:${e.counts.delete ?? 0}]`
    : "";
  const mark = e.status === "success" ? "성공" : "실패";
  return `${e.at} ${e.kind} ${dir}${c} ${mark}`;
}
