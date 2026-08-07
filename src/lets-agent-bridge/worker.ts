import {
  AGENT_PROTOCOL_VERSION,
  agentEventSchema,
  pasteRequestSchema,
  pasteResultSchema,
  type AgentEvent,
  type AgentFailure,
  type PasteRequest,
} from "@hibernalglow/damophus-agent-contract";
import { createWorkspaceSnapshot, getWorkspaceSnapshots } from "@/api";
import { getFrontend, type IWebSocketData } from "siyuan";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { AgentBridgeStorage } from "./storage";
import { pasteCreate, PasteAdapterError } from "./protyle-paste";

const log = getLogger("lets-agent-bridge");

function failureFrom(error: unknown): AgentFailure {
  if (error instanceof PasteAdapterError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: error.message };
  return { code: "INTERNAL_ERROR", message: String(error) };
}

class AgentBridgeError extends Error {
  constructor(readonly code: AgentFailure["code"], message: string) {
    super(message);
    this.name = "AgentBridgeError";
  }
}

function hasUnsupportedLocalAsset(markdown: string): boolean {
  const references = [
    ...Array.from(markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/gu), (match) => match[1]),
    ...Array.from(markdown.matchAll(/<(?:img|video|audio|source)\b[^>]*\bsrc=["']([^"']+)["']/giu), (match) => match[1]),
  ];
  return references.some((reference) => !/^(?:https?:|data:|assets\/|\/assets\/)/iu.test(reference));
}

function parseRequest(value: unknown): PasteRequest {
  return pasteRequestSchema.parse(value);
}

