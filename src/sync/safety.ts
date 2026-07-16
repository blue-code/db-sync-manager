/**
 * 안전장치(순수).
 *
 * 실행 직전, 생성된 SQL/계획에서 파괴적 작업을 탐지해 경고를 만든다.
 * 기획의 "⚠ DELETE가 발생합니다. 계속하시겠습니까?" 흐름의 근거가 된다.
 */

import type { SyncPlan } from "./syncPlanner.js";

export type Severity = "info" | "warning" | "danger";

export interface SafetyWarning {
  severity: Severity;
  code: string;
  message: string;
  /** 해당 작업의 건수(있으면). */
  count?: number;
}

/** 파괴적 문(선두 키워드)과 등급/문구 매핑. */
const DESTRUCTIVE: Array<{ re: RegExp; code: string; label: string }> = [
  { re: /^\s*DROP\s+(TABLE|DATABASE)/i, code: "DROP", label: "DROP" },
  { re: /^\s*TRUNCATE\b/i, code: "TRUNCATE", label: "TRUNCATE" },
  { re: /^\s*DELETE\s+FROM/i, code: "DELETE", label: "DELETE" },
];

/** SQL 문 배열을 훑어 파괴적 작업 경고를 만든다. */
export function analyzeStatements(statements: string[]): SafetyWarning[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const sql of statements) {
    for (const d of DESTRUCTIVE) {
      if (d.re.test(sql)) {
        const cur = counts.get(d.code) ?? { label: d.label, n: 0 };
        cur.n += 1;
        counts.set(d.code, cur);
        break;
      }
    }
  }

  return [...counts.entries()].map(([code, { label, n }]) => ({
    severity: "danger" as const,
    code,
    count: n,
    message: `⚠ ${label} 작업이 ${n}건 발생합니다. 계속하시겠습니까?`,
  }));
}

/** 동기화 계획에서 경고를 만든다(DELETE 포함 여부 등). */
export function analyzePlan(plan: SyncPlan): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  if (plan.summary.delete > 0) {
    warnings.push({
      severity: "danger",
      code: "DELETE",
      count: plan.summary.delete,
      message: `⚠ DELETE 가 ${plan.summary.delete}건 발생합니다. 계속하시겠습니까?`,
    });
  }
  return warnings;
}

/** 하나라도 danger 경고가 있으면 사용자 확인이 필요하다. */
export function confirmationRequired(warnings: SafetyWarning[]): boolean {
  return warnings.some((w) => w.severity === "danger");
}

/** 실행 전 미리보기 텍스트(복사/저장 가능). */
export function previewSql(statements: string[]): string {
  return statements.join("\n");
}
