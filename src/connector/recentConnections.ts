/**
 * 최근 접속 이력(순수).
 *
 * 한 번 입력한 접속 정보를 기억해 다음에 다시 쓰기 위한 목록 관리.
 * 비밀번호는 절대 담지 않는다(host/port/user/database 만).
 */

export interface RecentConnection {
  host: string;
  port: number;
  user: string;
  database: string;
}

/** 접속을 식별하는 키(같은 대상은 하나로 취급). */
export function connKey(c: RecentConnection): string {
  return `${c.host}:${c.port}/${c.user}@${c.database}`;
}

/**
 * 최근 목록 맨 앞에 항목을 넣는다(같은 대상은 중복 제거 후 최신으로).
 * 최대 개수를 넘으면 오래된 것부터 버린다.
 */
export function addRecent(
  recents: RecentConnection[],
  entry: RecentConnection,
  max = 10,
): RecentConnection[] {
  const key = connKey(entry);
  const rest = recents.filter((r) => connKey(r) !== key);
  return [entry, ...rest].slice(0, max);
}
