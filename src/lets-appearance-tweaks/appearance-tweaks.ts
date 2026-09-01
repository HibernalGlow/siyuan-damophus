export const APPEARANCE_TWEAKS_STYLE_ID = "damophus-appearance-tweaks-style";

export interface AppearanceTweaksSettings {
  browserMobileFontSize: boolean;
  browserMobileEditorFontSize: number;
  browserDesktopFontSize: boolean;
  browserDesktopEditorFontSize: number;
  workspace: boolean;
  hideDockSplit: boolean;
  tags: boolean;
  references: boolean;
  tagFontSize: number;
  tagRadius: number;
  tagPaddingX: number;
  tagPaddingBottom: number;
  tagColor: number;
  referenceFontSize: number;
  referenceRadius: number;
  referencePaddingX: number;
  referencePaddingY: number;
  referenceColorMode: "inverse" | "accent";
}

export const DEFAULT_APPEARANCE_TWEAKS_SETTINGS: AppearanceTweaksSettings = {
  browserMobileFontSize: false,
  browserMobileEditorFontSize: 18,
  browserDesktopFontSize: false,
  browserDesktopEditorFontSize: 16,
  workspace: true,
  hideDockSplit: true,
  tags: true,
  references: true,
  tagFontSize: 90,
  tagRadius: 3,
  tagPaddingX: 6,
  tagPaddingBottom: 2,
  tagColor: 7,
  referenceFontSize: 65,
  referenceRadius: 5,
  referencePaddingX: 3,
  referencePaddingY: 1,
  referenceColorMode: "inverse",
};

const numberSetting = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function resolveAppearanceTweaksSettings(input: Partial<Record<keyof AppearanceTweaksSettings, unknown>> = {}): AppearanceTweaksSettings {
  return {
    browserMobileFontSize: typeof input.browserMobileFontSize === "boolean" ? input.browserMobileFontSize : false,
    browserMobileEditorFontSize: numberSetting(input.browserMobileEditorFontSize, 18, 9, 72),
    browserDesktopFontSize: typeof input.browserDesktopFontSize === "boolean" ? input.browserDesktopFontSize : false,
    browserDesktopEditorFontSize: numberSetting(input.browserDesktopEditorFontSize, 16, 9, 72),
    workspace: typeof input.workspace === "boolean" ? input.workspace : true,
    hideDockSplit: typeof input.hideDockSplit === "boolean" ? input.hideDockSplit : true,
    tags: typeof input.tags === "boolean" ? input.tags : true,
    references: typeof input.references === "boolean" ? input.references : true,
    tagFontSize: numberSetting(input.tagFontSize, 90, 70, 120),
    tagRadius: numberSetting(input.tagRadius, 3, 0, 12),
    tagPaddingX: numberSetting(input.tagPaddingX, 6, 0, 12),
    tagPaddingBottom: numberSetting(input.tagPaddingBottom, 2, 0, 6),
    tagColor: numberSetting(input.tagColor, 7, 1, 13),
    referenceFontSize: numberSetting(input.referenceFontSize, 65, 50, 100),
    referenceRadius: numberSetting(input.referenceRadius, 5, 0, 12),
    referencePaddingX: numberSetting(input.referencePaddingX, 3, 0, 10),
    referencePaddingY: numberSetting(input.referencePaddingY, 1, 0, 6),
    referenceColorMode: input.referenceColorMode === "accent" ? "accent" : "inverse",
  };
}

export function createAppearanceTweaksCss(input: Partial<Record<keyof AppearanceTweaksSettings, unknown>> = {}): string {
  const settings = resolveAppearanceTweaksSettings(input);
  const referenceColor = settings.referenceColorMode === "accent"
    ? "color: var(--b3-theme-on-primary) !important; background-color: var(--b3-theme-primary) !important;"
    : "color: var(--b3-theme-background) !important; background-color: var(--b3-theme-on-background) !important;";
  return [
    settings.browserMobileFontSize && `html[data-frontend="browser-mobile"] { --b3-font-size-editor: ${settings.browserMobileEditorFontSize}px; }`,
    settings.browserDesktopFontSize && `html[data-frontend="browser-desktop"] { --b3-font-size-editor: ${settings.browserDesktopEditorFontSize}px; }`,
    settings.workspace && `#toolbar #barWorkspace .toolbar__text { font-size: 0 !important; }\n#toolbar #barWorkspace { outline: 0 !important; }\n#toolbar #barWorkspace svg.toolbar__svg { display: none !important; }`,
    settings.hideDockSplit && `.dock__split { height: stretch; opacity: 0; }`,
    settings.tags && `.protyle-wysiwyg span[data-type="tag"] { font-size: ${settings.tagFontSize}% !important; border-radius: ${settings.tagRadius}px !important; padding: 0 ${settings.tagPaddingX}px ${settings.tagPaddingBottom}px !important; color: var(--b3-theme-on-background) !important; border-bottom: 0 !important; background-color: var(--b3-font-background${settings.tagColor}) !important; }\n.protyle-wysiwyg span[data-type="tag"]::before { content: "#" !important; }\n.export-img span[data-type="tag"]::before { content: "" !important; }`,
    settings.references && `.protyle-wysiwyg [data-node-id] span[data-type*="block-ref"][data-type*="sup"], .protyle-wysiwyg [data-node-id] span[data-type*="block-ref"][data-type*="sub"] { font-size: ${settings.referenceFontSize}% !important; ${referenceColor} border-radius: ${settings.referenceRadius}px !important; padding: ${settings.referencePaddingY}px ${settings.referencePaddingX}px !important; border-bottom: 0 !important; }\n.protyle-attr--refcount { background-color: var(--b3-theme-surface) !important; }`,
  ].filter(Boolean).join("\n");
}

export function resolvePreviewEditorFontSize(settings: AppearanceTweaksSettings, mobileUi: boolean): number {
  const mobileCandidate: [boolean, number] = [settings.browserMobileFontSize, settings.browserMobileEditorFontSize];
  const desktopCandidate: [boolean, number] = [settings.browserDesktopFontSize, settings.browserDesktopEditorFontSize];
  const candidates = mobileUi ? [mobileCandidate, desktopCandidate] : [desktopCandidate, mobileCandidate];
  for (const [enabled, size] of candidates) {
    if (enabled) return size;
  }
  return 16;
}

export class AppearanceTweaksStyles {
  constructor(private readonly targetDocument: Document = document) {}

  start(settings: Partial<AppearanceTweaksSettings> = {}): void {
    const css = createAppearanceTweaksCss(settings);
    let style = this.targetDocument.getElementById(APPEARANCE_TWEAKS_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = this.targetDocument.createElement("style");
      style.id = APPEARANCE_TWEAKS_STYLE_ID;
      this.targetDocument.head.append(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  destroy(): void {
    this.targetDocument.getElementById(APPEARANCE_TWEAKS_STYLE_ID)?.remove();
  }
}
