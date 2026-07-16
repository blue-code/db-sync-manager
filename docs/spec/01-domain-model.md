# 01. 도메인 모델

구현: `src/domain/types.ts`, `src/domain/diff.ts`

## 스냅샷 모델

비교의 입력 단위는 `SchemaSnapshot` 이다. 커넥터가 `INFORMATION_SCHEMA` 를 정규화해 생성한다.

```
SchemaSnapshot
 ├─ database: string
 └─ tables: TableDef[]
      ├─ name, engine?, charset?
      ├─ columns: ColumnDef[]   (name, dataType, nullable, default, autoIncrement, position)
      ├─ primaryKey: string[]
      └─ indexes: IndexDef[]    (name, unique, columns[])
```

- `dataType` 는 `"varchar(100)"`, `"int"` 처럼 **정규화된 문자열**로 보관한다(방언 차이 흡수).
- PK 는 `primaryKey` 배열과 `indexes` 의 `PRIMARY` 항목으로 이중 표현한다.

## 차이 모델

```
SchemaDiff
 ├─ origin, target: string
 └─ tables: TableDiff[]
      ├─ name
      ├─ status: identical | added | removed | modified
      └─ columns: ColumnDiff[]
           ├─ name
           ├─ status
           └─ changes: FieldChange[]   (field, origin, target)
```

## 상태 표기 규약

기획서 표기와 1:1 대응한다. **added/removed 는 항상 Origin 기준**이다.

| 상태 | 표기 | 의미 |
| --- | --- | --- |
| identical | `[=]` | 동일 |
| added | `[+]` | Origin 에만 존재 → Target 에 생성 필요 |
| removed | `[-]` | Target 에만 존재 → Target 에서 제거(옵션) |
| modified | `[*]` | 구조/속성 상이 |

`isSchemaIdentical(diff)` 로 전체 동일 여부를 판정한다.
