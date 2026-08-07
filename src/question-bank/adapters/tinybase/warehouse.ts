import type { MergeableStore } from "tinybase";
import { EventShardSchema } from "./shard-router";
import {
  DAMOPHUS_STORE_ROOT,
  readStoreEnvelope,
  serializeStoreEnvelope,
  storeFilePath,
  writeStoreEnvelope,
  type StoreFileIO,
  type StoreFileLocation,
} from "./file-persistence";
import { createDamophusStore } from "./tables";

export interface DeviceContribution {
  deviceId: string;
  core: MergeableStore;
  sessions: MergeableStore;
  events: Map<string, MergeableStore>;
}

export interface WarehouseReadView {
  core: MergeableStore;
  sessions: MergeableStore;
  events: Map<string, MergeableStore>;
  mergedAt?: string;
}

export interface MergeDiagnostic {
  path: string;
  message: string;
}

export type StoreMerger = (
  stores: readonly MergeableStore[],
  uniqueId: string,
) => MergeableStore | Promise<MergeableStore>;

function cloneStore(source: MergeableStore, uniqueId: string): MergeableStore {
  return createDamophusStore(uniqueId).setMergeableContent(source.getMergeableContent());
}

export function mergeContributionStores(stores: readonly MergeableStore[], uniqueId: string): MergeableStore {
  const merged = createDamophusStore(uniqueId);
  for (const [index, source] of stores.entries()) {
    merged.merge(cloneStore(source, `${uniqueId}:input:${index}`));
  }
  return merged;
}

function eventDirectory(deviceId: string): string {
  return `${DAMOPHUS_STORE_ROOT}/devices/${deviceId}/events`;
}

function fileStem(value: string): string | undefined {
  const name = value.replace(/\\/g, "/").split("/").at(-1);
  return name?.endsWith(".json") ? name.slice(0, -5) : undefined;
}

export class TinyBaseWarehouse {
  private local?: DeviceContribution;
  private readView?: WarehouseReadView;
  private remoteContributions = new Map<string, DeviceContribution>();
  private diagnostics: MergeDiagnostic[] = [];

  constructor(
    private readonly io: StoreFileIO,
    readonly deviceId: string,
    private readonly now: () => Date = () => new Date(),
    private readonly mergeStores: StoreMerger = mergeContributionStores,
  ) {}

  isInitialized(): boolean {
    return Boolean(this.local);
  }

  getDiagnostics(): readonly MergeDiagnostic[] {
    return this.diagnostics;
  }

  getLocalContribution(): DeviceContribution {
    if (!this.local) throw new Error("TinyBase warehouse is not initialized");
    return this.local;
  }

  getReadView(): WarehouseReadView {
    if (!this.readView) throw new Error("TinyBase warehouse is not initialized");
    return this.readView;
  }

  async initializeLocal(): Promise<WarehouseReadView> {
    if (this.local && this.readView) return this.readView;
    this.diagnostics = [];
    this.local = await this.loadDevice(this.deviceId, true);
    this.readView = await this.buildReadView();
    return this.readView;
  }

  private async readRequired(location: StoreFileLocation, allowMissing: boolean): Promise<MergeableStore> {
    const result = await readStoreEnvelope(this.io, location);
    if (result.status === "invalid") {
      this.diagnostics.push({path: storeFilePath(location), message: result.diagnostic ?? "Invalid store file"});
      throw new Error(result.diagnostic ?? "Invalid Damophus store file");
    }
    if (!allowMissing && result.status === "missing") {
      throw new Error(`Store contribution disappeared: ${storeFilePath(location)}`);
    }
    return result.store;
  }

  private async loadDevice(deviceId: string, local: boolean): Promise<DeviceContribution> {
    const [core, sessions, eventNames] = await Promise.all([
      this.readRequired({deviceId, storeKind: "core", shardId: "core"}, true),
      this.readRequired({deviceId, storeKind: "sessions", shardId: "sessions"}, true),
      this.io.list(eventDirectory(deviceId)).catch(() => []),
    ]);
    const events = new Map<string, MergeableStore>();
    for (const name of eventNames) {
      const shardId = fileStem(name);
      if (!shardId || !EventShardSchema.safeParse(shardId).success) continue;
      const location = {deviceId, storeKind: "events" as const, shardId};
      try {
        events.set(shardId, await this.readRequired(location, false));
      } catch (error) {
        if (local) throw error;
      }
    }
    return {deviceId, core, sessions, events};
  }

