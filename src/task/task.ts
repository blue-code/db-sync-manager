/**
 * Task 추상화(순수).
 *
 * "전체 덤프 후 복원", "users 데이터만 추가", "email 컬럼만 동기화" 등
 * 반복 실행할 작업을 하나의 선언형 스펙으로 저장·재실행하기 위한 모델이다.
 *
 * 보안 원칙: Task 에는 비밀번호를 저장하지 않는다(host/port/user/database 만).
 * 비밀번호는 실행 시점에 주입한다(전역 규칙: 민감정보 커밋 방지).
 */

import type { ConnectionConfig } from "../domain/types.js";
import type { SyncMode } from "../sync/syncMode.js";
import type { DumpMode } from "../dump/dumpGenerator.js";
import { validateSchedule, type Schedule } from "../scheduler/schedule.js";

export type TaskKind = "syncCoarse" | "syncFine" | "dump" | "restore" | "backup";

/** 비밀번호를 제외한 접속 정보(저장 안전). */
export type SavedConnection = Omit<ConnectionConfig, "password">;

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  /** 원본(읽기 대상). dump/sync/backup 에서 사용. */
  origin?: SavedConnection;
  /** 대상(쓰기 대상). restore/sync 에서 사용. */
  target?: SavedConnection;
  /** 동기화 대상 단일 테이블(sync). */
  table?: string;
  /** 덤프 대상 테이블 목록(dump). 비면 전체. */
  tables?: string[];
  mode?: SyncMode;
  dumpMode?: DumpMode;
  includeDeletes?: boolean;
  updateColumns?: string[];
  /** 예약 실행 스케줄(있으면 Scheduler 가 다음 실행 시각을 계산). */
  schedule?: Schedule;
  createdAt: string;
  updatedAt?: string;
}

/** 접속 정보에서 비밀번호를 제거한다. */
export function stripPassword(config: ConnectionConfig): SavedConnection {
  const { password: _pw, ...rest } = config;
  return rest;
}

/** 이름을 파일/식별자 안전 슬러그로 바꾼다. */
function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "_")
      .replace(/^_+|_+$/g, "") || "task"
  );
}

function yyyymmdd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/** Task ID 를 생성한다: task_YYYYMMDD_slug. */
export function generateTaskId(name: string, date: Date): string {
  return `task_${yyyymmdd(date)}_${slug(name)}`;
}

export type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt">;

/** Task 를 생성한다. 시각/ID 는 재현성을 위해 주입한다. */
export function createTask(
  input: TaskInput,
  now: Date,
  id: string = generateTaskId(input.name, now),
): Task {
  return { ...input, id, createdAt: now.toISOString() };
}

/**
 * Task 스펙의 정합성을 검증한다. 문제 목록(비면 정상)을 돌려준다.
 * kind 별로 필요한 필드가 다르다.
 */
export function validateTask(task: Task): string[] {
  const errors: string[] = [];
  if (!task.name.trim()) errors.push("name 이 비어 있다");

  const needsOrigin = task.kind === "syncCoarse" || task.kind === "syncFine" || task.kind === "dump" || task.kind === "backup";
  const needsTarget = task.kind === "syncCoarse" || task.kind === "syncFine" || task.kind === "restore";
  const needsMode = task.kind === "syncCoarse" || task.kind === "syncFine";

  if (needsOrigin && !task.origin) errors.push(`${task.kind} 는 origin 접속이 필요하다`);
  if (needsTarget && !task.target) errors.push(`${task.kind} 는 target 접속이 필요하다`);
  if (needsMode && !task.mode) errors.push(`${task.kind} 는 mode 가 필요하다`);
  if (task.kind === "syncFine" && task.mode === "overwrite") {
    errors.push("syncFine 은 overwrite 를 지원하지 않는다(syncCoarse 사용)");
  }
  if (task.schedule) {
    errors.push(...validateSchedule(task.schedule));
  }
  return errors;
}
