import { describe, expect, it } from "vitest";
import {
  isAttributeViewValueEmpty,
  matchesBindingOperator,
  normalizeBindingRules,
  planDateBindingActions,
  serializeBindingConfig,
  resolveColumn,
  type RawAttributeView,
} from "./av-column-binding";

const av: RawAttributeView = {
  id: "av-1",
  keyValues: [
    { key: { id: "source", name: "完成", type: "checkbox" }, values: [
      { id: "row-1-source", blockID: "row-1", keyID: "source", type: "checkbox", checkbox: { checked: true } },
      { id: "row-2-source", blockID: "row-2", keyID: "source", type: "checkbox", checkbox: { checked: false } },
      { id: "row-3-source", blockID: "row-3", keyID: "source", type: "checkbox", checkbox: { checked: true } },
    ] },
    { key: { id: "target", name: "完成时间", type: "date" }, values: [
      { id: "row-1-target", blockID: "row-1", keyID: "target", type: "date", date: { content: 123, isNotEmpty: true } },
      { id: "row-2-target", blockID: "row-2", keyID: "target", type: "date", date: { isNotEmpty: false } },
      { id: "row-3-target", blockID: "row-3", keyID: "target", type: "date", date: { isNotEmpty: false } },
    ] },
  ],
};

describe("database column bindings", () => {
  it("normalizes native filter operators and rejects incomplete rules", () => {
    expect(normalizeBindingRules({ version: 1, rules: [
      { sourceColumn: "完成", operator: "Is false", targetColumn: "完成时间", generator: "dateNow" },
      { sourceColumn: "", operator: "Is true", targetColumn: "完成时间", generator: "dateNow" },
      { sourceColumn: "完成", operator: "unknown", targetColumn: "完成时间", generator: "unknown" },
    ] })).toEqual([{ sourceColumn: "完成", operator: "Is false", targetColumn: "完成时间", generator: "dateNow" }]);
  });

  it("serializes a versioned database attribute", () => {
    expect(JSON.parse(serializeBindingConfig([{ sourceColumn: "source", operator: "Is true", targetColumn: "target", generator: "dateNow" }]))).toEqual({
      version: 1,
      rules: [{ sourceColumn: "source", operator: "Is true", targetColumn: "target", generator: "dateNow" }],
    });
  });

  it("resolves stable IDs before names", () => {
    const columns = av.keyValues.map(({ key }) => key);
    expect(resolveColumn(columns, "target")?.name).toBe("完成时间");
    expect(resolveColumn(columns, "完成")?.id).toBe("source");
  });

  it("distinguishes both checkbox states using native operators", () => {
    const values = av.keyValues[0].values;
    expect(matchesBindingOperator(values[0], "Is true")).toBe(true);
    expect(matchesBindingOperator(values[0], "Is false")).toBe(false);
    expect(matchesBindingOperator(values[1], "Is false")).toBe(true);
    expect(isAttributeViewValueEmpty(values[1])).toBe(true);
  });

  it("plans checked rows only when the target is empty", () => {
    expect(planDateBindingActions(av, [{ sourceColumn: "完成", operator: "Is true", targetColumn: "完成时间", generator: "dateNow" }], 456)).toEqual([
      { databaseId: "av-1", sourceColumnId: "source", targetColumnId: "target", itemId: "row-3", value: { type: "date", date: { content: 456, isNotEmpty: true, isNotTime: false } } },
    ]);
  });

  it("plans unchecked rows when Is false is selected", () => {
    expect(planDateBindingActions(av, [{ sourceColumn: "完成", operator: "Is false", targetColumn: "完成时间", generator: "dateNow" }], 456).map((action) => action.itemId)).toEqual(["row-2"]);
  });
});
