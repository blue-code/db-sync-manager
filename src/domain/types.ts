/**
 * 도메인 핵심 타입 정의 (SDD: 구현 이전에 계약을 먼저 확정한다).
 *
 * 이 파일은 Compare/Sync 엔진이 공유하는 "언어"다.
 * 커넥터(실제 DB 접속)는 이 스냅샷 형태로 스키마/데이터를 뽑아 오고,
 * 엔진은 커넥터 구현을 몰라도 순수하게 비교·계획·SQL 생성을 수행한다.
 */

/** DB 접속 정보. PW는 로그/직렬화 시 마스킹 대상이다. */
export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /**
   * SSL 접속 사용 여부. true 면 SSL 로 접속하되 서버 인증서를 검증하지 않는다
   * (mariadb 클라이언트의 `--ssl --ssl-verify-server-cert=0` 과 동일).
   */
  ssl?: boolean;
}

/** 지원 DB 종류. 방언(dialect) 분기의 기준점이 된다. */
export type DbEngine = "mysql" | "mariadb";

/** 컬럼 정의. INFORMATION_SCHEMA.COLUMNS 를 정규화한 형태다. */
export interface ColumnDef {
  name: string;
  /** 정규화된 타입 문자열. 예: "varchar(100)", "int", "datetime" */
  dataType: string;
  nullable: boolean;
  /** 기본값. 없으면 null. 문자열/표현식 모두 문자열로 보관한다. */
  default: string | null;
  autoIncrement: boolean;
  /** 컬럼 순서 (ORDINAL_POSITION). 1부터 시작. */
  position: number;
  comment?: string;
}

/** 인덱스 정의. PK도 name="PRIMARY" 인 인덱스로 표현한다. */
export interface IndexDef {
  name: string;
  unique: boolean;
  /** 인덱스를 구성하는 컬럼명 (순서 유지). */
  columns: string[];
}

/** 외래 키 정의. */
export interface ForeignKeyDef {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onUpdate?: string;
  onDelete?: string;
}

/** 테이블 정의(구조). 데이터는 별도 DataRow 로 다룬다. */
export interface TableDef {
  name: string;
  columns: ColumnDef[];
  /** PK 구성 컬럼명. PK가 없으면 빈 배열. */
  primaryKey: string[];
  indexes: IndexDef[];
  /** 외래 키(선택). 미수집 시 생략. */
  foreignKeys?: ForeignKeyDef[];
  engine?: string;
  charset?: string;
}

/** 뷰 정의. */
export interface ViewDef {
  name: string;
  definition: string;
}

/** 저장 루틴(프로시저/함수) 정의. */
export interface RoutineDef {
  name: string;
  type: "PROCEDURE" | "FUNCTION";
  /** 본문(비교용). INFORMATION_SCHEMA.ROUTINE_DEFINITION 기준. */
  definition: string;
  /** 파라미터/반환까지 포함한 전체 CREATE 문(덤프용, SHOW CREATE 로 수집). */
  createStatement?: string;
}

/** 트리거 정의. */
export interface TriggerDef {
  name: string;
  table: string;
  timing: string;
  event: string;
  statement: string;
}

/** 이벤트 정의. */
export interface EventDef {
  name: string;
  /** 본문(비교용). INFORMATION_SCHEMA.EVENT_DEFINITION 기준. */
  definition: string;
  /** 스케줄까지 포함한 전체 CREATE 문(덤프용, SHOW CREATE 로 수집). */
  createStatement?: string;
}

/** 데이터베이스 전체 스키마 스냅샷. 비교의 입력 단위다. */
export interface SchemaSnapshot {
  database: string;
  tables: TableDef[];
  /** DB 레벨 객체(선택). 미수집 시 생략. */
  views?: ViewDef[];
  routines?: RoutineDef[];
  triggers?: TriggerDef[];
  events?: EventDef[];
}

/** 한 행의 데이터. 컬럼명 → 값 매핑. */
export type DataRow = Record<string, unknown>;
