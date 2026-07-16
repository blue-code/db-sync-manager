// 렌더러 로직 — window.dbsync(preload 브리지)만 사용한다.
// Node/Electron 직접 접근 없음(contextIsolation).

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const statusEl = $("#status");
const resultEl = $("#result");
const dangerBox = $("#danger-box");
const dangerMsg = $("#danger-msg");
const dangerAck = $("#danger-ack");

/** 파괴적 작업의 "실행 대기" 상태. 위험 확인 체크와 실행 버튼을 연동한다. */
let pending = null; // { applyBtn, destructive }

function readConn(role) {
  const form = document.querySelector(`.conn-card[data-role="${role}"]`);
  const get = (name) => form.querySelector(`[name="${name}"]`).value.trim();
  return {
    host: get("host"),
    port: Number(get("port")) || 3306,
    user: get("user"),
    password: get("password"),
    database: get("database"),
  };
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function showResult(text) {
  resultEl.textContent = text;
}

/** 안전장치 경고를 위험 박스에 표시하고 실행 잠금을 건다. */
function armDanger(applyBtn, warnings) {
  const hasDanger = warnings && warnings.length > 0;
  if (hasDanger) {
    dangerMsg.textContent = warnings.map((w) => w.message).join("\n");
    dangerBox.hidden = false;
    dangerAck.checked = false;
    applyBtn.disabled = true; // 확인 체크 전까지 잠금
  } else {
    dangerBox.hidden = true;
    applyBtn.disabled = false;
  }
  pending = { applyBtn, destructive: hasDanger };
}

function disarm() {
  dangerBox.hidden = true;
  if (pending) pending.applyBtn.disabled = true;
  pending = null;
}

dangerAck.addEventListener("change", () => {
  if (pending && pending.destructive) pending.applyBtn.disabled = !dangerAck.checked;
});

// ----- 패널 전환 -----
function showPanel(name) {
  $$(".panel").forEach((p) => (p.hidden = p.dataset.panel !== name));
  $$(".actions .tab").forEach((b) => b.classList.toggle("primary", b.dataset.panel === name));
  disarm();
  setStatus("");
  showResult("");
}
$$(".actions .tab").forEach((b) => b.addEventListener("click", () => showPanel(b.dataset.panel)));

// ----- 연결 테스트 -----
$$(".conn-card .test").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const role = btn.dataset.target;
    setStatus(`${role} 접속 확인 중...`, "busy");
    const res = await window.dbsync.testConnection(readConn(role));
    setStatus(`${role}: ${res.message}`, res.ok ? "ok" : "err");
  }),
);

// ----- ① 비교 -----
const TAG = {
  identical: ["[=]", "동일"],
  added: ["[+]", "신규"],
  removed: ["[-]", "삭제"],
  modified: ["[*]", "변경"],
};
function renderDiff(diff) {
  const lines = diff.tables.map((t) => {
    const [mark, label] = TAG[t.status];
    const cols =
      t.status === "modified"
        ? t.columns
            .filter((c) => c.status !== "identical")
            .map((c) => `    ${TAG[c.status][0]} ${c.name}`)
            .join("\n")
        : "";
    return `${mark} ${t.table} (${label})` + (cols ? "\n" + cols : "");
  });
  showResult(`${diff.origin} ↔ ${diff.target}\n\n` + lines.join("\n"));
}
$("#run-analyze").addEventListener("click", async () => {
  setStatus("스키마 비교 중...", "busy");
  showResult("");
  const res = await window.dbsync.analyze(readConn("origin"), readConn("target"));
  if (!res.ok) return setStatus("비교 실패: " + res.message, "err");
  setStatus("비교 완료", "ok");
  renderDiff(res.diff);
});

// ----- ② 동기화 -----
$("#sync-load-tables").addEventListener("click", async () => {
  setStatus("테이블 로드 중...", "busy");
  const res = await window.dbsync.listTables(readConn("target"));
  if (!res.ok) return setStatus("로드 실패: " + res.message, "err");
  const sel = $("#sync-table");
  sel.innerHTML = res.tables
    .map((t) => `<option value="${t.name}">${t.name}${t.primaryKey.length ? "" : " (PK 없음)"}</option>`)
    .join("");
  setStatus(`Target: ${res.message}`, "ok");
});

