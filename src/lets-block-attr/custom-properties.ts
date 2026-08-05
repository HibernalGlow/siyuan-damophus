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

export const DEFAULT_CUSTOM_PROPERTY_STYLE = "";

export interface DisplayedCustomProperty {
  key: string;
  label: string;
}

const CUSTOM_ATTRIBUTE_PATTERN = /^custom-[a-z0-9][a-z0-9_-]*$/u;
const BLOCK_TYPE_PATTERN = /^Node[A-Z][A-Za-z0-9]*$/u;
const HIDDEN_CUSTOM_ATTRIBUTES = new Set(["custom-qb-answer"]);
const SAFE_STYLE_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-style",
  "border-width",
  "box-shadow",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "opacity",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-decoration",
  "text-transform",
]);

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

export function sanitizeCustomPropertyStyle(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return [];
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (
        !SAFE_STYLE_PROPERTIES.has(property)
        || !propertyValue
        || /[{}]/u.test(propertyValue)
        || /attr\s*\(|url\s*\(|expression\s*\(|javascript:/iu.test(propertyValue)
      ) return [];
      return [`${property}: ${propertyValue};`];
    })
    .join("\n");
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

interface PropertyTarget {
  selector: string;
  pseudoElement: "::before" | "::after";
}

function buildCustomPropertiesCssForTargets(
  customProperties: string,
  targets: readonly PropertyTarget[],
  customStyle: string,
): string {
  const properties = parseCustomProperties(customProperties);
  if (properties.length === 0 || targets.length === 0) return "";

  const targetSelectors = targets.map(({ selector }) => selector);
  const variables = properties.map((_, index) => `--damophus-displayed-attr-${index}`);
  const resetDeclarations = variables.map((variable) => `  ${variable}: "";`).join("\n");
  const propertyRules = properties.map((property, index) => {
    const selectors = targetSelectors.map((target) => `${target}[${property.key}]`).join(",\n");
    const label = property.label ? `"${escapeCssString(property.label)}\\00a0" ` : "";
    return `${selectors} {\n  ${variables[index]}: ${label}attr(${property.key});\n}`;
  }).join("\n\n");

  const displaySelectors = targets.flatMap(({ selector, pseudoElement }) => (
    properties.map((property) => `${selector}[${property.key}]${pseudoElement}`)
  )).join(",\n");
  const safeCustomStyle = sanitizeCustomPropertyStyle(customStyle);
  const customDeclarations = safeCustomStyle
    ? `\n  ${safeCustomStyle.replace(/\n/gu, "\n  ")}`
    : "";

  return `${targetSelectors.join(",\n")} {\n${resetDeclarations}\n}\n\n${propertyRules}\n\n${displaySelectors} {
  content: ${variables.map((variable) => `var(${variable})`).join(' "  \\00b7  " ')};
  display: block;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  margin: 4px 0 3px;
  padding: 3px 8px;
  border: 1px solid var(--b3-theme-outline-variant, #d7dce3);
  border-left: 2px solid var(--b3-theme-primary, #3573f0);
  border-radius: 4px;
  background: color-mix(in srgb, var(--b3-theme-primary, #3573f0) 7%, transparent);
  color: var(--b3-theme-on-surface, #202124);
  font-family: var(--b3-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  pointer-events: none;${customDeclarations}
}`;
}

export function buildCustomPropertiesCss(
  customProperties: string,
  customPropertyBlockTypes: string,
  customStyle = DEFAULT_CUSTOM_PROPERTY_STYLE,
): string {
  const blockTypes = parseCustomPropertyBlockTypes(customPropertyBlockTypes);
  const targets = blockTypes.map((blockType): PropertyTarget => ({
    selector: targetSelector(blockType),
    pseudoElement: blockType === "NodeDocument" ? "::before" : "::after",
  }));
  return buildCustomPropertiesCssForTargets(customProperties, targets, customStyle);
}

export function buildCustomPropertiesPreviewCss(
  customProperties: string,
  customStyle = DEFAULT_CUSTOM_PROPERTY_STYLE,
): string {
  return buildCustomPropertiesCssForTargets(
    customProperties,
    [{ selector: ".damophus-block-attr-preview__sample", pseudoElement: "::after" }],
    customStyle,
  );
}
