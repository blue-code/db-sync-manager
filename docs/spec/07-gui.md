# 07. GUI (Electron) 스펙 (Phase 5)

코어 라이브러리(`src/`)를 건드리지 않고 `app/` 에 Electron 계층을 얹는다.
렌더러는 프레임워크 없이 순수 HTML/CSS/JS 로 구성한다.

## 구조

```
app/
 ├─ main.ts          Electron 메인: 창 생성 + IPC 핸들러(코어 엔진 호출)
 ├─ preload.ts       contextBridge 로 window.dbsync 최소 API 노출
 ├─ ipc.ts           채널명/요청·응답 타입(main·preload 공유 계약)
 ├─ copy-renderer.mjs 렌더러 정적 자산 → dist-app 복사
 └─ renderer/        index.html · styles.css · renderer.js (프레임워크 없음)
```

빌드: `npm run app:build`(tsc → `dist-app/`, 렌더러 복사) · 실행: `npm run app:start`

- 라이브러리 빌드(`dist/`)와 앱 빌드(`dist-app/`)는 출력 경로를 분리한다.
- `tsconfig.app.json` 은 실제 실행을 위해 `moduleResolution: NodeNext` 를 쓴다.

## 보안 경계

- `contextIsolation: true`, `nodeIntegration: false` — 렌더러는 Node 에 직접 접근 못 한다.
- 렌더러는 preload 가 노출한 `window.dbsync.{testConnection, analyze, listHistory}` 만 사용한다.
- CSP 로 외부 리소스를 차단한다(`default-src 'self'`).
- 비밀번호는 폼 → IPC 로 실 접속에만 쓰이고 저장되지 않는다.

## 메인 화면

- Origin / Target 접속 폼(Host/Port/ID/PW/Database) + 연결 테스트(한글 오류 변환)
- 상단 탭(①~⑤)으로 작업 패널 전환

### 파괴적 작업은 plan → apply 2단계 (강제)

Sync/Restore 는 반드시 **미리보기(plan)** 후에만 **실행(apply)** 할 수 있다.
plan 이 파괴적 문(TRUNCATE/DELETE/DROP)을 감지하면 위험 박스에 경고를 띄우고,
"위험을 이해했습니다" 체크 전까지 실행 버튼을 잠근다(모달 대화상자 대신 인페이지 확인).

| 패널 | plan(미리보기) | apply(실행) |
| --- | --- | --- |
| ① 비교 | `analyze` → 스키마 diff | — |
| ② 동기화 | `reviewSync`(행 검토) → `planSync`(선택분 Preview/경고) | `applySync`(위험 시 Target 테이블 자동 백업 → 트랜잭션 실행 → History) |
| ③ Dump | `buildDump` → 텍스트 미리보기/용량 | `saveDump`(저장 대화상자 → 파일 기록) |
| ④ Restore | `planRestore`(파일 선택 → 문장/경고) | `applyRestore`(스키마/데이터만 선택 → 트랜잭션 복원 → History) |
| ⑤ History | `listHistory` | — |

- 동기화 모드: upsert / insertOnly / updateOnly / overwrite, Target 전용 행 삭제 옵션
- apply 는 plan 과 동일 로직을 재계산해 실행한다(실행 시점의 최신 상태 반영).

### 행 단위 Difference Review

파인 모드(overwrite 제외)에서 "차이 검토"로 변경 대상 행을 체크박스 목록으로 본다.

- `reviewSync` → 변경 행(added/removed/modified)만 반환. modified 는 셀 변경(before → after) 표시. 표시 상한 1000행.
- 함수는 IPC 로 못 넘기므로, 렌더러는 **선택된 행 키 문자열 배열**을 넘기고 main 이
  `buildSyncPlan(diff, { select })` 로 술어를 재구성한다. 키 규칙은 main·renderer 가 동일하게 유지.
- 검토 후 plan/apply 에 `selectedKeys` 를 실어 **고른 행만** 반영한다(미검토 시 전체 적용).
- 실 MySQL 통합 테스트로 "선택 행만 반영"을 검증한다.

## 검증 상태

- `npm run app:build` 통과(tsc strict), 렌더러 복사 확인
- 스모크 기동(`DSM_SMOKE=1`)으로 main+preload+renderer+코어 로딩을 오류 없이 확인
- 실 DB 연결/비교의 화면 동작은 사용자 환경(가동 중 MySQL)에서 확인 필요

## 후속

- Task 저장/재실행, Scheduler 설정 화면
- 스키마 확장 비교(Index/FK/Trigger/View/Procedure) 결과 표시
