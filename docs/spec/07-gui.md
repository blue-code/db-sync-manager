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

- Origin / Target 접속 폼(Host/Port/ID/PW/Database)
- 연결 테스트(Origin/Target) — `MysqlConnector.ping`, 실패는 한글 메시지로 변환
- ① 비교(Analyze) — 양쪽 스키마를 읽어 `compareSchema` → 상태 표기([=]/[+]/[-]/[*]) 렌더링
- ⑤ History — `HistoryStore`(userData) 목록
- ② Sync / ③ Dump / ④ Restore — 버튼 배치(파괴적 작업이라 GUI 결선은 후속)

## 검증 상태

- `npm run app:build` 통과(tsc strict), 렌더러 복사 확인
- 스모크 기동(`DSM_SMOKE=1`)으로 main+preload+renderer+코어 로딩을 오류 없이 확인
- 실 DB 연결/비교의 화면 동작은 사용자 환경(가동 중 MySQL)에서 확인 필요

## 후속

- Sync/Dump/Restore 화면 결선(안전장치·Preview·자동 백업 흐름 반영)
- Difference Review(적용/제외 체크) UI, Task 저장/재실행, Scheduler 설정 화면
- 스키마 확장 비교(Index/FK/Trigger/View/Procedure) 결과 표시
