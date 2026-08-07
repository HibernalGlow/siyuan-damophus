import {
  AGENT_PROTOCOL_VERSION,
  agentApprovalSchema,
  agentEventSchema,
  agentRequestSchema,
  exportResultSchema,
  pasteResultSchema,
  type AgentRequest,
  type AgentEvent,
  type AgentFailure,
  type ExportRequest,
  type PasteRequest,
} from "@hibernalglow/damophus-agent-contract";
import { createWorkspaceSnapshot, getWorkspaceSnapshots } from "@/api";
import { getFrontend, type IWebSocketData } from "siyuan";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { AgentBridgeStorage } from "./storage";
import {
  closeTargetDocuments,
  findOpenTargetDocumentIds,
  pastePrepared,
  preparePasteItem,
  PasteAdapterError,
  type PreparedPasteItem,
} from "./protyle-paste";
import { exportKramdown, KramdownExportError } from "@/kramdown-export/siyuan";

const log = getLogger("lets-agent-bridge");

function failureFrom(error: unknown): AgentFailure {
  if (error instanceof PasteAdapterError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof KramdownExportError) {
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

function parseRequest(value: unknown): AgentRequest {
  return agentRequestSchema.parse(value);
}

export class AgentBridgeWorker {
  private pollTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private running = false;
  private processing = false;
  private workspace = "";
  private startupReady: Promise<void> = Promise.resolve();
  private readonly storage = new AgentBridgeStorage();

  start(): void {
    if (this.running) return;
    const workspace = window.siyuan.config.system.workspaceDir;
    if (!workspace) return;
    this.workspace = workspace;
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
        workspace: this.workspace,
        frontend: getFrontend(),
        updatedAt: new Date().toISOString(),
        supportedCommands: ["paste", "export"],
        supportedPasteModes: ["create", "append", "replace"],
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
    if (navigator.locks) {
      await navigator.locks.request(`damophus-agent-bridge:${requestId}`, async () => {
        await this.processClaimedFile(name, requestId);
      });
      return;
    }
    await this.processClaimedFile(name, requestId);
  }

  private async processClaimedFile(name: string, requestId: string): Promise<void> {
    const completed = await this.storage.readJson(`completed/${requestId}.json`);
    if (completed) {
      await this.storage.remove(`inbox/${name}`);
      return;
    }
    const raw = await this.storage.readJson<unknown>(`inbox/${name}`);
    if (raw === undefined) return;
    let request: AgentRequest;
    try {
      request = parseRequest(raw);
    } catch (error) {
      await this.writeFailure(requestId, "INVALID_REQUEST", error instanceof Error ? error.message : String(error));
      await this.storage.remove(`inbox/${name}`);
      return;
    }
    if (request.command === "export") {
      await this.processExportRequest(name, request);
      return;
    }
    await this.emit(request.requestId, 0, "accepted", "Request accepted", undefined, 0, request.items.length);
    let snapshotId: string | undefined;
    const completedItems: Array<{ itemId: string; documentId: string; targetPath?: string }> = [];
    let failedItemId: string | undefined;
    try {
      if (request.items.some((item) => hasUnsupportedLocalAsset(item.markdown))) {
        throw new AgentBridgeError("UNSUPPORTED_LOCAL_ASSET", "Relative local assets are not supported yet");
      }
      let sequence = 1;
      await this.emit(request.requestId, sequence++, "resolving-target", "Resolving paste target", undefined, 0, request.items.length);
      const preparedItems: PreparedPasteItem[] = [];
      const createKeys = new Set<string>();
      for (const item of request.items) {
        const prepared = await preparePasteItem(item);
        if (item.target.mode === "create") {
          const key = `${item.target.notebookId}\u0000${item.target.path}`;
          if (createKeys.has(key)) throw new AgentBridgeError("TARGET_EXISTS", `Duplicate create target: ${item.target.path}`);
          createKeys.add(key);
        }
        preparedItems.push(prepared);
      }
      const openTargetIds = findOpenTargetDocumentIds(preparedItems);
      if (openTargetIds.length > 0) {
        if (request.closeActive === "never") {
          throw new AgentBridgeError("ACTIVE_TARGET", "A target document is currently open in SiYuan");
        }
        if (request.closeActive === "ask") {
          await this.emit(request.requestId, sequence++, "approval-required", `Close ${openTargetIds.length} active target tab(s)?`, undefined, 0, request.items.length);
          if (!await this.waitForApproval(request.requestId)) {
            throw new AgentBridgeError("ACTIVE_TARGET", "Closing active target tabs was not approved");
          }
        }
        await closeTargetDocuments(openTargetIds);
      }
      await this.emit(request.requestId, sequence++, "snapshotting", "Creating one workspace snapshot", undefined, 0, request.items.length);
      snapshotId = await this.createSnapshot(request);
      for (let index = 0; index < request.items.length; index += 1) {
        const item = request.items[index];
        failedItemId = item.itemId;
        await this.emit(request.requestId, sequence++, "pasting", `Pasting ${item.sourceName}`, item.itemId, index, request.items.length);
        const receipt = await pastePrepared(preparedItems[index]);
        completedItems.push({ itemId: item.itemId, ...receipt });
        failedItemId = undefined;
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
      await this.emit(request.requestId, 9_999, "failed", failure.message, failedItemId);
      await this.writeFailure(request.requestId, failure.code, failure.message, snapshotId, completedItems, failedItemId);
    } finally {
      await this.storage.remove(`inbox/${name}`);
    }
  }

  private async processExportRequest(name: string, request: ExportRequest): Promise<void> {
    await this.emit(request.requestId, 0, "accepted", "Request accepted");
    try {
      await this.emit(request.requestId, 1, "resolving-target", "Resolving export target");
      await this.emit(request.requestId, 2, "exporting", "Exporting Kramdown with IAL");
      const exported = await exportKramdown(request.target, request.ial);
      const result = exportResultSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId: request.requestId,
        command: "export",
        status: "completed",
        startedAt: request.createdAt,
        finishedAt: new Date().toISOString(),
        ...exported,
      });
      await this.emit(request.requestId, 10_000, "completed", "Kramdown export completed");
      await this.storage.writeJson(`tasks/${request.requestId}/result.json`, result);
      await this.storage.writeJson(`completed/${request.requestId}.json`, result);
    } catch (error) {
      const failure = failureFrom(error);
      const now = new Date().toISOString();
      await this.emit(request.requestId, 9_999, "failed", failure.message);
      const result = exportResultSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId: request.requestId,
        command: "export",
        status: "failed",
        startedAt: request.createdAt,
        finishedAt: now,
        failure,
      });
      await this.storage.writeJson(`tasks/${request.requestId}/result.json`, result);
      await this.storage.writeJson(`completed/${request.requestId}.json`, result);
    } finally {
      await this.storage.remove(`inbox/${name}`);
    }
  }

  private async createSnapshot(request: PasteRequest): Promise<string | undefined> {
    const memo = `Damophus Agent Bridge ${request.requestId} (${request.items.length} items)`;
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

  private async waitForApproval(requestId: string): Promise<boolean> {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const approval = agentApprovalSchema.safeParse(await this.storage.readJson(`tasks/${requestId}/approval.json`));
      if (approval.success && approval.data.requestId === requestId) return approval.data.decision === "approve";
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new AgentBridgeError("ACTIVE_TARGET", "Timed out waiting for approval to close active target tabs");
  }

  private async writeFailure(
    requestId: string,
    code: AgentFailure["code"],
    message: string,
    snapshotId?: string,
    completedItems: Array<{ itemId: string; documentId: string; targetPath?: string }> = [],
    failedItemId?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const result = pasteResultSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId,
      status: "failed",
      startedAt: now,
      finishedAt: now,
      snapshotId,
      completedItems,
      failedItemId,
      failure: { code, message },
    });
    await this.storage.writeJson(`tasks/${requestId}/result.json`, result);
    await this.storage.writeJson(`completed/${requestId}.json`, result);
  }
}
