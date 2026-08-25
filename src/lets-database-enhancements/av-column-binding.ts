import { getBlockAttrsStrict, requestStrict, setBlockAttrs } from "@/api";
import { getLogger } from "@/libs/logger";

const log = getLogger("lets-database-enhancements:av-column-binding");

export const DATE_NOW_GENERATOR = "dateNow" as const;
export const COLUMN_BINDINGS_ATTR = "custom-damophus-column-bindings";
export const BINDING_RULES_VERSION = 1 as const;
export const NATIVE_FILTER_OPERATORS = ["Is true", "Is false", "Is empty", "Is not empty"] as const;
export type NativeFilterOperator = typeof NATIVE_FILTER_OPERATORS[number];

export interface ColumnBindingRule {
  sourceColumn: string;
  operator: NativeFilterOperator;
  targetColumn: string;
  generator: typeof DATE_NOW_GENERATOR;
}

export interface ColumnBindingConfig {
  version: typeof BINDING_RULES_VERSION;
  rules: ColumnBindingRule[];
}

export interface AttributeViewKey {
  id: string;
  name: string;
  type: string;
}

export interface AttributeViewValue {
  id?: string;
  keyID: string;
  blockID?: string;
  type?: string;
  block?: { id?: string; content?: string };
  text?: { content?: string };
  number?: { content?: number; isNotEmpty?: boolean };
  date?: { content?: number; isNotEmpty?: boolean };
  mSelect?: Array<{ content?: string }>;
  relation?: { blockIDs?: string[] };
  mAsset?: Array<{ content?: string }>;
  checkbox?: { checked?: boolean };
  [key: string]: unknown;
}

export interface AttributeViewKeyValues {
  key: AttributeViewKey;
  values: AttributeViewValue[];
}

export interface RawAttributeView {
  id: string;
  keyValues: AttributeViewKeyValues[];
}

export interface ColumnBindingAction {
  databaseId: string;
  sourceColumnId: string;
  targetColumnId: string;
  itemId: string;
  value: {
    type: "date";
    date: { content: number; isNotEmpty: true; isNotTime: false };
  };
}

export function normalizeBindingRules(value: unknown): ColumnBindingRule[] {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).rules
    : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ColumnBindingRule[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const sourceColumn = String(candidate.sourceColumn ?? "").trim();
    const targetColumn = String(candidate.targetColumn ?? "").trim();
    const operator = NATIVE_FILTER_OPERATORS.includes(candidate.operator as NativeFilterOperator)
      ? candidate.operator as NativeFilterOperator
      : "Is true";
    const generator = candidate.generator === DATE_NOW_GENERATOR ? DATE_NOW_GENERATOR : null;
    if (!sourceColumn || !targetColumn || !generator) return [];
    return [{ sourceColumn, operator, targetColumn, generator }];
  });
}

export function parseBindingConfig(value: unknown): ColumnBindingConfig {
  return { version: BINDING_RULES_VERSION, rules: normalizeBindingRules(value) };
}

export function serializeBindingConfig(rules: readonly ColumnBindingRule[]): string {
  return JSON.stringify({ version: BINDING_RULES_VERSION, rules: normalizeBindingRules({ rules }) });
}

export function resolveColumn(columns: readonly AttributeViewKey[], reference: string): AttributeViewKey | undefined {
  const normalized = reference.trim();
  if (!normalized) return undefined;
  return columns.find((column) => column.id === normalized) ?? columns.find((column) => column.name === normalized);
}

export function isAttributeViewValueEmpty(value: AttributeViewValue | undefined): boolean {
  if (!value) return true;
  switch (value.type) {
    case "checkbox": return value.checkbox?.checked !== true;
    case "number": return value.number?.isNotEmpty === false || value.number?.content === undefined;
    case "date": return value.date?.isNotEmpty === false || value.date?.content === undefined;
    case "text":
    case "url":
    case "email":
    case "phone": return !String(value.text?.content ?? "").trim();
    case "block": return !String(value.block?.id ?? value.block?.content ?? "").trim();
    case "relation": return (value.relation?.blockIDs?.length ?? 0) === 0;
    case "select":
    case "mSelect":
    case "mAsset": return (!Array.isArray(value.mSelect) && !Array.isArray(value.mAsset)) || (value.mSelect?.length ?? value.mAsset?.length ?? 0) === 0;
    default: return false;
  }
}

export function matchesBindingOperator(value: AttributeViewValue | undefined, operator: NativeFilterOperator): boolean {
  if (!value) return operator === "Is empty";
  if (operator === "Is true") return value.type === "checkbox" && value.checkbox?.checked === true;
  if (operator === "Is false") return value.type === "checkbox" && value.checkbox?.checked === false;
  const empty = isAttributeViewValueEmpty(value);
  return operator === "Is empty" ? empty : !empty;
}

