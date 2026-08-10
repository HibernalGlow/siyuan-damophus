import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { z } from "zod";
import {
  AGENT_PROTOCOL_VERSION,
  exportRequestSchema,
  pasteRequestSchema,
  type CloseActive,
  type PasteTarget,
} from "@hibernalglow/damophus-agent-contract";
import { createReporter } from "./reporter";
import {
  defaultSiyuanEndpoint,
  getSkill,
  listSkills,
  removeSkill,
  renameSkill,
  saveSkill,
} from "./skill-client";
import { syncSkill } from "./skill-sync";
import {
  BridgeTransportError,
  discoverBridge,
  inspectTask,
  readBridgeEnabled,
  readFreshHeartbeat,
  reloadDamophus,
  setBridgeEnabled,
  submitRequest,
  waitForFreshHeartbeat,
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

async function requireBridgeHeartbeat(location: Awaited<ReturnType<typeof discoverBridge>>) {
  if (!await readBridgeEnabled(location)) {
    throw new BridgeTransportError(
      "PLUGIN_UNAVAILABLE",
      "Damophus Agent Bridge is disabled. Run `damophus bridge enable` first.",
    );
  }
  return readFreshHeartbeat(location);
}

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

function createDocumentLocator(args: Record<string, unknown>) {
  return typeof args.document === "string"
    ? { documentId: args.document }
    : { notebookId: String(args.notebook ?? ""), path: String(args.path ?? "") };
}

function commaSeparated(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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
      const heartbeat = await requireBridgeHeartbeat(location);
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
      const heartbeat = await requireBridgeHeartbeat(location);
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

export const exportCommand = defineCommand({
  meta: { name: "export", description: "Export SiYuan Kramdown with configurable IAL" },
  args: {
    document: { type: "string", description: "Source document block ID" },
    notebook: { type: "string", description: "Source notebook ID" },
    path: { type: "string", description: "Source human path" },
    output: { type: "string", description: "Write UTF-8 Markdown to this file" },
    ial: {
      type: "enum",
      description: "IAL export range",
      options: ["none", "portable", "all"],
      default: "portable",
    },
    "include-ial": { type: "string", description: "Comma-separated IAL names or * patterns to force include" },
    "exclude-ial": { type: "string", description: "Comma-separated IAL names or * patterns to exclude" },
    "request-id": { type: "string", description: "Idempotency key" },
    ...connectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const requestId = typeof args.requestId === "string" ? args.requestId : randomUUID();
      const request = exportRequestSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId,
        createdAt: new Date().toISOString(),
        command: "export",
        target: createDocumentLocator(args),
        ial: {
          mode: args.ial,
          include: commaSeparated(args.includeIal),
          exclude: commaSeparated(args.excludeIal),
        },
      });
      const location = await discoverBridge(args.endpoint);
      const heartbeat = await requireBridgeHeartbeat(location);
      if (!heartbeat.supportedCommands.includes("export")) {
        throw new Error("The installed Agent Bridge does not support Kramdown export");
      }
      await submitRequest(location, request);
      const showEvents = args.json || typeof args.output === "string";
      const result = await waitForResult(location, requestId, {
        onEvent: showEvents ? (event) => reporter.event(event) : undefined,
      });
      if (result.command !== "export") throw new Error(`Request ${requestId} returned a non-export result`);
      if (result.status === "failed") {
        if (args.json || typeof args.output === "string") await reporter.result(result);
        else await reporter.error(new Error(result.failure?.message ?? "Kramdown export failed"));
        process.exitCode = 1;
        return;
      }
      if (args.json) {
        await reporter.result(result);
        return;
      }
      if (typeof args.output === "string") {
        const outputPath = resolve(args.output);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, result.markdown ?? "", "utf8");
        await reporter.result(result);
        return;
      }
      process.stdout.write(result.markdown ?? "");
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const bridgeEnableCommand = defineCommand({
  meta: { name: "enable", description: "Enable the Damophus Agent Bridge module" },
  args: connectionArgs,
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const location = await discoverBridge(args.endpoint);
      const startedAt = Date.now();
      const alreadyEnabled = await readBridgeEnabled(location);
      if (alreadyEnabled) {
        try {
          const heartbeat = await readFreshHeartbeat(location);
          await reporter.info({
            status: "ready",
            enabled: true,
            changed: false,
            pluginVersion: heartbeat.pluginVersion,
          });
          return;
        } catch {
          await reloadDamophus(location);
        }
      } else {
        await setBridgeEnabled(location, true);
      }
      const heartbeat = await waitForFreshHeartbeat(location, startedAt);
      await reporter.info({
        status: "ready",
        enabled: true,
        changed: !alreadyEnabled,
        pluginVersion: heartbeat.pluginVersion,
      });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const bridgeDisableCommand = defineCommand({
  meta: { name: "disable", description: "Disable the Damophus Agent Bridge module" },
  args: connectionArgs,
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const location = await discoverBridge(args.endpoint);
      const result = await setBridgeEnabled(location, false);
      await reporter.info({ status: "disabled", ...result });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const bridgeStatusCommand = defineCommand({
  meta: { name: "status", description: "Show the Damophus Agent Bridge module state" },
  args: connectionArgs,
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const location = await discoverBridge(args.endpoint);
      const enabled = await readBridgeEnabled(location);
      if (!enabled) {
        await reporter.info({ status: "disabled", enabled: false, workspace: location.workspace });
        return;
      }
      try {
        const heartbeat = await readFreshHeartbeat(location);
        await reporter.info({
          status: "ready",
          enabled: true,
          workspace: location.workspace,
          pluginVersion: heartbeat.pluginVersion,
          protocolVersion: heartbeat.protocolVersion,
        });
      } catch (error) {
        await reporter.info({
          status: "unavailable",
          enabled: true,
          workspace: location.workspace,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

export const bridgeCommand = defineCommand({
  meta: { name: "bridge", description: "Manage the on-demand Damophus Agent Bridge" },
  subCommands: {
    enable: bridgeEnableCommand,
    disable: bridgeDisableCommand,
    status: bridgeStatusCommand,
  },
});

const skillConnectionArgs = {
  endpoint: {
    type: "string" as const,
    description: "SiYuan kernel endpoint",
    default: defaultSiyuanEndpoint(),
  },
  json: {
    type: "boolean" as const,
    description: "Emit newline-delimited JSON",
    default: false,
  },
};

const skillListCommand = defineCommand({
  meta: { name: "list", description: "List skills installed in SiYuan" },
  args: skillConnectionArgs,
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      await reporter.info(await listSkills(args.endpoint));
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const skillGetCommand = defineCommand({
  meta: { name: "get", description: "Read an installed SiYuan skill" },
  args: {
    name: { type: "positional" as const, description: "Installed skill directory name", required: true },
    output: { type: "string" as const, description: "Write the skill to this UTF-8 file" },
    ...skillConnectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const skill = await getSkill(args.endpoint, args.name);
      if (typeof args.output === "string") {
        const output = resolve(args.output);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, skill.content, "utf8");
        await reporter.info({ status: "written", name: skill.name, output });
      } else if (args.json) {
        await reporter.info(skill);
      } else {
        process.stdout.write(skill.content);
      }
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const skillSaveCommand = defineCommand({
  meta: { name: "save", description: "Create or update an installed SiYuan skill" },
  args: {
    name: { type: "positional" as const, description: "Installed skill directory name", required: true },
    file: { type: "string" as const, description: "UTF-8 SKILL.md source", required: true },
    ...skillConnectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const file = resolve(args.file);
      await saveSkill(args.endpoint, args.name, await readFile(file, "utf8"));
      await reporter.info({ status: "saved", name: args.name, file });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const skillRenameCommand = defineCommand({
  meta: { name: "rename", description: "Rename an installed SiYuan skill" },
  args: {
    name: { type: "positional" as const, description: "Current skill directory name", required: true },
    "new-name": { type: "string" as const, description: "New skill directory name", required: true },
    ...skillConnectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const newName = String(args.newName);
      await renameSkill(args.endpoint, args.name, newName);
      await reporter.info({ status: "renamed", oldName: args.name, name: newName });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const skillRemoveCommand = defineCommand({
  meta: { name: "remove", description: "Remove an installed SiYuan skill" },
  args: {
    name: { type: "positional" as const, description: "Installed skill directory name", required: true },
    ...skillConnectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      await removeSkill(args.endpoint, args.name);
      await reporter.info({ status: "removed", name: args.name });
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

const skillSyncCommand = defineCommand({
  meta: { name: "sync", description: "Synchronize a local skill directory into SiYuan" },
  args: {
    source: { type: "positional" as const, description: "Local skill directory or directory symlink", required: true },
    name: { type: "string" as const, description: "Installed directory name; defaults to the source name" },
    workspace: { type: "string" as const, description: "SiYuan workspace; auto-discovered when omitted" },
    materialize: {
      type: "boolean" as const,
      description: "Dereference all symbolic links and install real files",
      default: false,
    },
    ...skillConnectionArgs,
  },
  async run({ args }) {
    const reporter = createReporter(args.json);
    try {
      const workspace = typeof args.workspace === "string"
        ? resolve(args.workspace)
        : (await discoverBridge(args.endpoint)).workspace;
      await reporter.info(await syncSkill({
        source: args.source,
        workspace,
        name: typeof args.name === "string" ? args.name : undefined,
        materialize: args.materialize,
      }));
    } catch (error) {
      await reporter.error(error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  },
});

export const skillCommand = defineCommand({
  meta: { name: "skill", description: "Manage SiYuan agent skills" },
  subCommands: {
    list: skillListCommand,
    get: skillGetCommand,
    save: skillSaveCommand,
    rename: skillRenameCommand,
    remove: skillRemoveCommand,
    sync: skillSyncCommand,
  },
});
