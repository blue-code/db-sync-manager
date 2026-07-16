// 렌더러 로직 — window.dbsync(preload 브리지)만 사용한다.
// Node/Electron 직접 접근 없음(contextIsolation).

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const resultEl = $("#result");

/** 폼(data-role)에서 접속 정보를 읽는다. */
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

/** 상태 표기와 색상 태그 매핑. */
const TAG = {
  identical: ["[=]", "동일"],
  added: ["[+]", "신규"],
  removed: ["[-]", "삭제"],
  modified: ["[*]", "변경"],
};

/** SchemaDiff 를 사람이 읽는 목록으로 렌더링한다. */
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
    return (
      `<span class="tag ${t.status}">${mark}</span>${t.table} (${label})` +
      (cols ? "\n" + cols : "")
    );
  });
  resultEl.innerHTML = `${diff.origin} ↔ ${diff.target}\n\n` + lines.join("\n");
}

async function testConnection(role) {
  setStatus(`${role} 접속 확인 중...`, "busy");
  const res = await window.dbsync.testConnection(readConn(role));
  setStatus(`${role}: ${res.message}`, res.ok ? "ok" : "err");
}

async function analyze() {
  setStatus("스키마 비교 중...", "busy");
  resultEl.textContent = "";
  const res = await window.dbsync.analyze(readConn("origin"), readConn("target"));
  if (!res.ok) {
    setStatus("비교 실패: " + res.message, "err");
    return;
  }
  setStatus("비교 완료", "ok");
  renderDiff(res.diff);
}

async function showHistory() {
  setStatus("기록 로드 중...", "busy");
  const entries = await window.dbsync.listHistory();
  setStatus(`History ${entries.length}건`, "ok");
  resultEl.textContent = entries.length
    ? entries
        .map((e) => `${e.at}  ${e.kind}  ${e.status}`)
        .join("\n")
    : "기록이 없습니다.";
}

$("#btn-test-origin").addEventListener("click", () => testConnection("origin"));
$("#btn-test-target").addEventListener("click", () => testConnection("target"));
$("#btn-analyze").addEventListener("click", analyze);
$("#btn-history").addEventListener("click", showHistory);