function valueByItem(values: readonly AttributeViewValue[]): Map<string, AttributeViewValue> {
  const result = new Map<string, AttributeViewValue>();
  for (const value of values) {
    const itemId = value.blockID || value.id;
    if (itemId) result.set(itemId, value);
  }
  return result;
}

export function planDateBindingActions(av: RawAttributeView, rules: readonly ColumnBindingRule[], now: number): ColumnBindingAction[] {
  const columns = av.keyValues.map(({ key }) => key);
  const actions: ColumnBindingAction[] = [];
  const planned = new Set<string>();
  for (const rule of rules) {
    if (rule.generator !== DATE_NOW_GENERATOR) continue;
    const source = resolveColumn(columns, rule.sourceColumn);
    const target = resolveColumn(columns, rule.targetColumn);
    if (!source || !target || source.id === target.id || target.type !== "date") continue;
    const sourceValues = av.keyValues.find((item) => item.key.id === source.id)?.values ?? [];
    const targetValues = valueByItem(av.keyValues.find((item) => item.key.id === target.id)?.values ?? []);
    for (const sourceValue of sourceValues) {
      const itemId = sourceValue.blockID || sourceValue.id;
      if (!itemId || !matchesBindingOperator(sourceValue, rule.operator)) continue;
      if (!isAttributeViewValueEmpty(targetValues.get(itemId))) continue;
      const actionKey = `${target.id}:${itemId}`;
      if (planned.has(actionKey)) continue;
      planned.add(actionKey);
      actions.push({ databaseId: av.id, sourceColumnId: source.id, targetColumnId: target.id, itemId, value: { type: "date", date: { content: now, isNotEmpty: true, isNotTime: false } } });
    }
  }
  return actions;
}

export class AvColumnBindingManager {
  private enabled = false;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<string>();
  private listening = false;

  updateOptions(options: { enabled: boolean }): void {
    this.enabled = options.enabled;
    if (!this.enabled) this.clearTimers();
  }

  start(): void {
    if (this.listening || typeof document === "undefined") return;
    this.listening = true;
    document.addEventListener("input", this.handleDomSignal, true);
    document.addEventListener("change", this.handleDomSignal, true);
    document.querySelectorAll<HTMLElement>(".av[data-av-id]").forEach((element) => this.schedule(element.dataset.avId || "", element.dataset.nodeId || ""));
  }

  stop(): void {
    if (!this.listening) return;
    document.removeEventListener("input", this.handleDomSignal, true);
    document.removeEventListener("change", this.handleDomSignal, true);
    this.listening = false;
    this.clearTimers();
    this.pending.clear();
  }

  handleWsMain(detail: { cmd?: string; data?: { id?: string } }): void {
    if (!this.enabled || detail.cmd !== "refreshAttributeView") return;
    document.querySelectorAll<HTMLElement>(`.av[data-av-id="${detail.data?.id || ""}"]`).forEach((element) => this.schedule(element.dataset.avId || "", element.dataset.nodeId || ""));
  }

  private readonly handleDomSignal = (event: Event): void => {
    if (!this.enabled) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".av[data-av-id]") : null;
    this.schedule(target?.dataset.avId || "", target?.dataset.nodeId || "");
  };

  private schedule(databaseId: string, blockId: string): void {
    if (!databaseId || !blockId) return;
    const key = `${databaseId}:${blockId}`;
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); void this.process(databaseId, blockId); }, 120));
  }

  private async process(databaseId: string, blockId: string): Promise<void> {
    const processKey = `${databaseId}:${blockId}`;
    if (!this.enabled || this.pending.has(processKey)) return;
    this.pending.add(processKey);
    try {
      const attrs = await getBlockAttrsStrict(blockId);
      const rules = parseBindingConfig(attrs[COLUMN_BINDINGS_ATTR] || "");
      if (!rules.rules.length) return;
      const response = await requestStrict<{ av: RawAttributeView }>("/api/av/getAttributeView", { id: databaseId });
      const actions = planDateBindingActions(response.av, rules.rules, Date.now());
      for (const action of actions) {
        const key = `${action.databaseId}:${action.targetColumnId}:${action.itemId}`;
        if (this.pending.has(key)) continue;
        this.pending.add(key);
        try {
          await requestStrict("/api/av/setAttributeViewBlockAttr", { avID: action.databaseId, keyID: action.targetColumnId, itemID: action.itemId, value: action.value });
        } catch (error) { log.warn("column binding write failed", error); }
        finally { this.pending.delete(key); }
      }
    } catch (error) { log.warn("column binding read failed", error); }
    finally { this.pending.delete(processKey); }
  }

  async saveConfig(blockId: string, rules: readonly ColumnBindingRule[]): Promise<void> {
    await setBlockAttrs(blockId, { [COLUMN_BINDINGS_ATTR]: serializeBindingConfig(rules) });
  }

  private clearTimers(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
