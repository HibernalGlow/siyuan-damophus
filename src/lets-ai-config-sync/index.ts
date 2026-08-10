import { fetchSyncPost } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { AiConfigSyncStorage } from "./storage";
import {
  configHash,
  decryptAiConfig,
  decideAiSync,
  encryptAiConfig,
  type AiConfig,
  type AiConfigEnvelope,
} from "./sync-model";

const log = getLogger("lets-ai-config-sync");
const DEVICE_STATE_KEY = "siyuan-damophus:ai-config-sync:device";
const POLL_INTERVAL_MS = 1500;

interface DeviceState {
  deviceId: string;
  lastObservedHash?: string;
}

function cloneConfig(config: AiConfig): AiConfig {
  return structuredClone(config);
}

function readDeviceState(): DeviceState {
  try {
    const value = JSON.parse(localStorage.getItem(DEVICE_STATE_KEY) ?? "null") as Partial<DeviceState> | null;
    if (value && typeof value.deviceId === "string" && value.deviceId) {
      return {
        deviceId: value.deviceId,
        lastObservedHash: typeof value.lastObservedHash === "string" ? value.lastObservedHash : undefined,
      };
    }
  } catch {
    // Replace invalid device-local state without touching synchronized data.
  }
  return { deviceId: crypto.randomUUID() };
}

function writeDeviceState(state: DeviceState): void {
  localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(state));
}

function currentAiConfig(): AiConfig | undefined {
  const value = (window.siyuan.config as unknown as { ai?: unknown }).ai;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return cloneConfig(value as AiConfig);
}

function workspaceSyncKey(): string | undefined {
  const value = (window.siyuan.config as unknown as { repo?: { key?: unknown } }).repo?.key;
  return typeof value === "string" && value ? value : undefined;
}

export default class AiConfigSyncPlugin extends SubPluginBase {
  private readonly storage = new AiConfigSyncStorage();
  private deviceState?: DeviceState;
  private interval?: number;
  private running: Promise<void> = Promise.resolve();
  private listening = false;
  private readonly handleSyncEnd = (): void => this.requestSync(true);

  override onload(): void {
    if (!this.listening) {
      plugin.eventBus.on("sync-end", this.handleSyncEnd);
      this.listening = true;
    }
  }

  override onLayoutReady(): void {
    if (!this.interval) {
      this.interval = window.setInterval(() => this.requestSync(), POLL_INTERVAL_MS);
    }
    this.requestSync(true);
  }

  onDataChanged(): void {
    this.requestSync(true);
  }

  override onunload(): void {
    if (this.listening) {
      plugin.eventBus.off("sync-end", this.handleSyncEnd);
      this.listening = false;
    }
    if (this.interval) window.clearInterval(this.interval);
    this.interval = undefined;
  }

  private requestSync(force = false): void {
    this.running = this.running.then(() => this.reconcile(force)).catch((error) => {
      log.warn("AI configuration synchronization failed", error);
    });
  }

  private async reconcile(force: boolean): Promise<void> {
    const config = currentAiConfig();
    const syncKey = workspaceSyncKey();
    if (!config || !syncKey) return;
    const currentHash = await configHash(config);
    const state = this.deviceState ?? readDeviceState();
    this.deviceState = state;
    if (!force && state.lastObservedHash === currentHash) return;
    const envelopes = await this.storage.readAll();
    const decision = decideAiSync({
      currentHash,
      lastObservedHash: state.lastObservedHash,
      envelopes,
    });

    if (decision.action === "publish") {
      const envelope: AiConfigEnvelope = {
        schemaVersion: 1,
        deviceId: state.deviceId,
        revision: decision.nextRevision,
        updatedAt: Date.now(),
        hash: currentHash,
        ...await encryptAiConfig(config, syncKey),
      };
      await this.storage.write(envelope);
      state.lastObservedHash = currentHash;
      writeDeviceState(state);
      return;
    }

    if (decision.action === "apply" && decision.winner) {
      const synchronizedConfig = await decryptAiConfig(decision.winner, syncKey);
      if (await configHash(synchronizedConfig) !== decision.winner.hash) {
        throw new Error("The synchronized AI configuration hash does not match its content");
      }
      const response = await fetchSyncPost("/api/setting/setAI", synchronizedConfig);
      if (response.code !== 0) throw new Error(response.msg || "SiYuan rejected the synchronized AI configuration");
      const applied = response.data && typeof response.data === "object"
        ? response.data as AiConfig
        : synchronizedConfig;
      (window.siyuan.config as unknown as { ai: AiConfig }).ai = cloneConfig(applied);
      state.lastObservedHash = await configHash(applied);
      writeDeviceState(state);
      return;
    }

    if (state.lastObservedHash !== currentHash) {
      state.lastObservedHash = currentHash;
      writeDeviceState(state);
    }
  }
}
