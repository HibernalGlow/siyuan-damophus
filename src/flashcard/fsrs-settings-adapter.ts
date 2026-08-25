import {
  getSystemConfig,
  setFlashcardConfig,
  type SiyuanFlashcardConfig,
} from "@/api";
import {
  formatFsrsWeights,
  parseFsrsWeights,
  validateFsrsWeights,
} from "./fsrs-optimizer-protocol";

export interface FsrsWeightPreview {
  current: number[];
  optimized: number[];
}

export interface FsrsSettingsApi {
  current(): SiyuanFlashcardConfig | undefined;
  set(config: SiyuanFlashcardConfig): Promise<SiyuanFlashcardConfig | null>;
  reread(): Promise<SiyuanFlashcardConfig | undefined>;
  updateLocal(config: SiyuanFlashcardConfig): void;
}

function defaultApi(): FsrsSettingsApi {
  return {
    current: () => window.siyuan?.config?.flashcard as SiyuanFlashcardConfig | undefined,
    set: (config) => setFlashcardConfig(config),
    reread: async () => (await getSystemConfig())?.conf?.flashcard,
    updateLocal: (config) => {
      if (window.siyuan?.config) window.siyuan.config.flashcard = config as never;
    },
  };
}

export function previewFsrsWeights(optimized: readonly unknown[], api: FsrsSettingsApi = defaultApi()): FsrsWeightPreview {
  const current = api.current();
  if (!current) throw new Error("Current SiYuan flashcard settings are unavailable");
  return {
    current: parseFsrsWeights(current.weights),
    optimized: validateFsrsWeights(optimized),
  };
}

export async function applyFsrsWeights(
  optimized: readonly unknown[],
  api: FsrsSettingsApi = defaultApi(),
): Promise<FsrsWeightPreview> {
  const preview = previewFsrsWeights(optimized, api);
  const current = api.current()!;
  const expectedWeights = formatFsrsWeights(preview.optimized);
  const written = await api.set({ ...current, weights: expectedWeights });
  if (!written) throw new Error("SiYuan rejected the optimized FSRS parameters");
  const persisted = await api.reread();
  if (!persisted) throw new Error("Unable to reread SiYuan flashcard settings after applying parameters");
  const persistedWeights = parseFsrsWeights(persisted.weights);
  const expected = parseFsrsWeights(expectedWeights);
  const matches = persistedWeights.every((weight, index) => Math.abs(weight - expected[index]) <= 1e-7);
  if (!matches) throw new Error("SiYuan did not persist the optimized FSRS parameters");
  api.updateLocal(persisted);
  return { current: preview.current, optimized: persistedWeights };
}
