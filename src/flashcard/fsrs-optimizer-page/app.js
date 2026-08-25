const query = new URLSearchParams(location.search);
const token = query.get("token");
const elements = {
  version: document.querySelector("#version"), records: document.querySelector("#records"),
  cards: document.querySelector("#cards"), isolation: document.querySelector("#isolation"),
  range: document.querySelector("#range"),
  summary: document.querySelector("#summary"), threads: document.querySelector("#threads"),
  progress: document.querySelector(".progress-track"), progressBar: document.querySelector("#progress-bar"),
  phase: document.querySelector("#phase"), progressText: document.querySelector("#progress-text"),
  start: document.querySelector("#start"), copy: document.querySelector("#copy"), error: document.querySelector("#error"),
  result: document.querySelector("#result"), duration: document.querySelector("#duration"), weights: document.querySelector("#weights"),
};

let dataset;
let trainedWeights = [];
let progressTimer;

function setProgress(processed, total, label = "训练中") {
  const percent = total > 0 ? Math.min(100, Math.round(processed / total * 100)) : 0;
  elements.progressBar.style.width = `${percent}%`;
  elements.progress.setAttribute("aria-valuenow", String(percent));
  elements.phase.textContent = label;
  elements.progressText.textContent = total > 0 ? `${processed} / ${total} · ${percent}%` : `${percent}%`;
}

async function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.phase.textContent = "训练失败";
  elements.start.disabled = false;
  try {
    await fetch(`/api/error?token=${encodeURIComponent(token ?? "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
    });
  } catch {}
}

async function loadSession() {
  if (!token) throw new Error("缺少 DAMO 训练会话令牌");
  elements.isolation.textContent = crossOriginIsolated && typeof SharedArrayBuffer !== "undefined" ? "可用" : "不可用";
  if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    throw new Error("浏览器未启用多线程隔离环境，请确认通过 DAMO 本地端口打开");
  }
  const response = await fetch(`/api/session?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`读取训练会话失败：HTTP ${response.status}`);
  dataset = await response.json();
  if (dataset.optimizerVersion !== "2.0.4" || dataset.parameterCount !== 19) {
    throw new Error("当前训练会话与 FSRS 2.0.4 的 19 参数协议不兼容");
  }
  elements.version.textContent = `fsrs-browser ${dataset.optimizerVersion}`;
  elements.records.textContent = dataset.sourceRecordCount.toLocaleString("zh-CN");
  elements.cards.textContent = dataset.cardCount.toLocaleString("zh-CN");
  elements.summary.textContent = `已载入 ${dataset.sourceRecordCount.toLocaleString("zh-CN")} 条记录，训练完成后结果将自动返回思源`;
  const formatRange = (timestamp) => timestamp ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)) : "暂无";
  elements.range.textContent = `当前范围：${formatRange(dataset.firstReviewedAt)} 至 ${formatRange(dataset.lastReviewedAt)}`;
  elements.threads.value = String(Math.min(32, Math.max(1, navigator.hardwareConcurrency || 4)));
  elements.start.disabled = false;
  elements.phase.textContent = "可以开始";
}

async function startTraining() {
  elements.start.disabled = true;
  elements.error.hidden = true;
  elements.result.hidden = true;
  const threads = Math.min(32, Math.max(1, Number(elements.threads.value) || 1));
  const worker = new Worker("./train-worker.js", { type: "module" });
  worker.onmessage = async ({ data }) => {
    if (data.type === "progress") {
      clearInterval(progressTimer);
      const view = new Uint32Array(data.buffer, data.pointer, 2);
      progressTimer = setInterval(() => setProgress(view[0], view[1]), 150);
      return;
    }
    if (data.type === "error") {
      clearInterval(progressTimer);
      worker.terminate();
      await reportError(data.message);
      return;
    }
    if (data.type !== "result") return;
    clearInterval(progressTimer);
    worker.terminate();
    trainedWeights = data.weights;
    if (!Array.isArray(trainedWeights) || trainedWeights.length !== 19 || trainedWeights.some((value) => !Number.isFinite(value))) {
      await reportError("优化器没有返回有效的 19 项参数");
      return;
    }
    setProgress(1, 1, "训练完成");
    const result = {
      schema: 1,
      optimizerVersion: "2.0.4",
      parameterCount: 19,
      weights: trainedWeights,
      durationMs: data.durationMs,
      sourceRecordCount: dataset.sourceRecordCount,
      cardCount: dataset.cardCount,
    };
    const response = await fetch(`/api/result?token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      await reportError(failure.error || `DAMO 拒绝训练结果：HTTP ${response.status}`);
      return;
    }
    elements.weights.replaceChildren(...trainedWeights.map((weight, index) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `w${index}`;
      const value = document.createElement("strong");
      value.textContent = String(Number(weight.toPrecision(8)));
      item.append(label, value);
      return item;
    }));
    elements.duration.textContent = `${(data.durationMs / 1000).toFixed(1)} 秒`;
    elements.result.hidden = false;
    elements.copy.hidden = false;
    elements.start.textContent = "已完成";
  };
  worker.onerror = (event) => void reportError(event.message || "训练 Worker 启动失败");
  elements.phase.textContent = "正在初始化多线程 WASM";
  worker.postMessage({ dataset, threads });
}

elements.start.addEventListener("click", () => void startTraining());
elements.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(trainedWeights.join(", "));
  elements.copy.textContent = "已复制";
});

loadSession().catch(reportError);
