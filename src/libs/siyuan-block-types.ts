export type SiyuanBlockTypeGroup = "text" | "structure" | "embed";

export interface SiyuanBlockTypeOption {
  value: string;
  label: string;
  group: SiyuanBlockTypeGroup;
  icon: string;
}

export const SIYUAN_BLOCK_TYPES: readonly SiyuanBlockTypeOption[] = [
  { value: "NodeParagraph", label: "settings.blockType.paragraph", group: "text", icon: "iconParagraph" },
  { value: "NodeHeading", label: "settings.blockType.heading", group: "text", icon: "iconHeadings" },
  { value: "NodeCodeBlock", label: "settings.blockType.codeBlock", group: "text", icon: "iconCode" },
  { value: "NodeMathBlock", label: "settings.blockType.mathBlock", group: "text", icon: "iconMath" },
  { value: "NodeTable", label: "settings.blockType.table", group: "text", icon: "iconTable" },
  { value: "NodeThematicBreak", label: "settings.blockType.thematicBreak", group: "text", icon: "iconLine" },
  { value: "NodeYamlFrontMatter", label: "settings.blockType.yamlFrontMatter", group: "text", icon: "iconCode" },
  { value: "NodeDocument", label: "settings.blockType.document", group: "structure", icon: "iconFile" },
  { value: "NodeBlockquote", label: "settings.blockType.blockquote", group: "structure", icon: "iconQuote" },
  { value: "NodeCallout", label: "settings.blockType.callout", group: "structure", icon: "iconCallout" },
  { value: "NodeList", label: "settings.blockType.list", group: "structure", icon: "iconList" },
  { value: "NodeListItem", label: "settings.blockType.listItem", group: "structure", icon: "iconListItem" },
  { value: "NodeSuperBlock", label: "settings.blockType.superBlock", group: "structure", icon: "iconSuper" },
  { value: "NodeAttributeView", label: "settings.blockType.attributeView", group: "structure", icon: "iconDatabase" },
  { value: "NodeBlockQueryEmbed", label: "settings.blockType.queryEmbed", group: "embed", icon: "iconSQL" },
  { value: "NodeHTMLBlock", label: "settings.blockType.htmlBlock", group: "embed", icon: "iconHTML5" },
  { value: "NodeWidget", label: "settings.blockType.widget", group: "embed", icon: "iconBoth" },
  { value: "NodeIFrame", label: "settings.blockType.iframe", group: "embed", icon: "iconGlobe" },
  { value: "NodeVideo", label: "settings.blockType.video", group: "embed", icon: "iconVideo" },
  { value: "NodeAudio", label: "settings.blockType.audio", group: "embed", icon: "iconRecord" },
] as const;

const KNOWN_BLOCK_TYPES = new Set(SIYUAN_BLOCK_TYPES.map((option) => option.value));

/** Accept both new arrays and legacy comma/newline separated settings. */
export function normalizeSiyuanBlockTypes(value: unknown, fallback: readonly string[] = []): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n\s]+/u)
      : fallback;
  const normalized = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const blockType = candidate.trim();
    if (KNOWN_BLOCK_TYPES.has(blockType)) normalized.add(blockType);
  }
  return SIYUAN_BLOCK_TYPES.map((option) => option.value).filter((blockType) => normalized.has(blockType));
}

export function siyuanBlockTypeOptions(group: SiyuanBlockTypeGroup): readonly SiyuanBlockTypeOption[] {
  return SIYUAN_BLOCK_TYPES.filter((option) => option.group === group);
}
