export interface SyncMainMessage {
  cmd?: string;
  data?: unknown;
}

export interface MergeRunResult {
  mergedAt: string;
  diagnostics?: readonly unknown[];
}

export interface MergeRunner {
  run(): Promise<MergeRunResult>;
  terminate?(): void;
}

export interface SyncCoordinatorOptions {
  debounceMs?: number;
  lockName?: string;
  now?: () => number;
  onSuccess?: (result: MergeRunResult) => void;
  onFailure?: (error: unknown) => void;
}

interface LocksLike {
  request<T>(name: string, options: {mode: "exclusive"}, callback: () => Promise<T>): Promise<T>;
}

function lockApi(): LocksLike | undefined {
  const locks = (globalThis.navigator as Navigator & {locks?: LocksLike} | undefined)?.locks;
  return locks;
}

export class StoreSyncCoordinator {
  private readonly debounceMs: number;
  private readonly lockName: string;
  private readonly now: () => number;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private queued = false;
  private running?: Promise<void>;
  private chain: Promise<void> = Promise.resolve();
  private lastValidated?: MergeRunResult;

  constructor(
    private readonly runner: MergeRunner,
    private readonly options: SyncCoordinatorOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 250;
    this.lockName = options.lockName ?? "damophus-tinybase-post-sync-merge";
    this.now = options.now ?? Date.now;
  }

  getLastValidated(): MergeRunResult | undefined {
    return this.lastValidated;
  }

  handle(message: SyncMainMessage): void {
    if (this.closed || message.cmd === "sync-fail") return;
    if (message.cmd !== "sync-end") return;
    this.queued = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.closed || !this.queued) return;
    this.queued = false;
    if (this.running) return this.running;
    this.running = this.runLocked().finally(() => {
      this.running = undefined;
      if (this.queued && !this.closed) void this.flush();
    });
    return this.running;
  }

  private async runLocked(): Promise<void> {
    const operation = async (): Promise<void> => {
      try {
        const result = await this.runner.run();
        this.lastValidated = result;
        this.options.onSuccess?.(result);
      } catch (error) {
        this.options.onFailure?.(error);
      }
    };
    const locks = lockApi();
    if (locks) {
      await locks.request(this.lockName, {mode: "exclusive"}, operation);
      return;
    }
    const previous = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { await operation(); } finally { release(); }
  }

  close(): void {
    this.closed = true;
    this.queued = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.runner.terminate?.();
  }

  debugSnapshot(): {closed: boolean; queued: boolean; running: boolean; at: number} {
    return {closed: this.closed, queued: this.queued, running: Boolean(this.running), at: this.now()};
  }
}
