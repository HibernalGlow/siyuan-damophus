import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AGENT_PROTOCOL_VERSION,
  agentResultSchema,
  agentEventSchema,
  heartbeatSchema,
  type AgentRequest,
  type AgentResult,
  type AgentEvent,
  type AgentHeartbeat,
} from "@hibernalglow/damophus-agent-contract";

const BRIDGE_RELATIVE_PATH = join(
  "data",
  "storage",
  "petal",
  "siyuan-damophus",
  "agent-bridge",
);
const HEARTBEAT_MAX_AGE_MS = 30_000;

export class BridgeTransportError extends Error {
  constructor(
    readonly code: "PLUGIN_UNAVAILABLE" | "PROTOCOL_MISMATCH" | "INVALID_REQUEST" | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "BridgeTransportError";
  }
}

export interface BridgeLocation {
  endpoint: string;
  workspace: string;
  root: string;
}

export interface WaitOptions {
  timeoutMs?: number;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/u, "");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const file = await open(temporaryPath, "wx");
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporaryPath, path);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function discoverBridge(endpoint: string): Promise<BridgeLocation> {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  let response: Response;
  try {
    response = await fetch(`${normalizedEndpoint}/api/system/getWorkspaceInfo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3_000),
    });
  } catch (error) {
    throw new BridgeTransportError(
      "PLUGIN_UNAVAILABLE",
      `SiYuan is not reachable at ${normalizedEndpoint}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new BridgeTransportError("PLUGIN_UNAVAILABLE", `SiYuan returned HTTP ${response.status}`);
  }
  const envelope = await response.json() as { code?: number; msg?: string; data?: { workspaceDir?: string } };
  const workspace = envelope.data?.workspaceDir;
  if (envelope.code !== 0 || !workspace) {
    throw new BridgeTransportError("PLUGIN_UNAVAILABLE", envelope.msg || "SiYuan did not return a workspace path");
  }
  return {
    endpoint: normalizedEndpoint,
    workspace,
    root: join(workspace, BRIDGE_RELATIVE_PATH),
  };
}

export async function readFreshHeartbeat(location: BridgeLocation): Promise<AgentHeartbeat> {
  const path = join(location.root, "heartbeat.json");
  let heartbeat: AgentHeartbeat;
  try {
    heartbeat = heartbeatSchema.parse(await readJson(path));
  } catch (error) {
    throw new BridgeTransportError(
      "PLUGIN_UNAVAILABLE",
      `Damophus Agent Bridge heartbeat is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const age = Date.now() - Date.parse(heartbeat.updatedAt);
  if (!Number.isFinite(age) || age < -1_000 || age > HEARTBEAT_MAX_AGE_MS) {
    throw new BridgeTransportError("PLUGIN_UNAVAILABLE", `Damophus Agent Bridge heartbeat is stale (${age} ms)`);
  }
  return heartbeat;
}

export async function submitRequest(location: BridgeLocation, request: AgentRequest): Promise<void> {
  const completedPath = join(location.root, "completed", `${request.requestId}.json`);
  const inboxPath = join(location.root, "inbox", `${request.requestId}.json`);
  if (await fileExists(completedPath) || await fileExists(inboxPath)) return;
  await atomicWrite(inboxPath, `${JSON.stringify(request, null, 2)}\n`);
}

export async function writeApproval(location: BridgeLocation, requestId: string, approved: boolean): Promise<void> {
  await atomicWrite(
    join(location.root, "tasks", requestId, "approval.json"),
    `${JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId,
      decision: approved ? "approve" : "deny",
      decidedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );
}

export async function readResult(location: BridgeLocation, requestId: string): Promise<AgentResult | undefined> {
  const path = join(location.root, "tasks", requestId, "result.json");
  if (!await fileExists(path)) return undefined;
  return agentResultSchema.parse(await readJson(path));
}

async function readEvents(location: BridgeLocation, requestId: string): Promise<AgentEvent[]> {
  const path = join(location.root, "tasks", requestId, "events.ndjson");
  if (!await fileExists(path)) return [];
  const content = await readFile(path, "utf8");
  const events: AgentEvent[] = [];
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      events.push(agentEventSchema.parse(JSON.parse(line)));
    } catch {
      // The plugin rewrites this small append log. Ignore an incomplete final read.
    }
  }
  return events.sort((left, right) => left.sequence - right.sequence);
}

export async function waitForResult(
  location: BridgeLocation,
  requestId: string,
  options: WaitOptions = {},
): Promise<AgentResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const startedAt = Date.now();
  let lastSequence = -1;
  while (Date.now() - startedAt < timeoutMs) {
    for (const event of await readEvents(location, requestId)) {
      if (event.sequence <= lastSequence) continue;
      lastSequence = event.sequence;
      await options.onEvent?.(event);
    }
    const result = await readResult(location, requestId);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new BridgeTransportError("INTERNAL_ERROR", `Timed out waiting for request ${requestId}`);
}

export async function inspectTask(location: BridgeLocation, requestId: string): Promise<{
  events: AgentEvent[];
  result?: AgentResult;
}> {
  return {
    events: await readEvents(location, requestId),
    result: await readResult(location, requestId),
  };
}

export async function heartbeatFileTime(location: BridgeLocation): Promise<Date | undefined> {
  try {
    return (await stat(join(location.root, "heartbeat.json"))).mtime;
  } catch {
    return undefined;
  }
}
