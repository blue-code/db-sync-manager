import { describe, it, expect } from "vitest";
import { nextRun, validateSchedule, type Schedule } from "../src/scheduler/schedule.js";

describe("validateSchedule", () => {
  it("interval 은 양의 정수만 허용한다", () => {
    expect(validateSchedule({ kind: "interval", everyMinutes: 30 })).toEqual([]);
    expect(validateSchedule({ kind: "interval", everyMinutes: 0 })).not.toEqual([]);
  });
  it("시/분/요일 범위를 검증한다", () => {
    expect(validateSchedule({ kind: "daily", hour: 25, minute: 0 })).not.toEqual([]);
    expect(validateSchedule({ kind: "weekly", weekday: 7 as never, hour: 2, minute: 0 })).not.toEqual([]);
  });
});

describe("nextRun", () => {
  it("interval: N분 뒤를 돌려준다", () => {
    const from = new Date(2026, 6, 16, 1, 0, 0);
    const next = nextRun({ kind: "interval", everyMinutes: 90 }, from);
    expect(next).toEqual(new Date(2026, 6, 16, 2, 30, 0));
  });

  it("daily: 아직 지나지 않은 오늘 2시로 잡는다", () => {
    const from = new Date(2026, 6, 16, 1, 0, 0); // 새벽 1시
    const next = nextRun({ kind: "daily", hour: 2, minute: 0 }, from);
    expect(next).toEqual(new Date(2026, 6, 16, 2, 0, 0));
  });

  it("daily: 이미 지난 시각이면 다음 날로 넘긴다", () => {
    const from = new Date(2026, 6, 16, 3, 0, 0); // 새벽 3시
    const next = nextRun({ kind: "daily", hour: 2, minute: 0 }, from);
    expect(next).toEqual(new Date(2026, 6, 17, 2, 0, 0));
  });

  it("weekly: 지정 요일까지 넘긴다", () => {
    // 2026-07-16 은 목요일(4). 다음 일요일(0) 새벽 2시를 원한다.
    const from = new Date(2026, 6, 16, 3, 0, 0);
    const next = nextRun({ kind: "weekly", weekday: 0, hour: 2, minute: 0 }, from);
    expect(next.getDay()).toBe(0);
    expect(next).toEqual(new Date(2026, 6, 19, 2, 0, 0)); // 7/19 = 일요일
  });
});
