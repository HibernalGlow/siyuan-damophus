import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { z } from "zod";
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
  writeApproval,
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

const manifestItemSchema = z.object({
  file: z.string().min(1),
  mode: z.enum(["create", "append", "replace"]),
  notebook: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  document: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

const pasteManifestSchema = z.object({
  version: z.literal(1).default(1),
  items: z.array(manifestItemSchema).min(1),
});

async function readPasteItems(args: Record<string, unknown>): Promise<Array<{ itemId: string; sourceName: string; markdown: string; target: PasteTarget }>> {
  const manifestPath = typeof args.manifest === "string" ? resolve(args.manifest) : undefined;
  if (manifestPath && args.file) throw new Error("Use either <file> or --manifest, not both");
  if (!manifestPath && typeof args.file !== "string") throw new Error("A Markdown file or --manifest is required");
  if (!manifestPath) {
    const file = String(args.file);
    return [{ itemId: "item-1", sourceName: basename(file), markdown: await readFile(file, "utf8"), target: createTarget(args) }];
  }
  const manifest = pasteManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  return Promise.all(manifest.items.map(async (item, index) => {
    const target = item.mode === "create"
      ? { mode: "create" as const, notebookId: item.notebook ?? "", path: item.path ?? "", title: item.title }
      : { mode: item.mode, locator: item.document ? { documentId: item.document } : { notebookId: item.notebook ?? "", path: item.path ?? "" }, ...(item.mode === "replace" && item.title ? { title: item.title } : {}) };
    const parsedTarget = pasteRequestSchema.shape.items.element.shape.target.parse(target);
    const file = resolve(dirname(manifestPath), item.file);
    return { itemId: `item-${index + 1}`, sourceName: basename(file), markdown: await readFile(file, "utf8"), target: parsedTarget };
  }));
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
      required: false,
    },
    manifest: { type: "string", description: "JSON manifest containing multiple Markdown files" },
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
      const items = await readPasteItems(args);
      const closeActive = resolveCloseActive(
        typeof args.closeActive === "string" ? args.closeActive : undefined,
        args.json,
      );
      if (closeActive === "ask" && (!process.stdin.isTTY || args.json || !args.wait)) {
        throw new Error("--close-active=ask requires an interactive command that waits for completion");
      }
      const request = pasteRequestSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId,
        createdAt: new Date().toISOString(),
        command: "paste",
        closeActive,
        items,
      });
      const location = await discoverBridge(args.endpoint);
      const heartbeat = await readFreshHeartbeat(location);
      const modes = [...new Set(items.map((item) => item.target.mode))];
      const unsupportedMode = modes.find((mode) => !heartbeat.supportedPasteModes.includes(mode));
      if (unsupportedMode) {
        throw new Error(`The installed Agent Bridge does not support paste mode: ${unsupportedMode}`);
      }
      await submitRequest(location, request);
      if (!args.wait) {
        await reporter.info({ status: "submitted", requestId });
        return;
      }
      const result = await waitForResult(location, requestId, {
        onEvent: async (event) => {
          await reporter.event(event);
          if (event.type === "approval-required") {
            await writeApproval(location, requestId, await reporter.confirmClose(event.message));
          }
        },
      });
      await reporter.result(result);
      if (result.status === "failed") process.exitCode = 1;
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});
