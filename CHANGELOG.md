# 변경 이력

본 프로젝트의 주요 변경을 기록한다. 형식은 Keep a Changelog 를 따른다.

## [0.2.1] - 2026-07-16

### 개선
- **연결 테스트 응답성**: 접속 8초 타임아웃 추가(접속 불가 호스트에서 무한 대기 방지),
  버튼에 진행/성공/실패 상태 반영 + 오류를 항상 표면화(조용한 무반응 제거)
- **연결 상태 배지**: Origin/Target 제목 옆에 ✓ 접속됨 / ✗ 실패 표시

### 추가
- **접속 정보 기억**: 성공한 접속을 저장(비밀번호 제외)해 다음 실행 시 자동 프리필,
  "최근 접속" 드롭다운으로 이전 접속을 골라 재사용(connections.json)

## [0.2.0] - 2026-07-16

첫 기능 완성 릴리즈. 비교 → 검토 → 실행 파이프라인의 코어 엔진과 Electron GUI,
실 DB 통합 테스트까지 갖춘다.

### 추가 (코어 엔진)
- 스키마 비교: 테이블/컬럼 + **인덱스 / 외래 키 / 뷰 / 프로시저 / 함수 / 트리거 / 이벤트**
- 데이터 비교: PK/복합 키 기준 행 diff, 변경 셀 추출
- 동기화: 코스(overwrite) + 파인(insertOnly/updateOnly/upsert), **행 단위 선택 적용**
- 필터: PK/날짜 범위, 동등, 특정 컬럼
- Dump/Restore: 스키마·데이터·특정 테이블, **뷰/루틴/트리거/이벤트 DDL**
  (SHOW CREATE·DELIMITER·DEFINER 제거), 압축 `none/gzip/zip`(자체 구현, 표준 호환)
- 객체 단위 동기화: `generateObjectSync` (added→CREATE / removed→DROP / modified→DROP+CREATE, 멱등)
- 안전장치: DROP/TRUNCATE/DELETE 경고, Preview SQL, 실행 전 자동 백업, 트랜잭션 롤백

### 추가 (운영/GUI)
- MySQL/MariaDB 커넥터(mysql2), 권한 검사(SHOW GRANTS)
- Task 저장·불러오기·삭제(비밀번호 미저장), History(append-only JSONL)
- Scheduler: interval/daily/weekly, 다음 실행 시각 계산
- **예약 자동 실행**: safeStorage 자격증명 볼트 + 1분 tick 무인 실행
- Electron GUI: 비교/동기화/Dump/Restore/History/Task 6개 패널, plan→apply 2단계,
  위험 확인 잠금, 행 단위 Difference Review

### 품질
- 유닛 161개 + 실 DB 통합 17개(임베디드 MySQL) 통과, `tsc --strict` 클린
- IPC 핸들러를 Electron 비의존 계층으로 분리해 실 DB 로 직접 검증

### 알려진 한계
- GUI 화면 인터랙션은 자동 검증 대상이 아님(로직은 실 DB 로 검증, 스모크 기동 확인)
- PostgreSQL 은 **방언 계층 기반**만 제공(전체 커넥터 미구현) — `docs/spec/08-multi-dialect.md`
- 이벤트 자동 실행 스케줄러는 앱이 열려 있는 동안만 동작
- WHERE 조건 덤프 / Oracle 미지원

[0.2.1]: https://github.com/blue-code/db-sync-manager/releases/tag/v0.2.1
[0.2.0]: https://github.com/blue-code/db-sync-manager/releases/tag/v0.2.0
