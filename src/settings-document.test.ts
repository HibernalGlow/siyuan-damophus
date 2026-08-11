import { describe, expect, it } from "vitest";
import { mergeSettingsDocuments, parseSettingsDocument } from "./settings-document";

describe("Damophus settings document", () => {
  it("accepts both SiYuan object responses and JSON text", () => {
    expect(parseSettingsDocument({ questionBank: { enabled: true } })).toEqual({
      questionBank: { enabled: true },
    });
    expect(parseSettingsDocument('{"questionBank":{"enabled":true}}')).toEqual({
      questionBank: { enabled: true },
    });
  });

  it("rejects corrupt or non-object settings", () => {
    expect(() => parseSettingsDocument("{")).toThrow("invalid JSON");
    expect(() => parseSettingsDocument([])).toThrow("must be a JSON object");
  });

  it("adds new defaults without replacing stored nested values", () => {
    const defaults = {
      questionBank: { enabled: true, timerEnabled: false },
      topicDictionary: { enabled: false },
    };
    const stored = {
      questionBank: { enabled: false },
      customThemes: [{ id: "custom" }],
    };

    expect(mergeSettingsDocuments(defaults, stored)).toEqual({
      questionBank: { enabled: false, timerEnabled: false },
      topicDictionary: { enabled: false },
      customThemes: [{ id: "custom" }],
    });
  });
});
