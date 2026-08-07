import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import {
  AGENT_PROTOCOL_VERSION,
  pasteRequestSchema,
  type CloseActive,
  type PasteTarget,
} from "@hibernalglow/damophus-agent-contract";
import { createReporter } from "./reporter";
import {
  discoverBridge,
  inspectTask,
  readFreshHeartbeat,
  submitRequest,
  waitForResult,
} from "./transport";

const DEFAULT_ENDPOINT = process.env.DAMOPHUS_SIYUAN_URL || "http://127.0.0.1:6806";

const connectionArgs = {
  endpoint: {
    type: "string" as const,
    description: "SiYuan kernel endpoint",
    default: DEFAULT_ENDPOINT,
  },
  json: {
    type: "boolean" as const,
    description: "Emit newline-delimited JSON",
    default: false,
  },
};

function resolveCloseActive(value: string | undefined, json: boolean): CloseActive {
  if (value === "ask" || value === "always" || value === "never") return value;
  return !json && process.stdin.isTTY ? "ask" : "never";
}

function createTarget(args: Record<string, unknown>): PasteTarget {
  const mode = args.mode;
  if (mode === "create") {
    return {
      mode,
      notebookId: String(args.notebook ?? ""),
      path: String(args.path ?? ""),
      title: typeof args.title === "string" ? args.title : undefined,
    };
  }
  const locator = typeof args.document === "string"
    ? { documentId: args.document }
    : { notebookId: String(args.notebook ?? ""), path: String(args.path ?? "") };
  if (mode === "replace") {
    return { mode, locator, title: typeof args.title === "string" ? args.title : undefined };
  }
  return { mode: "append", locator };
}

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "Check SiYuan and Damophus Agent Bridge" },
  args: connectionArgs,
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const location = await discoverBridge(args.endpoint);
      const heartbeat = await readFreshHeartbeat(location);
      await reporter.info({
        status: "ready",
        endpoint: location.endpoint,
        workspace: location.workspace,
        pluginVersion: heartbeat.pluginVersion,
        protocolVersion: heartbeat.protocolVersion,
        supportedPasteModes: heartbeat.supportedPasteModes,
      });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

export const statusCommand = defineCommand({
  meta: { name: "status", description: "Read a paste request status" },
  args: {
    requestId: {
      type: "positional",
      description: "Stable request ID",
      required: true,
    },
    ...connectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const location = await discoverBridge(args.endpoint);
      const task = await inspectTask(location, args.requestId);
      for (const event of task.events) await reporter.event(event);
      if (task.result) await reporter.result(task.result);
      else await reporter.info({ status: "pending", requestId: args.requestId });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

export const pasteCommand = defineCommand({
  meta: { name: "paste", description: "Paste Markdown through a running SiYuan Protyle editor" },
  args: {
    file: {
      type: "positional",
      description: "UTF-8 Markdown file",
      required: true,
    },
    mode: {
      type: "enum",
      description: "Write mode",
      options: ["create", "append", "replace"],
      default: "create",
    },
    notebook: { type: "string", description: "Target notebook ID" },
    path: { type: "string", description: "Target human path" },
    document: { type: "string", description: "Target document block ID" },
    title: { type: "string", description: "Explicit document title" },
    "close-active": {
      type: "enum",
      description: "How to handle an open target document",
      options: ["ask", "always", "never"],
    },
    "request-id": { type: "string", description: "Idempotency key" },
    wait: {
      type: "boolean",
      description: "Wait for completion",
      negativeDescription: "Return after publishing the request",
      default: true,
    },
    ...connectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const requestId = typeof args.requestId === "string" ? args.requestId : randomUUID();
      const file = String(args.file);
      const markdown = await readFile(file, "utf8");
      const request = pasteRequestSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId,
        createdAt: new Date().toISOString(),
        command: "paste",
        closeActive: resolveCloseActive(
          typeof args.closeActive === "string" ? args.closeActive : undefined,
          args.json,
        ),
        items: [{
          itemId: "item-1",
          sourceName: basename(file),
          markdown,
          target: createTarget(args),
        }],
      });
      const location = await discoverBridge(args.endpoint);
      const heartbeat = await readFreshHeartbeat(location);
      const mode = String(args.mode) as "create" | "append" | "replace";
      if (!heartbeat.supportedPasteModes.includes(mode)) {
        throw new Error(`The installed Agent Bridge does not support paste mode: ${mode}`);
      }
      await submitRequest(location, request);
      if (!args.wait) {
        await reporter.info({ status: "submitted", requestId });
        return;
      }
      const result = await waitForResult(location, requestId, {
        onEvent: (event) => reporter.event(event),
      });
      await reporter.result(result);
      if (result.status === "failed") process.exitCode = 1;
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});
