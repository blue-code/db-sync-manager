/**
 * 권한 검사(순수).
 *
 * `SHOW GRANTS` 결과(문자열 배열)를 파싱해 보유 권한 집합을 만들고,
 * Sync Mode 실행에 필요한 권한과 대조해 부족분을 계산한다.
 * 실제 실행 전에 "권한 부족 경고"를 띄우기 위한 근거를 제공한다.
 */

import type { SyncMode } from "../sync/syncMode.js";

export type Privilege =
  | "SELECT"
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "CREATE"
  | "DROP"
  | "ALTER";

const ALL = "ALL PRIVILEGES";

/**
 * SHOW GRANTS 라인들에서 보유 권한을 추출한다.
 * 예) "GRANT SELECT, INSERT ON `db`.* TO `u`@`%`" → {SELECT, INSERT}
 *     "GRANT ALL PRIVILEGES ON *.* TO ..."        → {ALL PRIVILEGES}
 */
export function parseGrants(lines: string[]): Set<string> {
  const granted = new Set<string>();
  for (const line of lines) {
    const m = /GRANT\s+(.+?)\s+ON\s+/i.exec(line);
    if (!m) continue;
    for (const priv of m[1]!.split(",")) {
      granted.add(priv.trim().toUpperCase());
    }
  }
  return granted;
}

/** 보유 권한 집합이 특정 권한을 포함하는지(ALL PRIVILEGES 는 전부 포함). */
export function hasPrivilege(granted: Set<string>, priv: Privilege): boolean {
  return granted.has(ALL) || granted.has(priv);
}

/** Sync Mode 실행에 필요한 권한 목록. */
export function requiredPrivilegesForMode(mode: SyncMode): Privilege[] {
  switch (mode) {
    case "overwrite":
      // TRUNCATE 는 DROP 권한을 요구한다. 이어지는 INSERT 도 필요.
      return ["DROP", "INSERT"];
    case "insertOnly":
      return ["INSERT"];
    case "updateOnly":
      return ["UPDATE"];
    case "upsert":
      return ["INSERT", "UPDATE"];
  }
}

export interface PrivilegeCheck {
  ok: boolean;
  missing: Privilege[];
}

/** 보유 권한 대비 필요한 권한의 부족분을 계산한다. */
export function checkPrivileges(
  granted: Set<string>,
  required: Privilege[],
): PrivilegeCheck {
  const missing = required.filter((p) => !hasPrivilege(granted, p));
  return { ok: missing.length === 0, missing };
}
