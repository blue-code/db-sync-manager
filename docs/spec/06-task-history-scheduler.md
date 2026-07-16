# 06. Task / History / Scheduler / 로깅 스펙 (Phase 4)

운영 기능 계층. 예약·모델·포맷은 순수 함수, 파일 저장만 I/O.

## 보안 원칙 (중요)

Task/History 에는 **비밀번호를 저장하지 않는다**(host/port/user/database 만).
`stripPassword` 로 접속 정보에서 PW 를 제거해 보관하고, 실행 시점에 PW 를 주입한다.
`.gitignore` 의 `connections.local.json` 과 함께 민감정보 커밋을 원천 차단한다.

## Task 추상화

`src/task/task.ts` (순수) · `src/task/taskStore.ts` (I/O)

- `Task` = { id, name, kind, origin/target(SavedConnection), table(sync 단일)/tables(dump 목록), mode, dumpMode, includeDeletes, updateColumns, schedule?, createdAt }
- `schedule?`(Scheduler 연동): 있으면 `validateTask` 가 `validateSchedule` 로 함께 검증
- `kind`: `syncCoarse` / `syncFine` / `dump` / `restore` / `backup`
- `createTask(input, now, id?)` — 시각/ID 외부 주입(재현성)
- `generateTaskId(name, date)` → `task_YYYYMMDD_slug`
- `validateTask(task)` — kind 별 필수 필드 검증(예: sync 는 origin+target+mode, syncFine 은 overwrite 금지)
- `upsertTask` / `removeTask` — 순수 목록 조작
- `TaskStore` — 단일 JSON 파일(version 1) 로드/저장

## History

`src/history/history.ts` (순수) · `src/history/historyStore.ts` (I/O)

- `HistoryEntry` = { id, at, kind, taskId?, origin?, target?, status, counts?, error? }
- `buildHistoryEntry(input, at)` — 실행 결과 → 기록(시각 주입)
- `formatHistoryLine(entry)` — `2026-07-16... syncFine prod → dev [I:5 U:2 D:0] 성공`
- `HistoryStore` — **append-only JSONL**(과거 기록 불변), `list()` 최신순, `get(id)` 재실행 조회

## Scheduler

`src/scheduler/schedule.ts` (순수)

- `Schedule`: `interval`(everyMinutes) / `daily`(hour,minute) / `weekly`(weekday,hour,minute)
- `validateSchedule(s)` — 범위 검증(hour 0~23, minute 0~59, weekday 0~6=일)
- `nextRun(schedule, from)` — 다음 실행 시각 계산. 경계 일치는 "다음 주기"로 간주
- 실제 타이머 구동은 이 계산을 소비하는 상위 런타임 몫

## 로깅

`src/logging/logger.ts`

- `formatLogLine(entry)` — 순수 포맷(SQL 은 둘째 줄에)
- `LogSink` 추상화 → `MemorySink`(테스트/미리보기), 파일/콘솔 교체 가능
- `RunLogger(sink, clock)` — start / statement(sql) / complete / error, clock 주입으로 결정론

## 전체 실행 파이프라인(누적)

```
Task 로드 → PW 주입 → Compare → (필터) → Plan/Preview → 안전장치 경고
        → (위험 시) 자동 백업 → 트랜잭션 실행(로깅) → History 기록
```
