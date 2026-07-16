# 04. 데이터 비교 & 동기화 계획 스펙 (Phase 2)

`비교 → 검토 → 실행` 파이프라인의 "데이터" 축을 담당한다. 전 과정 순수 함수다.

```
fetchRows(Origin) ─┐
                   ├─► compareData ─► DataDiff ─► buildSyncPlan ─► SyncPlan ─► generatePlanSql ─► SQL[]
fetchRows(Target) ─┘        ▲                          ▲
                        keyColumns                select(적용/제외)·필터
```

## Data Compare

구현: `src/compare/dataCompare.ts` · 테스트: `test/dataCompare.test.ts`

`compareData(table, originRows, targetRows, keyColumns)` → `DataDiff`

- 키 기준: PK / Unique / 사용자 지정 컬럼(복합 키 지원)
- 상태: `added`(Origin에만·초록) / `removed`(Target에만·빨강) / `modified`(키 동일·값 상이·노랑) / `identical`
- `modified` 는 변경된 셀만 `changes`(column, origin, target)에 담는다
- 안전장치: 한쪽에 중복 키가 있으면 예외(무결성 오류)
- 결정론: 결과 행은 키 기준 정렬

## 필터

구현: `src/sync/filters.ts` · 테스트: `test/filters.test.ts`

비교/동기화 범위를 좁히는 조합 가능한 술어.

| 함수 | 대응 기획 | 비고 |
| --- | --- | --- |
| `rangeFilter(col, {min,max})` | PK 범위 / 숫자 범위 | 경계 포함 |
| `dateRangeFilter(col, {from,to})` | 날짜 범위 | 시간값 비교 |
| `equalsFilter(col, v)` | `status='READY'` 등 | |
| `and(...)` | 복합 조건 | AND 결합 |
| `pickColumns(rows, cols, keyCols)` | 특정 컬럼만 동기화 | 키는 항상 유지 |

> 대용량은 커넥터의 SQL `WHERE` 선필터가 원칙. 이 모듈은 소규모 대조/보조용이다.

## Sync Planner

구현: `src/sync/syncPlanner.ts` · 테스트: `test/syncPlanner.test.ts`

`buildSyncPlan(diff, options)` → `SyncPlan`

- 모드별 포함 규칙
  - `insertOnly` → added 를 INSERT
  - `updateOnly` → modified 를 UPDATE
  - `upsert` → added INSERT + modified UPDATE
  - `overwrite` → 파인 경로 미지원(테이블 전체 코스 경로 `generateSyncSql` 사용)
- `includeDeletes: true` → removed 를 DELETE 로 추가, `destructive=true`(안전장치 경고 근거)
- `select(row)` → Difference Review 의 적용/제외. 통과한 행만 계획에 포함
- `summary` = { insert, update, delete } 건수

`generatePlanSql(plan, table, updateColumns?)` → `string[]`

- 순서: INSERT → UPDATE → DELETE (added/removed 키가 서로소라 충돌 없음)
- `updateColumns` 로 UPDATE 갱신 컬럼 제한(특정 컬럼만 동기화)

## 두 가지 동기화 경로 정리

| 경로 | 진입점 | 용도 |
| --- | --- | --- |
| 코스(coarse) | `generateSyncSql({table, rows, mode})` | 테이블 전체를 한 모드로(overwrite 포함) |
| 파인(fine) | `compareData` → `buildSyncPlan` → `generatePlanSql` | diff 검토 후 선택 항목만 적용 |
