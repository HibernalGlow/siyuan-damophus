import init, { Fsrs, Progress, initThreadPool } from "./vendor/fsrs_browser.js";

self.onmessage = async ({ data }) => {
  try {
    const { dataset, threads } = data;
    const initialized = await init(new URL("./vendor/fsrs_browser_bg.wasm", import.meta.url));
    await initThreadPool(threads);
    const cardIds = new BigInt64Array(dataset.records.map((record) => BigInt(record.cardId)));
    const ratings = new Uint8Array(dataset.records.map((record) => record.rating));
    const reviewTimes = new BigInt64Array(dataset.records.map((record) => BigInt(record.reviewTime)));
    const states = new Uint8Array(dataset.records.map((record) => record.state));
    const fsrs = new Fsrs();
    const progress = Progress.new();
    self.postMessage({ type: "progress", buffer: initialized.memory.buffer, pointer: progress.pointer() });
    const startedAt = performance.now();
    const timezoneMinutes = new Date().getTimezoneOffset() * -1;
    const weights = Array.from(fsrs.computeParametersAnki(
      timezoneMinutes - 4 * 60,
      cardIds,
      ratings,
      reviewTimes,
      states,
      progress,
      true,
    ));
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    fsrs.free();
    self.postMessage({ type: "result", weights, durationMs });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.stack || error.message : String(error) });
  }
};
