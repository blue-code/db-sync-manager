/**
 * DbConnector 계약(포트).
 *
 * 실제 DB 접속은 이 인터페이스 뒤로 숨긴다(DDD: 도메인은 인프라를 모른다).
 * MySQL/MariaDB 구현체는 이후 track 에서 mysql2 등으로 붙인다.
 * 엔진/테스트는 이 계약에만 의존하므로 인메모리 목으로 대체 가능하다.
 */

import type {
  ConnectionConfig,
  DataRow,
  SchemaSnapshot,
} from "../domain/types.js";

export interface DbConnector {
  /** 접속 가능 여부를 확인한다(연결 테스트 버튼 대응). */
  ping(config: ConnectionConfig): Promise<boolean>;

  /** 대상 DB 의 구조 스냅샷을 읽어 온다. */
  fetchSchema(config: ConnectionConfig): Promise<SchemaSnapshot>;

  /** 특정 테이블의 데이터를 읽어 온다(WHERE/LIMIT 는 이후 확장). */
  fetchRows(config: ConnectionConfig, table: string): Promise<DataRow[]>;

  /** 생성된 SQL 문들을 하나의 트랜잭션으로 실행한다. */
  execute(config: ConnectionConfig, statements: string[]): Promise<void>;
}