export class AgentBridgeWorker {
  private pollTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private running = false;
  private processing = false;
  private startupReady: Promise<void> = Promise.resolve();
  private readonly storage = new AgentBridgeStorage();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startupReady = this.discardPendingRequests();
    void this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.writeHeartbeat(), 2_000);
    void this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pollTimer = undefined;
    this.heartbeatTimer = undefined;
  }

  private async writeHeartbeat(): Promise<void> {
    try {
      await this.storage.writeJson("heartbeat.json", {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        pluginVersion: (plugin as any).version || "0.0.4",
        workspace: window.siyuan.config.system.workspaceDir,
        frontend: getFrontend(),
        updatedAt: new Date().toISOString(),
        supportedCommands: ["paste"],
        supportedPasteModes: ["create"],
      });
    } catch (error) {
      log.warn("heartbeat failed", error);
    }
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => void this.poll(), 300);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    await this.startupReady;
    if (!this.processing) {
      try {
        const names = await this.storage.listInbox();
        const name = names[0];
        if (name) {
          this.processing = true;
          await this.processFile(name);
          this.processing = false;
        }
      } catch (error) {
        this.processing = false;
        log.warn("poll failed", error);
      }
    }
    this.schedulePoll();
  }

  private async discardPendingRequests(): Promise<void> {
    try {
      for (const name of await this.storage.listInbox()) {
        const requestId = name.replace(/\.json$/u, "");
        await this.writeFailure(requestId, "PLUGIN_UNAVAILABLE", "Request was waiting before the Agent Bridge started");
        await this.storage.remove(`inbox/${name}`);
      }
    } catch (error) {
      log.warn("failed to discard pending requests", error);
    }
  }

  private async emit(requestId: string, sequence: number, type: AgentEvent["type"], message: string, itemId?: string, completed?: number, total?: number): Promise<void> {
    const event = agentEventSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      message,
      itemId,
      completed,
      total,
    });
    const path = `tasks/${requestId}/events.ndjson`;
    const existing = await this.storage.readText(path);
    await this.storage.writeText(path, `${existing}${JSON.stringify(event)}\n`);
  }

  private async processFile(name: string): Promise<void> {
    const requestId = name.replace(/\.json$/u, "");
    const raw = await this.storage.readJson<unknown>(`inbox/${name}`);
    let request: PasteRequest;
    try {
      request = parseRequest(raw);
    } catch (error) {
      await this.writeFailure(requestId, "INVALID_REQUEST", error instanceof Error ? error.message : String(error));
      await this.storage.remove(`inbox/${name}`);
      return;
    }
    const completed = await this.storage.readJson(`completed/${request.requestId}.json`);
    if (completed) {
      await this.storage.remove(`inbox/${name}`);
      return;
    }
    await this.emit(request.requestId, 0, "accepted", "Request accepted", undefined, 0, request.items.length);
    try {
      if (request.items.some((item) => item.target.mode !== "create")) {
        throw new AgentBridgeError("INVALID_REQUEST", "Only create mode is enabled in this first adapter slice");
      }
      if (request.items.some((item) => hasUnsupportedLocalAsset(item.markdown))) {
        throw new AgentBridgeError("UNSUPPORTED_LOCAL_ASSET", "Relative local assets are not supported yet");
      }
      await this.emit(request.requestId, 1, "resolving-target", "Resolving paste target", undefined, 0, request.items.length);
      await this.emit(request.requestId, 2, "snapshotting", "Creating one workspace snapshot", undefined, 0, request.items.length);
      const snapshotId = await this.createSnapshot(request);
      const completedItems = [];
      let sequence = 3;
      for (let index = 0; index < request.items.length; index += 1) {
        const item = request.items[index];
        await this.emit(request.requestId, sequence++, "pasting", `Pasting ${item.sourceName}`, item.itemId, index, request.items.length);
        const receipt = await pasteCreate(item);
        completedItems.push({ itemId: item.itemId, ...receipt });
        await this.emit(request.requestId, sequence++, "verifying", `Verified ${item.sourceName}`, item.itemId, index + 1, request.items.length);
      }
      const result = pasteResultSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "completed",
        startedAt: request.createdAt,
        finishedAt: new Date().toISOString(),
        snapshotId,
        completedItems,
      });
      await this.writeSuccess(request, result);
    } catch (error) {
      const failure = error instanceof Error && "code" in error && typeof (error as any).code === "string"
        ? { code: (error as any).code as AgentFailure["code"], message: error.message }
        : failureFrom(error);
      await this.emit(request.requestId, 3, "failed", failure.message);
      await this.writeFailure(request.requestId, failure.code, failure.message);
    } finally {
      await this.storage.remove(`inbox/${name}`);
    }
  }

  private async createSnapshot(request: PasteRequest): Promise<string | undefined> {
    const memo = `Damophus Agent Bridge ${request.requestId} (${request.items.length} item)`;
    let response: IWebSocketData;
    try {
      response = await createWorkspaceSnapshot(memo) as IWebSocketData;
    } catch (error) {
      throw new AgentBridgeError("SNAPSHOT_FAILED", error instanceof Error ? error.message : String(error));
    }
    if (!response || response.code !== 0) {
      throw new AgentBridgeError("SNAPSHOT_FAILED", response?.msg || "SiYuan workspace snapshot failed");
    }
    const snapshots = await getWorkspaceSnapshots(1) as { snapshots?: Array<{ id?: string; memo?: string }> };
    return snapshots?.snapshots?.find((snapshot) => snapshot.memo === memo)?.id;
  }

  private async writeSuccess(request: PasteRequest, result: any): Promise<void> {
    await this.emit(request.requestId, 10_000, "completed", "Paste completed", undefined, result.completedItems.length, request.items.length);
    await this.storage.writeJson(`tasks/${request.requestId}/result.json`, result);
    await this.storage.writeJson(`completed/${request.requestId}.json`, result);
  }

  private async writeFailure(requestId: string, code: AgentFailure["code"], message: string): Promise<void> {
    const now = new Date().toISOString();
    const result = pasteResultSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId,
      status: "failed",
      startedAt: now,
      finishedAt: now,
      completedItems: [],
      failure: { code, message },
    });
    await this.storage.writeJson(`tasks/${requestId}/result.json`, result);
    await this.storage.writeJson(`completed/${requestId}.json`, result);
  }
}