function syncParams() {
  return {
    table: $("#sync-table").value,
    mode: $("#sync-mode").value,
    includeDeletes: $("#sync-deletes").checked,
  };
}

$("#sync-preview").addEventListener("click", async () => {
  const p = syncParams();
  if (!p.table) return setStatus("테이블을 선택하세요.", "err");
  disarm();
  setStatus("미리보기 생성 중...", "busy");
  const res = await window.dbsync.planSync(readConn("origin"), readConn("target"), p);
  if (!res.ok) return setStatus("실패: " + res.message, "err");

  const s = res.summary;
  setStatus(`${res.message} — INSERT ${s.insert} / UPDATE ${s.update} / DELETE ${s.delete}`, "ok");
  showResult(res.preview || "(변경 없음)");
  if (res.statementCount > 0) armDanger($("#sync-apply"), res.warnings);
});

$("#sync-apply").addEventListener("click", async () => {
  const p = { ...syncParams(), backup: $("#sync-backup").checked };
  setStatus("동기화 실행 중...", "busy");
  const res = await window.dbsync.applySync(readConn("origin"), readConn("target"), p);
  disarm();
  if (!res.ok) return setStatus("실행 실패: " + res.message, "err");
  const bak = res.backupPath ? `\n백업: ${res.backupPath}` : "";
  setStatus(res.message, "ok");
  showResult(res.message + bak);
});

// ----- ③ Dump -----
function dumpParams() {
  const tables = $("#dump-tables").value.split(",").map((s) => s.trim()).filter(Boolean);
  const p = { mode: $("#dump-mode").value, compression: $("#dump-compression").value };
  if (tables.length) p.tables = tables;
  return p;
}
$("#dump-preview").addEventListener("click", async () => {
  setStatus("덤프 생성 중...", "busy");
  const res = await window.dbsync.buildDump(readConn("origin"), dumpParams());
  if (!res.ok) return setStatus("실패: " + res.message, "err");
  setStatus(`${res.message} (${res.byteLength.toLocaleString()} bytes)`, "ok");
  showResult(res.preview);
});
$("#dump-save").addEventListener("click", async () => {
  setStatus("저장 대화상자...", "busy");
  const res = await window.dbsync.saveDump(readConn("origin"), dumpParams());
  setStatus(res.message, res.ok ? "ok" : "err");
  if (res.ok) showResult("저장 경로: " + res.filePath);
});

// ----- ④ Restore -----
let restoreFile = null;
$("#restore-pick").addEventListener("click", async () => {
  disarm();
  setStatus("파일 선택...", "busy");
  const res = await window.dbsync.planRestore();
  if (!res.ok) {
    restoreFile = null;
    $("#restore-file").textContent = "선택된 파일 없음";
    return setStatus(res.message, "err");
  }
  restoreFile = res.filePath;
  $("#restore-file").textContent = res.filePath;
  setStatus(`${res.message} 로드됨`, "ok");
  showResult(res.preview);
  if (res.statementCount > 0) armDanger($("#restore-apply"), res.warnings);
});
$("#restore-apply").addEventListener("click", async () => {
  if (!restoreFile) return setStatus("먼저 덤프 파일을 선택하세요.", "err");
  const scope = document.querySelector('input[name="restore-scope"]:checked').value;
  const params = {
    filePath: restoreFile,
    schemaOnly: scope === "schema",
    dataOnly: scope === "data",
  };
  setStatus("복원 실행 중...", "busy");
  const res = await window.dbsync.applyRestore(readConn("target"), params);
  disarm();
  setStatus(res.message, res.ok ? "ok" : "err");
});

// ----- ⑤ History -----
$("#history-load").addEventListener("click", async () => {
  setStatus("기록 로드 중...", "busy");
  const entries = await window.dbsync.listHistory();
  setStatus(`History ${entries.length}건`, "ok");
  showResult(
    entries.length
      ? entries.map((e) => `${e.at}  ${e.kind}  ${e.status}${e.error ? "  " + e.error : ""}`).join("\n")
      : "기록이 없습니다.",
  );
});

showPanel("analyze");
