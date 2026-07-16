/**
 * INFORMATION_SCHEMA 조회 계약.
 *
 * 스키마 스냅샷을 만들기 위해 읽어 오는 원시 행(raw row)의 형태와
 * 표준 조회 쿼리를 한곳에 모은다. 매핑 로직(schemaMapper)은 이 타입에만
 * 의존하므로, 실제 드라이버 없이 목 데이터로 테스트할 수 있다.
 */

/** INFORMATION_SCHEMA.COLUMNS 원시 행. */
export interface RawColumnRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  /** "varchar(100)" 처럼 길이/부호까지 포함된 전체 타입. */
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | null;
  /** "auto_increment" 등이 들어온다. */
  EXTRA: string;
  ORDINAL_POSITION: number;
  COLUMN_COMMENT: string;
}

/** INFORMATION_SCHEMA.STATISTICS 원시 행(인덱스/PK). */
export interface RawIndexRow {
  TABLE_NAME: string;
  INDEX_NAME: string;
  /** 0 이면 UNIQUE, 1 이면 비유니크. */
  NON_UNIQUE: number;
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
}

/** INFORMATION_SCHEMA.TABLES 원시 행. */
export interface RawTableRow {
  TABLE_NAME: string;
  ENGINE: string | null;
  TABLE_COLLATION: string | null;
}

/** 대상 스키마의 컬럼을 순서대로 조회한다. */
export const QUERY_COLUMNS = `
  SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
         COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION, COLUMN_COMMENT
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, ORDINAL_POSITION
`;

/** 대상 스키마의 인덱스를 순서대로 조회한다. */
export const QUERY_INDEXES = `
  SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

/** 대상 스키마의 테이블 메타(엔진/콜레이션)를 조회한다. */
export const QUERY_TABLES = `
  SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
  ORDER BY TABLE_NAME
`;
