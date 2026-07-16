/**
 * 자동 파일명 생성(순수).
 *
 * 예) company_20260716.sql / backup_20260716.sql.gz
 * 시각은 재현성/테스트를 위해 외부에서 Date 를 주입받는다.
 */

export type Compression = "none" | "gzip";

/** 압축 방식에 대응하는 확장자. */
export function extensionFor(compression: Compression): string {
  return compression === "gzip" ? ".sql.gz" : ".sql";
}

/** 파일명에 쓰기 안전한 형태로 정리한다(영숫자/._- 외는 _). */
function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** YYYYMMDD (로컬 기준). */
function yyyymmdd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/**
 * 자동 덤프 파일명을 만든다.
 * @param prefix 접두어(보통 데이터베이스명 또는 "backup").
 */
export function autoDumpFilename(
  prefix: string,
  date: Date,
  compression: Compression = "none",
): string {
  return `${sanitize(prefix)}_${yyyymmdd(date)}${extensionFor(compression)}`;
}
