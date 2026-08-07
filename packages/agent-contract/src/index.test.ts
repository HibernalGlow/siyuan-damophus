import { describe, expect, it } from "vitest";
import {
  AGENT_PROTOCOL_VERSION,
  agentApprovalSchema,
  heartbeatSchema,
  pasteRequestSchema,
  pasteResultSchema,
} from "./index";

describe("agent contract", () => {
  it("accepts a create paste request", () => {
    expect(pasteRequestSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      createdAt: "2026-08-07T12:00:00.000Z",
      command: "paste",
      closeActive: "never",
      items: [{
        itemId: "item-1",
        sourceName: "sample.md",
        markdown: "| A | B |\n| - | - |\n| 1 | 2 |",
        target: {
          mode: "create",
          notebookId: "20260807120000-testbox",
          path: "/Agent Bridge/Sample",
        },
      }],
    }).items).toHaveLength(1);
  });

  it("rejects a failed receipt without failure details", () => {
    expect(() => pasteResultSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      status: "failed",
      startedAt: "2026-08-07T12:00:00.000Z",
      finishedAt: "2026-08-07T12:00:01.000Z",
      completedItems: [],
    })).toThrow();
  });

  it("requires current protocol heartbeats", () => {
    expect(() => heartbeatSchema.parse({
      protocolVersion: 2,
      pluginVersion: "0.0.4",
      workspace: "D:/workspace",
      frontend: "desktop",
      updatedAt: "2026-08-07T12:00:00.000Z",
      supportedCommands: ["paste"],
      supportedPasteModes: ["create"],
    })).toThrow();
  });

  it("accepts a matching close approval", () => {
    expect(agentApprovalSchema.parse({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      requestId: "request_1234",
      decision: "approve",
      decidedAt: "2026-08-07T12:00:00.000Z",
    }).decision).toBe("approve");
  });
});
