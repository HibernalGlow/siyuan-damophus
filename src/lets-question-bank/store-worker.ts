import { createDamophusStore } from "../question-bank/adapters/tinybase/tables";
import { mergeContributionStores, type StoreMerger } from "../question-bank/adapters/tinybase/warehouse";
import type { MergeableContent } from "tinybase";

export interface StoreWorkerMergeRequest {
  type: "merge";
  request_id: string;
  stores: Array<{store_id: string; mergeable_content: MergeableContent}>;
}

export interface StoreWorkerMergeResponse {
  type: "merged" | "error";
  request_id: string;
  mergeable_content?: MergeableContent;
  message?: string;
}

export interface StoreWorkerScope {
  postMessage(message: StoreWorkerMergeResponse): void;
  onmessage: ((event: MessageEvent<StoreWorkerMergeRequest>) => void) | null;
}

export function createWorkerStoreMerger(): StoreMerger {
  return (stores, uniqueId) => {
    if (typeof Worker === "undefined") return mergeContributionStores(stores, uniqueId);
    const worker = new Worker(new URL("./store-worker.ts", import.meta.url), {type: "module"});
    const requestId = `${uniqueId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, content?: MergeableContent): void => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        if (error) reject(error);
        else resolve(createDamophusStore(uniqueId).setMergeableContent(content));
      };
      worker.onmessage = (event: MessageEvent<StoreWorkerMergeResponse>) => {
        const response = event.data;
        if (response.request_id !== requestId) return;
        if (response.type === "error" || !response.mergeable_content) {
          finish(new Error(response.message ?? "TinyBase merge worker failed"));
          return;
        }
        finish(undefined, response.mergeable_content);
      };
      worker.onerror = (event) => finish(new Error(event.message || "TinyBase merge worker failed"));
      worker.postMessage({
        type: "merge",
        request_id: requestId,
        stores: stores.map((store, index) => ({
          store_id: `${uniqueId}:${index}`,
          mergeable_content: store.getMergeableContent(),
        })),
      } satisfies StoreWorkerMergeRequest);
    });
  };
}

export function mergeStoreContents(
  stores: readonly StoreWorkerMergeRequest["stores"][number][],
): MergeableContent {
  const merged = createDamophusStore("worker:merged");
  for (const [index, input] of stores.entries()) {
    const source = createDamophusStore(`${input.store_id}:${index}`);
    source.setMergeableContent(input.mergeable_content);
    merged.merge(source);
  }
  return merged.getMergeableContent();
}

export function installStoreWorker(scope: StoreWorkerScope): void {
  scope.onmessage = (event) => {
    const request = event.data;
    if (!request || request.type !== "merge") return;
    try {
      scope.postMessage({
        type: "merged",
        request_id: request.request_id,
        mergeable_content: mergeStoreContents(request.stores),
      });
    } catch (error) {
      scope.postMessage({
        type: "error",
        request_id: request.request_id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

// Vite loads this module directly in a Worker. The document guard keeps the
// exported helpers importable from the main thread and from Vitest.
const workerGlobal = globalThis as unknown as StoreWorkerScope & {document?: unknown};
if (typeof workerGlobal.postMessage === "function" && workerGlobal.document === undefined) {
  installStoreWorker(workerGlobal);
}
