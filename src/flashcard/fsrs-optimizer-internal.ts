import {
  FSRS_BROWSER_VERSION,
  FSRS_PARAMETER_COUNT,
  type FsrsOptimizationResult,
  type FsrsTrainingDataset,
  validateFsrsWeights,
} from "./fsrs-optimizer-protocol";

export interface InternalOptimizerOptions {
  pluginName: string;
  onProgress?: (processed: number, total: number) => void;
}

function optimizerAssetUrl(pluginName: string): string {
  return `/plugins/${encodeURIComponent(pluginName)}/fsrs-optimizer/vendor/fsrs_browser_bg.wasm`;
}

export async function optimizeFsrsInPlugin(
  dataset: FsrsTrainingDataset,
  options: InternalOptimizerOptions,
): Promise<FsrsOptimizationResult> {
  if (dataset.records.length === 0) throw new Error("No Riff review records are available for optimization");
  const response = await fetch(optimizerAssetUrl(options.pluginName), { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load FSRS WASM: HTTP ${response.status}`);
  const wasmBytes = await response.arrayBuffer();
  const { default: init, Fsrs } = await import("fsrs-browser");
  await init({ module_or_path: wasmBytes });
  const cardIds = new BigInt64Array(dataset.records.map((record) => BigInt(record.cardId)));
  const ratings = new Uint8Array(dataset.records.map((record) => record.rating));
  const reviewTimes = new BigInt64Array(dataset.records.map((record) => BigInt(record.reviewTime)));
  const states = new Uint8Array(dataset.records.map((record) => record.state));
  const fsrs = new Fsrs();
  const startedAt = performance.now();
  options.onProgress?.(0, dataset.records.length);
  try {
    const timezoneMinutes = new Date().getTimezoneOffset() * -1;
    const weights = validateFsrsWeights(Array.from(fsrs.computeParametersAnki(
      timezoneMinutes - 4 * 60,
      cardIds,
      ratings,
      reviewTimes,
      states,
      null,
      true,
    )));
    options.onProgress?.(dataset.records.length, dataset.records.length);
    return {
      schema: 1,
      optimizerVersion: FSRS_BROWSER_VERSION,
      parameterCount: FSRS_PARAMETER_COUNT,
      weights,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      sourceRecordCount: dataset.sourceRecordCount,
      cardCount: dataset.cardCount,
    };
  } finally {
    fsrs.free();
  }
}
