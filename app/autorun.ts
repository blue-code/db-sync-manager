/**
 * 예약 자동 실행 오케스트레이션(Electron 비의존, 의존성 주입).
 *
 * 매 tick 마다 예약된 Task 중 실행 시점이 된 것을 골라 실행하고 마지막 실행 시각을
 * 기록한다. 자격증명 해석·실제 실행·저장은 모두 주입된 함수에 위임하므로,
 * 이 오케스트레이션은 가짜 의존성으로 완전히 테스트할 수 있다.
 */

import { isDue, type Task } from "../src/index.js";

export interface AutorunDeps {
  loadTasks: () => Promise<Task[]>;
  getLastRun: (taskId: string) => Date | null;
  setLastRun: (taskId: string, at: Date) => Promise<void>;
  /**
   * Task 를 실행한다. 자격증명이 없거나 지원하지 않는 종류면 null 을 반환한다
   * (이 경우 마지막 실행 시각을 기록하지 않아 다음 tick 에 재시도된다).
   */
  runTask: (task: Task) => Promise<{ ok: boolean; message: string } | null>;
  log?: (msg: string) => void;
}

export interface TickResult {
  ran: string[];
  skipped: string[];
}

export function createAutorun(deps: AutorunDeps) {
  return {
    /** 주어진 시각 기준으로 실행할 Task 들을 처리한다. */
    async tick(now: Date): Promise<TickResult> {
      const ran: string[] = [];
      const skipped: string[] = [];
      const tasks = await deps.loadTasks();

      for (const t of tasks) {
        if (!t.schedule) continue;
        if (!isDue(t.schedule, deps.getLastRun(t.id), now)) continue;

        const result = await deps.runTask(t);
        if (result === null) {
          // 자격증명 없음 등 → 기록하지 않고 다음 tick 에 재시도.
          skipped.push(t.id);
          continue;
        }
        await deps.setLastRun(t.id, now);
        ran.push(t.id);
        deps.log?.(`[autorun] ${t.name}: ${result.ok ? "성공" : "실패"} — ${result.message}`);
      }
      return { ran, skipped };
    },
  };
}
