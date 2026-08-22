const DOCS_FLOW_BASE_URL = "siyuan://plugins/sy-docs-flow/open-rule";

export type DocumentFlowRule =
  | "ChildDocument"
  | "SQL"
  | "IdList"
  | "DocBacklinks"
  | "DocBackmentions"
  | "OffspringDocument"
  | "BlockBacklinks"
  | "JS"
  | "DailyNote";

function normalizeInput(rule: DocumentFlowRule, input: string | readonly string[]): string {
  if (rule === "SQL") return String(input).trim();
  if (rule === "IdList") return Array.isArray(input) ? input.join(",") : String(input).split(/[\s,，]+/u).filter(Boolean).join(",");
  if (rule === "JS") return String(input);
  return Array.isArray(input) ? String(input[0] ?? "") : String(input);
}

export function buildDocumentFlowUrl(
  rule: DocumentFlowRule,
  input: string | readonly string[],
  title?: string,
): string {
  const params = new URLSearchParams({ ruleType: rule, ruleInput: normalizeInput(rule, input) });
  if (title) params.set("ruleTitle", title);
  return `${DOCS_FLOW_BASE_URL}?${params.toString()}`;
}

export function openDocumentFlow(
  rule: DocumentFlowRule,
  input: string | readonly string[],
  title?: string,
): void {
  window.open(buildDocumentFlowUrl(rule, input, title));
}
