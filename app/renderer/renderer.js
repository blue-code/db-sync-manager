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

function escapeHtml(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// ----- 행 단위 Difference Review -----
const reviewListEl = $("#sync-review-list");
const reviewControls = $("#sync-review-controls");
let reviewActive = false; // 검토를 실행해 선택 집합이 유효한 상태인가

/** 검토 목록을 초기화한다(모드/테이블 변경 시). */
function resetReview() {
  reviewActive = false;
  reviewListEl.hidden = true;
  reviewListEl.innerHTML = "";
  reviewControls.hidden = true;
}
["#sync-mode", "#sync-table", "#sync-deletes"].forEach((sel) =>
  $(sel).addEventListener("change", resetReview),
);

function updateSelectedCount() {
  const total = reviewListEl.querySelectorAll(".rv-chk").length;
  const checked = reviewListEl.querySelectorAll(".rv-chk:checked").length;
  $("#sync-selected-count").textContent = `${checked}/${total} 선택`;
}

const STATUS_LABEL = { added: "신규", removed: "삭제", modified: "변경" };

$("#sync-review").addEventListener("click", async () => {
  const p = syncParams();
  if (!p.table) return setStatus("테이블을 선택하세요.", "err");
  if (p.mode === "overwrite") {
    resetReview();
    return setStatus("덮어쓰기 모드는 행 단위 선택이 없습니다(전체 교체).", "busy");
  }
  disarm();
  setStatus("차이 검토 중...", "busy");
  const res = await window.dbsync.reviewSync(readConn("origin"), readConn("target"), p);
  if (!res.ok) return setStatus("검토 실패: " + res.message, "err");

  if (res.rows.length === 0) {
    resetReview();
    return setStatus("변경 대상이 없습니다.", "ok");
  }

  reviewListEl.innerHTML = res.rows
    .map((r) => {
      const change =
        r.status === "modified" && r.changes
          ? r.changes
              .map((c) => `${escapeHtml(c.column)}: ${escapeHtml(c.origin)} → ${escapeHtml(c.target)}`)
              .join(", ")
          : "";
      return (
        `<label class="rv-row"><input type="checkbox" class="rv-chk" checked ` +
        `data-key="${escapeHtml(r.keyStr)}" />` +
        `<span class="tag ${r.status}">[${STATUS_LABEL[r.status]}]</span>` +
        `<span class="rv-key">${escapeHtml(r.keyLabel)}</span>` +
        (change ? `<span class="rv-change">${change}</span>` : "") +
        `</label>`
      );
    })
    .join("");

  reviewListEl.hidden = false;
  reviewControls.hidden = false;
  reviewActive = true;
  reviewListEl.querySelectorAll(".rv-chk").forEach((c) => c.addEventListener("change", updateSelectedCount));
  updateSelectedCount();

  const trunc = res.truncated ? " (표시 상한 초과, 일부만 표시)" : "";
  setStatus(`${res.message}${trunc} — 적용할 행을 선택하세요.`, "ok");
});

$("#sync-check-all").addEventListener("click", () => {
  reviewListEl.querySelectorAll(".rv-chk").forEach((c) => (c.checked = true));
  updateSelectedCount();
});
$("#sync-check-none").addEventListener("click", () => {
  reviewListEl.querySelectorAll(".rv-chk").forEach((c) => (c.checked = false));
  updateSelectedCount();
});

/** 검토를 실행했다면 선택된 키 배열을, 아니면 undefined(전체)를 돌려준다. */
function selectedKeys() {
  if (!reviewActive) return undefined;
  return Array.from(reviewListEl.querySelectorAll(".rv-chk:checked")).map((c) => c.dataset.key);
}

$("#sync-preview").addEventListener("click", async () => {
  const p = syncParams();
  if (!p.table) return setStatus("테이블을 선택하세요.", "err");
  const keys = selectedKeys();
  if (keys) p.selectedKeys = keys;
  disarm();
  setStatus("미리보기 생성 중...", "busy");
  const res = await window.dbsync.planSync(readConn("origin"), readConn("target"), p);
  if (!res.ok) return setStatus("실패: " + res.message, "err");

  const s = res.summary;
  const scope = keys ? ` (선택 ${keys.length}행)` : "";
  setStatus(`${res.message}${scope} — INSERT ${s.insert} / UPDATE ${s.update} / DELETE ${s.delete}`, "ok");
  showResult(res.preview || "(변경 없음)");
  if (res.statementCount > 0) armDanger($("#sync-apply"), res.warnings);
});

$("#sync-apply").addEventListener("click", async () => {
  const p = { ...syncParams(), backup: $("#sync-backup").checked };
  const keys = selectedKeys();
  if (keys) p.selectedKeys = keys;
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
