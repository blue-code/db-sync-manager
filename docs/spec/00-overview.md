# 00. 개요 및 3단계 파이프라인

## 목적

MySQL/MariaDB 두 데이터베이스(Origin/Target) 사이의 **구조·데이터 차이를 계산**하고,
사용자가 **차이를 검토**한 뒤, 선택한 항목만 **안전하게 동기화**한다.

지원 시나리오:

- 직접 DB 연결 / Dump 파일 / Dump → DB / DB → Dump / DB ↔ DB

## 3단계 파이프라인

모든 동기화 작업은 다음 순서를 강제한다.

```
(1) Analyze  비교      두 스냅샷의 구조/데이터 차이(Diff)를 계산
      ↓
(2) Review   검토      차이 목록에서 적용할 항목을 선택, 미리보기 SQL 확인
      ↓
(3) Execute  실행      트랜잭션으로 실행. 실패 시 롤백, 위험 작업은 사전 백업
```

이 파이프라인을 관통하는 데이터 흐름:

```
Connector.fetchSchema ─┐
                       ├─► compareSchema ─► SchemaDiff ─► (사용자 선택)
Connector.fetchSchema ─┘                                      │
                                                              ▼
Connector.fetchRows ─► generateSyncSql(mode) ─► SQL[] ─► Preview ─► Connector.execute
```

## 작업(Task) 추상화 방향

"전체 덤프 후 복원", "users 데이터만 추가", "email 컬럼만 동기화" 등을
모두 하나의 **Task** 로 저장·재실행할 수 있도록 설계한다(로드맵 참조).
Task = { 접속 대상, 비교 범위, Sync Mode, 필터(WHERE/PK 범위/컬럼), 안전 옵션 }.

## 설계 불변식(Invariant)

1. Compare/Sync 엔진은 **I/O 를 하지 않는다**. 입력은 스냅샷/행 배열, 출력은 Diff/SQL 문자열.
2. 출력은 **결정론적**이다(정렬 고정). 동일 입력 → 동일 결과.
3. 파괴적 작업(TRUNCATE/DELETE/DROP)은 **명시적 플래그·경고** 없이는 생성하지 않는다.
