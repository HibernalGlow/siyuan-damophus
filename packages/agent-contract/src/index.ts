import { z } from "zod";

export const AGENT_PROTOCOL_VERSION = 1 as const;

export const agentErrorCodeSchema = z.enum([
  "PLUGIN_UNAVAILABLE",
  "PROTOCOL_MISMATCH",
  "INVALID_REQUEST",
  "TARGET_EXISTS",
  "TARGET_NOT_FOUND",
  "TARGET_AMBIGUOUS",
  "ACTIVE_TARGET",
  "UNSUPPORTED_LOCAL_ASSET",
  "SNAPSHOT_FAILED",
  "PASTE_FAILED",
  "VERIFY_FAILED",
  "EXPORT_FAILED",
  "INTERNAL_ERROR",
]);

export const closeActiveSchema = z.enum(["ask", "always", "never"]);
export const pasteModeSchema = z.enum(["create", "append", "replace"]);

const requestIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/u);
const timestampSchema = z.string().datetime({ offset: true });

export const createTargetSchema = z.object({
  mode: z.literal("create"),
  notebookId: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1).optional(),
});

const existingTargetLocatorSchema = z.union([
  z.object({ documentId: z.string().min(1) }),
  z.object({ notebookId: z.string().min(1), path: z.string().min(1) }),
]);

export const documentLocatorSchema = existingTargetLocatorSchema;

export const appendTargetSchema = z.object({
  mode: z.literal("append"),
  locator: existingTargetLocatorSchema,
});

export const replaceTargetSchema = z.object({
  mode: z.literal("replace"),
  locator: existingTargetLocatorSchema,
  title: z.string().min(1).optional(),
});

export const pasteTargetSchema = z.discriminatedUnion("mode", [
  createTargetSchema,
  appendTargetSchema,
  replaceTargetSchema,
]);

export const pasteItemSchema = z.object({
  itemId: z.string().min(1).max(128),
  sourceName: z.string().min(1),
  markdown: z.string(),
  target: pasteTargetSchema,
});

export const pasteRequestSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  createdAt: timestampSchema,
  command: z.literal("paste"),
  closeActive: closeActiveSchema,
  items: z.array(pasteItemSchema).min(1),
});

export const ialExportModeSchema = z.enum(["none", "portable", "all"]);

export const ialExportOptionsSchema = z.object({
  mode: ialExportModeSchema.default("portable"),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
});

export const exportRequestSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  createdAt: timestampSchema,
  command: z.literal("export"),
  target: documentLocatorSchema,
  ial: ialExportOptionsSchema.default({ mode: "portable", include: [], exclude: [] }),
});

export const agentRequestSchema = z.discriminatedUnion("command", [
  pasteRequestSchema,
  exportRequestSchema,
]);

export const heartbeatSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  pluginVersion: z.string().min(1),
  workspace: z.string().min(1),
  frontend: z.string().min(1),
  updatedAt: timestampSchema,
  supportedCommands: z.array(z.enum(["paste", "export"])),
  supportedPasteModes: z.array(pasteModeSchema),
});

export const agentEventTypeSchema = z.enum([
  "accepted",
  "resolving-target",
  "approval-required",
  "snapshotting",
  "pasting",
  "verifying",
  "exporting",
  "completed",
  "failed",
]);

export const agentEventSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: timestampSchema,
  type: agentEventTypeSchema,
  message: z.string().min(1),
  itemId: z.string().min(1).optional(),
  completed: z.number().int().nonnegative().optional(),
  total: z.number().int().positive().optional(),
});

export const approvalDecisionSchema = z.enum(["approve", "deny"]);

export const agentApprovalSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  decision: approvalDecisionSchema,
  decidedAt: timestampSchema,
});

export const agentFailureSchema = z.object({
  code: agentErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const pasteItemReceiptSchema = z.object({
  itemId: z.string().min(1),
  documentId: z.string().min(1),
  targetPath: z.string().min(1).optional(),
});

export const pasteResultSchema = z.object({
  command: z.literal("paste").default("paste"),
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  status: z.enum(["completed", "failed"]),
  startedAt: timestampSchema,
  finishedAt: timestampSchema,
  snapshotId: z.string().min(1).optional(),
  completedItems: z.array(pasteItemReceiptSchema),
  failedItemId: z.string().min(1).optional(),
  failure: agentFailureSchema.optional(),
}).superRefine((value, context) => {
  if (value.status === "failed" && !value.failure) {
    context.addIssue({ code: "custom", path: ["failure"], message: "failure is required" });
  }
});

export const exportResultSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  command: z.literal("export"),
  status: z.enum(["completed", "failed"]),
  startedAt: timestampSchema,
  finishedAt: timestampSchema,
  documentId: z.string().min(1).optional(),
  targetPath: z.string().min(1).optional(),
  markdown: z.string().optional(),
  failure: agentFailureSchema.optional(),
}).superRefine((value, context) => {
  if (value.status === "completed" && value.markdown === undefined) {
    context.addIssue({ code: "custom", path: ["markdown"], message: "markdown is required" });
  }
  if (value.status === "failed" && !value.failure) {
    context.addIssue({ code: "custom", path: ["failure"], message: "failure is required" });
  }
});

export const agentResultSchema = z.union([
  pasteResultSchema,
  exportResultSchema,
]);

export type AgentErrorCode = z.infer<typeof agentErrorCodeSchema>;
export type AgentApproval = z.infer<typeof agentApprovalSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentFailure = z.infer<typeof agentFailureSchema>;
export type AgentHeartbeat = z.infer<typeof heartbeatSchema>;
export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export type CloseActive = z.infer<typeof closeActiveSchema>;
export type PasteItem = z.infer<typeof pasteItemSchema>;
export type PasteMode = z.infer<typeof pasteModeSchema>;
export type PasteRequest = z.infer<typeof pasteRequestSchema>;
export type PasteResult = z.infer<typeof pasteResultSchema>;
export type PasteTarget = z.infer<typeof pasteTargetSchema>;
export type DocumentLocator = z.infer<typeof documentLocatorSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;
export type IalExportMode = z.infer<typeof ialExportModeSchema>;
export type IalExportOptions = z.infer<typeof ialExportOptionsSchema>;
