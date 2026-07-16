/**
 * 동기화 방식(Sync Mode) 정의.
 *
 * 기획서의 A~F 데이터 동기화 전략을 열거형으로 고정한다.
 * (전체/테이블 단위 덮어쓰기는 상위 오케스트레이션에서 조합한다.)
 */
export type SyncMode =
  /** C. 데이터만 덮어쓰기: TRUNCATE 후 전량 INSERT */
  | "overwrite"
  /** D. 신규 데이터만 추가: 존재하지 않는 PK 만 INSERT */
  | "insertOnly"
  /** E. 변경 데이터만 UPDATE: PK 기준 UPDATE */
  | "updateOnly"
  /** F. INSERT + UPDATE: UPSERT (ON DUPLICATE KEY UPDATE) */
  | "upsert";

/** 삭제를 유발할 수 있는 모드인지 판정한다(안전장치 경고용). */
export function mayDeleteRows(mode: SyncMode): boolean {
  // overwrite 는 TRUNCATE 로 기존 행을 제거한다.
  return mode === "overwrite";
}
