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

/** KEY_COLUMN_USAGE + REFERENTIAL_CONSTRAINTS 조인 결과(외래 키). */
export interface RawForeignKeyRow {
  TABLE_NAME: string;
  CONSTRAINT_NAME: string;
  COLUMN_NAME: string;
  ORDINAL_POSITION: number;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  UPDATE_RULE: string | null;
  DELETE_RULE: string | null;
}

export interface RawViewRow {
  TABLE_NAME: string;
  VIEW_DEFINITION: string | null;
}

export interface RawRoutineRow {
  ROUTINE_NAME: string;
  ROUTINE_TYPE: "PROCEDURE" | "FUNCTION";
  ROUTINE_DEFINITION: string | null;
}

export interface RawTriggerRow {
  TRIGGER_NAME: string;
  EVENT_OBJECT_TABLE: string;
  ACTION_TIMING: string;
  EVENT_MANIPULATION: string;
  ACTION_STATEMENT: string;
}

export interface RawEventRow {
  EVENT_NAME: string;
  EVENT_DEFINITION: string | null;
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

/** 외래 키(참조 동작 포함)를 조회한다. */
export const QUERY_FOREIGN_KEYS = `
  SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION,
         k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
         r.UPDATE_RULE, r.DELETE_RULE
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
  JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION
`;

/** 뷰 정의를 조회한다. */
export const QUERY_VIEWS = `
  SELECT TABLE_NAME, VIEW_DEFINITION
  FROM INFORMATION_SCHEMA.VIEWS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME
`;

/** 저장 루틴(프로시저/함수)을 조회한다. */
export const QUERY_ROUTINES = `
  SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION
  FROM INFORMATION_SCHEMA.ROUTINES
  WHERE ROUTINE_SCHEMA = ?
  ORDER BY ROUTINE_NAME
`;

/** 트리거를 조회한다. */
export const QUERY_TRIGGERS = `
  SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
  FROM INFORMATION_SCHEMA.TRIGGERS
  WHERE TRIGGER_SCHEMA = ?
  ORDER BY TRIGGER_NAME
`;

/** 이벤트를 조회한다. */
export const QUERY_EVENTS = `
  SELECT EVENT_NAME, EVENT_DEFINITION
  FROM INFORMATION_SCHEMA.EVENTS
  WHERE EVENT_SCHEMA = ?
  ORDER BY EVENT_NAME
`;
