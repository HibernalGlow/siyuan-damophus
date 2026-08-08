import { describe, expect, it } from "vitest";
import { enforceSourceBlockReadOnly } from "./source-embed-presentation";

describe("source embed read-only enforcement", () => {
  it("locks existing and dynamically rendered editable descendants", async () => {
    const root = document.createElement("div");
    const existing = document.createElement("span");
    existing.contentEditable = "true";
    root.append(existing);

    const stop = enforceSourceBlockReadOnly(root);
    expect(existing.contentEditable).toBe("false");

    const dynamic = document.createElement("span");
    dynamic.contentEditable = "true";
    root.append(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dynamic.contentEditable).toBe("false");

    stop();
    const afterStop = document.createElement("span");
    afterStop.contentEditable = "true";
    root.append(afterStop);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(afterStop.contentEditable).toBe("true");
  });
});