  private async buildReadView(): Promise<WarehouseReadView> {
    if (!this.local) throw new Error("TinyBase warehouse is not initialized");
    const contributions = [this.local, ...this.remoteContributions.values()];
    const shardIds = new Set(contributions.flatMap((item) => [...item.events.keys()]));
    return {
      core: await this.mergeStores(contributions.map((item) => item.core), "read:core"),
      sessions: await this.mergeStores(contributions.map((item) => item.sessions), "read:sessions"),
      events: new Map(await Promise.all([...shardIds].map(async (shardId) => [
        shardId,
        await this.mergeStores(
          contributions.flatMap((item) => item.events.get(shardId) ? [item.events.get(shardId)!] : []),
          `read:events:${shardId}`,
        ),
      ] as const))),
      mergedAt: this.now().toISOString(),
    };
  }

  async mergeAfterSync(): Promise<WarehouseReadView> {
    await this.initializeLocal();
    this.diagnostics = [];
    const deviceNames = await this.io.list(`${DAMOPHUS_STORE_ROOT}/devices`).catch(() => []);
    const next = new Map<string, DeviceContribution>();
    for (const rawName of deviceNames) {
      const deviceId = rawName.replace(/\\/g, "/").split("/").filter(Boolean).at(-1);
      if (!deviceId || deviceId === this.deviceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(deviceId)) continue;
      try {
        next.set(deviceId, await this.loadDevice(deviceId, false));
      } catch (error) {
        const lastGood = this.remoteContributions.get(deviceId);
        if (lastGood) next.set(deviceId, lastGood);
        this.diagnostics.push({
          path: `${DAMOPHUS_STORE_ROOT}/devices/${deviceId}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.remoteContributions = next;
    this.readView = await this.buildReadView();
    return this.readView;
  }

  private mergeLocalIntoRead(kind: "core" | "sessions", shardId?: string): void {
    if (!this.local || !this.readView) return;
    if (kind === "core") this.readView.core.merge(cloneStore(this.local.core, "local:core:publish"));
    else if (!shardId) this.readView.sessions.merge(cloneStore(this.local.sessions, "local:sessions:publish"));
  }

  async persistCore(): Promise<void> {
    const local = this.getLocalContribution();
    await writeStoreEnvelope(this.io, {deviceId: this.deviceId, storeKind: "core", shardId: "core"}, local.core);
    this.mergeLocalIntoRead("core");
  }

  async persistSessions(): Promise<void> {
    const local = this.getLocalContribution();
    await writeStoreEnvelope(
      this.io,
      {deviceId: this.deviceId, storeKind: "sessions", shardId: "sessions"},
      local.sessions,
    );
    this.mergeLocalIntoRead("sessions");
  }

  async persistEventShard(shardId: string): Promise<void> {
    EventShardSchema.parse(shardId);
    const local = this.getLocalContribution();
    const store = local.events.get(shardId);
    if (!store) throw new Error(`Local event shard '${shardId}' is not initialized`);
    await writeStoreEnvelope(this.io, {deviceId: this.deviceId, storeKind: "events", shardId}, store);
    const view = this.getReadView();
    const merged = view.events.get(shardId) ?? createDamophusStore(`read:events:${shardId}`);
    merged.merge(cloneStore(store, `local:events:${shardId}:publish`));
    view.events.set(shardId, merged);
  }

  async eventShardBytes(shardId: string): Promise<number> {
    EventShardSchema.parse(shardId);
    const local = this.getLocalContribution();
    const store = local.events.get(shardId);
    if (!store) return 0;
    const raw = await serializeStoreEnvelope({deviceId: this.deviceId, storeKind: "events", shardId}, store);
    return new TextEncoder().encode(raw).byteLength;
  }

  ensureLocalEventShard(shardId: string): MergeableStore {
    EventShardSchema.parse(shardId);
    const local = this.getLocalContribution();
    const store = local.events.get(shardId) ?? createDamophusStore(`${this.deviceId}:events:${shardId}`);
    local.events.set(shardId, store);
    return store;
  }
}
