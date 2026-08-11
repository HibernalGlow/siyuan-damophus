import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_PROTOCOL_VERSION,
  DAMOPHUS_SETTINGS_STORAGE_NAME,
  damophusPluginStoragePath,
} from "@hibernalglow/damophus-agent-contract";
import {
  discoverBridge,
  readBridgeEnabled,
  readFreshHeartbeat,
  setBridgeEnabled,
  waitForResult,
  writeApproval,
} from "./transport";

afterEach(() => vi.unstubAllGlobals());

describe("bridge transport", () => {
  it("discovers the workspace through the existing SiYuan endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { workspaceDir: "D:/SiYuan" },
    }))));
    const location = await discoverBridge("http://127.0.0.1:6806/");
    expect(location.workspace).toBe("D:/SiYuan");
    expect(location.endpoint).toBe("http://127.0.0.1:6806");
  });

  it("reads a fresh compatible heartbeat", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-cli-"));
    await writeFile(join(root, "heartbeat.json"), JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      pluginVersion: "0.0.4",
      workspace: root,
      frontend: "desktop",
      updatedAt: new Date().toISOString(),
      supportedCommands: ["paste"],
      supportedPasteModes: ["create"],
    }));
    expect((await readFreshHeartbeat({ endpoint: "", workspace: root, root })).pluginVersion).toBe("0.0.4");
  });

  it("reads the Agent Bridge module state from the Damophus config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      questionBank: { enabled: true },
      agentBridge: { enabled: false },
    }))));
    await expect(readBridgeEnabled({ endpoint: "http://127.0.0.1:6806", workspace: "D:/SiYuan", root: "" }))
      .resolves.toBe(false);
  });

  it("rejects SiYuan's HTTP 202 file error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: 404,
      msg: "file not found",
      data: null,
    }), { status: 202 })));
    await expect(readBridgeEnabled({ endpoint: "http://127.0.0.1:6806", workspace: "D:/SiYuan", root: "" }))
      .rejects.toThrow("file not found");
  });

  it("updates only the Agent Bridge setting and reloads Damophus", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body });
      if (url.endsWith("/api/file/getFile")) {
        return new Response(JSON.stringify({
          questionBank: { enabled: true, reviewThreshold: 2 },
          agentBridge: { enabled: false },
        }));
      }
      return new Response(JSON.stringify({ code: 0, msg: "", data: null }), {
        headers: { "content-type": "application/json" },
      });
    }));

    const location = { endpoint: "http://127.0.0.1:6806", workspace: "D:/SiYuan", root: "" };
    await expect(setBridgeEnabled(location, true)).resolves.toEqual({ changed: true, enabled: true });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:6806/api/file/getFile",
      "http://127.0.0.1:6806/api/file/putFile",
      "http://127.0.0.1:6806/api/petal/setPetalEnabled",
      "http://127.0.0.1:6806/api/petal/setPetalEnabled",
    ]);
    expect(JSON.parse(String(calls[0].body))).toEqual({
      path: damophusPluginStoragePath(DAMOPHUS_SETTINGS_STORAGE_NAME),
    });
    const form = calls[1].body as FormData;
    const file = form.get("file") as Blob;
    expect(JSON.parse(await file.text())).toEqual({
      questionBank: { enabled: true, reviewThreshold: 2 },
      agentBridge: { enabled: true },
    });
    expect(JSON.parse(String(calls[2].body))).toEqual({ packageName: "siyuan-damophus", enabled: false });
    expect(JSON.parse(String(calls[3].body))).toEqual({ packageName: "siyuan-damophus", enabled: true });
  });

  it("does not rewrite or reload when the requested bridge state is already stored", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ agentBridge: { enabled: false } })));
    vi.stubGlobal("fetch", fetch);
    await expect(setBridgeEnabled({ endpoint: "http://127.0.0.1:6806", workspace: "D:/SiYuan", root: "" }, false))
      .resolves.toEqual({ changed: false, enabled: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("streams events before returning the receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-cli-"));
    const task = join(root, "tasks", "request_1234");
    await mkdir(task, { recursive: true });
    await writeFile(join(task, "events.ndjson"), `${JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      sequence: 0,
      timestamp: new Date().toISOString(),
      type: "accepted",
      message: "Accepted",
    })}\n`);
    await writeFile(join(task, "result.json"), JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      status: "completed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      completedItems: [{ itemId: "item-1", documentId: "20260807120000-testdoc" }],
    }));
    const events: string[] = [];
    const result = await waitForResult({ endpoint: "", workspace: root, root }, "request_1234", {
      onEvent: (event) => { events.push(event.type); },
    });
    expect(events).toEqual(["accepted"]);
    expect(result.status).toBe("completed");
  });

  it("writes an atomic approval response", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-cli-"));
    const location = { endpoint: "", workspace: root, root };
    await writeApproval(location, "request_1234", true);
    const approval = JSON.parse(await readFile(join(root, "tasks", "request_1234", "approval.json"), "utf8"));
    expect(approval).toMatchObject({ requestId: "request_1234", decision: "approve" });
  });

  it("reads an export result", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-cli-"));
    const task = join(root, "tasks", "request_1234");
    await mkdir(task, { recursive: true });
    await writeFile(join(task, "result.json"), JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      command: "export",
      status: "completed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      documentId: "20260807120000-testdoc",
      targetPath: "/Export",
      markdown: "| A | B |\n| --- | --- |\n",
    }));
    const result = await waitForResult({ endpoint: "", workspace: root, root }, "request_1234");
    expect(result.command).toBe("export");
  });
});
