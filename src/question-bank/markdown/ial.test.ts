import { describe, expect, it } from "vitest";
import { parseIal, serializeIal } from "./ial";

describe("SiYuan IAL", () => {
  it("parses and serializes quoted custom attributes", () => {
    const parsed = parseIal('{: custom-qb-id="civil-1" custom-qb-source="gold \\"A\\""}');

    expect(parsed).toEqual({
      attributes: {
        "custom-qb-id": "civil-1",
        "custom-qb-source": 'gold "A"',
      },
      errors: [],
    });
    expect(serializeIal(parsed!.attributes)).toBe(
      '{: custom-qb-id="civil-1" custom-qb-source="gold \\"A\\""}',
    );
  });

  it("reports malformed and duplicate attributes", () => {
    expect(parseIal('{: custom-qb-id="one" custom-qb-id="two"}')?.errors).toContain(
      "Attribute custom-qb-id is duplicated",
    );
    expect(parseIal('{: custom-qb-id="one"')?.errors).toContain(
      "IAL is missing its closing brace",
    );
  });
});
