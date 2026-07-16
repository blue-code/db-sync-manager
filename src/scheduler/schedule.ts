/**
 * Scheduler — 예약 실행 모델(순수).
 *
 * "매일 새벽 2시", "매주 일요일", "N분마다" 같은 예약을 선언형으로 표현하고,
 * 기준 시각으로부터 다음 실행 시각을 계산한다.
 * 실제 타이머 구동(runtime)은 이 계산 결과를 사용하는 상위 계층 몫이다.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=일요일

export type Schedule =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; weekday: Weekday; hour: number; minute: number };

/** 스케줄 정의의 정합성을 검증한다(문제 목록, 비면 정상). */
export function validateSchedule(s: Schedule): string[] {
  const errors: string[] = [];
  const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

  if (s.kind === "interval") {
    if (!Number.isInteger(s.everyMinutes) || s.everyMinutes <= 0) {
      errors.push("everyMinutes 는 1 이상의 정수여야 한다");
    }
    return errors;
  }
  if (!inRange(s.hour, 0, 23)) errors.push("hour 는 0~23");
  if (!inRange(s.minute, 0, 59)) errors.push("minute 는 0~59");
  if (s.kind === "weekly" && !inRange(s.weekday, 0, 6)) {
    errors.push("weekday 는 0~6(0=일요일)");
  }
  return errors;
}

/** from 이후 hour:minute 가 되는 가장 가까운 시각(당일 지났으면 addDays 만큼 이동). */
function atTime(from: Date, hour: number, minute: number): Date {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * 기준 시각 이후의 다음 실행 시각을 계산한다.
 * 경계(정확히 일치)는 "다음"으로 간주해 한 주기 뒤를 반환한다.
 */
export function nextRun(schedule: Schedule, from: Date): Date {
  if (schedule.kind === "interval") {
    return new Date(from.getTime() + schedule.everyMinutes * 60_000);
  }

  let next = atTime(from, schedule.hour, schedule.minute);
  if (next.getTime() <= from.getTime()) {
    next = new Date(next.getTime() + 24 * 3600_000);
  }

  if (schedule.kind === "weekly") {
    // 원하는 요일까지 하루씩 전진(최대 7일).
    while (next.getDay() !== schedule.weekday) {
      next = new Date(next.getTime() + 24 * 3600_000);
    }
  }
  return next;
}
