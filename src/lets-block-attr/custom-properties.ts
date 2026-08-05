export const LEGACY_DEFAULT_CUSTOM_PROPERTIES = `custom-createdAt|\u521b\u5efa\u65f6\u95f4
custom-updatedAt
custom-diary-weather-type
custom-diary-temperature
custom-diary-air-quality
custom-diary-wind-power
custom-diary-pm25`;

export const DEFAULT_CUSTOM_PROPERTIES = `custom-qb-id|qb-id
custom-qb-type|qb-type`;

export const DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES = `NodeDocument
NodeHeading
NodeParagraph
NodeList
NodeListItem
NodeBlockquote
NodeSuperBlock`;

export interface DisplayedCustomProperty {
  key: string;
  label: string;
}

const CUSTOM_ATTRIBUTE_PATTERN = /^custom-[a-z0-9][a-z0-9_-]*$/u;
const BLOCK_TYPE_PATTERN = /^Node[A-Z][A-Za-z0-9]*$/u;
const HIDDEN_CUSTOM_ATTRIBUTES = new Set(["custom-qb-answer"]);

function normalizeLines(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function resolveCustomProperties(value: unknown): {
  value: string;
  migrated: boolean;
} {
  if (typeof value !== "string") {
    return { value: DEFAULT_CUSTOM_PROPERTIES, migrated: false };
  }
  if (normalizeLines(value) === normalizeLines(LEGACY_DEFAULT_CUSTOM_PROPERTIES)) {
    return { value: DEFAULT_CUSTOM_PROPERTIES, migrated: true };
  }
  return { value, migrated: false };
}

export function parseCustomProperties(value: string): DisplayedCustomProperty[] {
  const properties: DisplayedCustomProperty[] = [];
  const seen = new Set<string>();

  for (const rawLine of value.split(/\r?\n/gu)) {
    const [rawKey, ...labelParts] = rawLine.split("|");
    const key = rawKey.trim().toLowerCase();
    if (
      !CUSTOM_ATTRIBUTE_PATTERN.test(key)
      || HIDDEN_CUSTOM_ATTRIBUTES.has(key)
      || seen.has(key)
    ) continue;

    seen.add(key);
    properties.push({ key, label: labelParts.join("|").trim() });
  }

  return properties;
}

export function parseCustomPropertyBlockTypes(value: string): string[] {
  const blockTypes: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of value.split(/\r?\n/gu)) {
    const blockType = rawLine.trim();
    if (!BLOCK_TYPE_PATTERN.test(blockType) || seen.has(blockType)) continue;
    seen.add(blockType);
    blockTypes.push(blockType);
  }

  return blockTypes;
}

function escapeCssString(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, "\\A ");
}

function targetSelector(blockType: string): string {
  if (blockType === "NodeDocument") return ".protyle-wysiwyg";
  return `.protyle-wysiwyg [data-node-id][data-type="${blockType}"]`;
}

export function buildCustomPropertiesCss(
  customProperties: string,
  customPropertyBlockTypes: string,
): string {
  const properties = parseCustomProperties(customProperties);
  const blockTypes = parseCustomPropertyBlockTypes(customPropertyBlockTypes);
  if (properties.length === 0 || blockTypes.length === 0) return "";

  const targets = blockTypes.map(targetSelector);
  const variables = properties.map((_, index) => `--damophus-displayed-attr-${index}`);
  const resetDeclarations = variables.map((variable) => `  ${variable}: "";`).join("\n");
  const propertyRules = properties.map((property, index) => {
    const selectors = targets.map((target) => `${target}[${property.key}]`).join(",\n");
    const label = property.label ? `"${escapeCssString(property.label)}\\A " ` : "";
    return `${selectors} {\n  ${variables[index]}: ${label}attr(${property.key}) "\\A ";\n}`;
  }).join("\n\n");

  const displaySelectors = blockTypes.flatMap((blockType) => {
    const target = targetSelector(blockType);
    const pseudoElement = blockType === "NodeDocument" ? "::before" : "::after";
    return properties.map((property) => `${target}[${property.key}]${pseudoElement}`);
  }).join(",\n");

  return `${targets.join(",\n")} {\n${resetDeclarations}\n}\n\n${propertyRules}\n\n${displaySelectors} {
  content: ${variables.map((variable) => `var(${variable})`).join(" ")};
  display: block;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  margin: 3px 0 5px;
  padding: 2px 6px;
  border-left: 2px solid var(--b3-theme-primary);
  border-radius: 2px;
  background: var(--b3-theme-surface-lighter);
  color: var(--b3-theme-on-surface);
  font-family: var(--b3-font-family-code);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  pointer-events: none;
}`;
}
