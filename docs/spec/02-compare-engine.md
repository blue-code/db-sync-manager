# 02. Compare 엔진 스펙

구현: `src/compare/schemaCompare.ts` · 테스트: `test/schemaCompare.test.ts`

## compareSchema(origin, target) → SchemaDiff

두 스냅샷의 구조 차이를 계산하는 순수 함수.

### 판정 규칙

- 테이블
  - Origin 에만 존재 → `added`
  - Target 에만 존재 → `removed`
  - 양쪽 존재 → 컬럼 비교 결과가 모두 identical 이면 `identical`, 아니면 `modified`
- 컬럼
  - Origin 에만 → `added` / Target 에만 → `removed`
  - 양쪽 존재 → 비교 대상 속성이 하나라도 다르면 `modified`(변경 필드를 `changes` 에 기록), 아니면 `identical`

### 컬럼 비교 대상 속성

`dataType`, `nullable`, `default`, `autoIncrement`

> 인덱스/FK/트리거/뷰/프로시저 비교는 후속 track 에서 확장한다(로드맵).

### 결정론

테이블·컬럼 결과는 이름 기준(`localeCompare`)으로 정렬한다. 입력 순서와 무관하게 동일 출력.

## 데이터 비교(예정)

`Data Compare` 는 PK/Unique/사용자 지정 컬럼을 키로 삼아 행 단위 차이를 계산한다.

- 신규(초록) / 삭제(빨강) / 변경(노랑)
- 출력은 `INSERT/UPDATE/DELETE` 건수 요약 + 행별 상세(키, 필드 before/after)

이 결과가 Sync 엔진의 입력(적용 대상 행 집합)이 된다.
