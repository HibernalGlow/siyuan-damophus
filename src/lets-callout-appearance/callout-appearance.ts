export const CALLOUT_APPEARANCE_STYLE_ID = "damophus-callout-appearance-style";
export const CALLOUT_ENHANCE_STYLE_ID = "callout-enhance-dynamic-styles";
export const CALLOUT_ENHANCE_STATE_ATTRIBUTE = "data-damophus-callout-enhance";

export interface CalloutAppearanceSettings {
  followCalloutTextColor: boolean;
  paddingTop: number;
  paddingX: number;
  paddingBottom: number;
  radius: number;
  surfaceOpacity: number;
  outlineOpacity: number;
  titleSize: number;
  titleWeight: number;
  palette: boolean;
  contentPadding: boolean;
  removeQuoteShadow: boolean;
  removeEmbedOutline: boolean;
  riffMarker: boolean;
  flashcardLeftHighlightFix: boolean;
}

export const DEFAULT_CALLOUT_APPEARANCE_SETTINGS: CalloutAppearanceSettings = {
  followCalloutTextColor: false,
  paddingTop: 16,
  paddingX: 16,
  paddingBottom: 10,
  radius: 11,
  surfaceOpacity: 5,
  outlineOpacity: 8,
  titleSize: 16,
  titleWeight: 500,
  palette: true,
  contentPadding: true,
  removeQuoteShadow: true,
  removeEmbedOutline: true,
  riffMarker: true,
  flashcardLeftHighlightFix: false,
};

type NumericCalloutAppearanceSetting = Exclude<keyof CalloutAppearanceSettings, "followCalloutTextColor" | "palette" | "contentPadding" | "removeQuoteShadow" | "removeEmbedOutline" | "riffMarker" | "flashcardLeftHighlightFix">;

const SETTING_LIMITS = {
  paddingTop: [8, 24],
  paddingX: [8, 28],
  paddingBottom: [4, 20],
  radius: [0, 20],
  surfaceOpacity: [0, 16],
  outlineOpacity: [0, 24],
  titleSize: [12, 20],
  titleWeight: [400, 700],
} satisfies Record<NumericCalloutAppearanceSetting, readonly [number, number]>;

const EDITOR_CALLOUT_SELECTORS = [
  ':root body .protyle-wysiwyg .callout[data-type="NodeCallout"]',
  ':root body .b3-typography .callout[data-type="NodeCallout"]',
];

function clampSetting(
  key: NumericCalloutAppearanceSetting,
  value: unknown,
): number {
  const fallback = DEFAULT_CALLOUT_APPEARANCE_SETTINGS[key];
  if (value === undefined || value === null || value === "") return fallback;
  const numericValue = Number(value);
  const [minimum, maximum] = SETTING_LIMITS[key];
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, numericValue));
}

export function resolveCalloutAppearanceSettings(
  settings: Partial<Record<keyof CalloutAppearanceSettings, unknown>> = {},
): CalloutAppearanceSettings {
  return {
    followCalloutTextColor: settings.followCalloutTextColor === true
      || settings.followCalloutTextColor === "true",
    paddingTop: clampSetting("paddingTop", settings.paddingTop),
    paddingX: clampSetting("paddingX", settings.paddingX),
    paddingBottom: clampSetting("paddingBottom", settings.paddingBottom),
    radius: clampSetting("radius", settings.radius),
    surfaceOpacity: clampSetting("surfaceOpacity", settings.surfaceOpacity),
    outlineOpacity: clampSetting("outlineOpacity", settings.outlineOpacity),
    titleSize: clampSetting("titleSize", settings.titleSize),
    titleWeight: clampSetting("titleWeight", settings.titleWeight),
    palette: settings.palette !== false && settings.palette !== "false",
    contentPadding: settings.contentPadding !== false && settings.contentPadding !== "false",
    removeQuoteShadow: settings.removeQuoteShadow !== false && settings.removeQuoteShadow !== "false",
    removeEmbedOutline: settings.removeEmbedOutline !== false && settings.removeEmbedOutline !== "false",
    riffMarker: settings.riffMarker !== false && settings.riffMarker !== "false",
    flashcardLeftHighlightFix: settings.flashcardLeftHighlightFix === true
      || settings.flashcardLeftHighlightFix === "true",
  };
}

const subtypeSelectors = (subtypes: string[]): string => EDITOR_CALLOUT_SELECTORS
  .flatMap((selector) => subtypes.map((subtype) => `${selector}[data-subtype="${subtype}" i]`))
  .join(",\n");

const subtypeTitleSelectors = (subtypes: string[]): string => EDITOR_CALLOUT_SELECTORS
  .flatMap((selector) => subtypes.map(
    (subtype) => `${selector}[data-subtype="${subtype}" i] > .callout-info > .callout-title`,
  ))
  .join(",\n");

const titleSelectors = EDITOR_CALLOUT_SELECTORS
  .map((selector) => `${selector} > .callout-info > .callout-title`)
  .join(",\n");

const nativePseudoSelectors = EDITOR_CALLOUT_SELECTORS
  .map((selector) => selector.replace(":root", `:root:not([${CALLOUT_ENHANCE_STATE_ATTRIBUTE}])`) + "::before")
  .join(",\n");

const nativeIconSelectors = EDITOR_CALLOUT_SELECTORS
  .map((selector) => selector.replace(":root", `:root:not([${CALLOUT_ENHANCE_STATE_ATTRIBUTE}])`) + " .callout-icon")
  .join(",\n");

const enhancedPseudoSelectors = EDITOR_CALLOUT_SELECTORS
  .map((selector) => selector.replace(":root", `:root[${CALLOUT_ENHANCE_STATE_ATTRIBUTE}]`) + "::before")
  .join(",\n");

const directContentSelectors = EDITOR_CALLOUT_SELECTORS
  .flatMap((selector) => [
    `${selector} > .callout-info`,
    `${selector} > .callout-content`,
  ])
  .join(",\n");

const directBodySelectors = EDITOR_CALLOUT_SELECTORS
  .map((selector) => `${selector}[data-subtype] > .callout-content`)
  .join(",\n");

export function createCalloutAppearanceCss(
  input: Partial<Record<keyof CalloutAppearanceSettings, unknown>> = {},
): string {
  const settings = resolveCalloutAppearanceSettings(input);
  const surfaceAlpha = settings.surfaceOpacity / 100;
  const outlineAlpha = settings.outlineOpacity / 100;
  const textColorCss = settings.followCalloutTextColor
    ? `
${directBodySelectors} {
  color: inherit !important;
}
`
    : "";
  const paletteCss = settings.palette ? Array.from({ length: 13 }, (_, index) => {
    const color = index + 1;
    return `.bq[style*="background${color})"] { border: none !important; background-color: var(--b3-bq-background${color}) !important; box-shadow: 0 0 0 2px var(--b3-font-background${color}) inset !important; }`;
  }).join("\n") + `\n.bq[style*="error"] { border: none !important; background-color: var(--b3-bq-background13) !important; box-shadow: 0 0 0 2px var(--b3-font-background13) inset !important; }\n.bq[style*="warning"] { border: none !important; background-color: var(--b3-bq-background6) !important; box-shadow: 0 0 0 2px var(--b3-font-background6) inset !important; }\n.bq[style*="info"] { border: none !important; background-color: var(--b3-bq-background10) !important; box-shadow: 0 0 0 2px var(--b3-font-background10) inset !important; }\n.bq[style*="success"] { border: none !important; background-color: var(--b3-bq-background8) !important; box-shadow: 0 0 0 2px var(--b3-font-background8) inset !important; }` : "";
  const legacyCss = [
    paletteCss,
    settings.contentPadding ? `:is(.b3-typography,.protyle-wysiwyg) .callout-content { padding-inline-start: 4px; }` : "",
    settings.removeQuoteShadow ? `.protyle-wysiwyg [data-node-id][style*="--b3-font-background1)"] { box-shadow: none !important; filter: none !important; }` : "",
    settings.removeEmbedOutline ? `.protyle-wysiwyg [data-node-id][style*="--b3-font-background1)"] { outline: none !important; }` : "",
    settings.riffMarker ? `:root body .protyle-wysiwyg .callout[data-type="NodeCallout"][custom-riff-decks] { box-shadow: 2px 0 0 0 var(--b3-protyle-inline-mark-background) inset !important; }` : "",
    settings.flashcardLeftHighlightFix ? `:root body .card__block .protyle-wysiwyg .callout[data-type="NodeCallout"][custom-riff-decks] { box-shadow: 2px 0 0 0 var(--b3-protyle-inline-mark-background) inset !important; }` : "",
  ].filter(Boolean).join("\n");

  return `
${EDITOR_CALLOUT_SELECTORS.join(",\n")} {
  --callout-shell-padding-top: ${settings.paddingTop}px !important;
  --callout-shell-padding-right: ${settings.paddingX}px !important;
  --callout-shell-padding-bottom: ${settings.paddingBottom}px !important;
  --callout-shell-padding-left: ${settings.paddingX}px !important;
  --callout-header-width-offset: 0px !important;
  --callout-header-height: 28px !important;
  --callout-header-y-adjust: 0px !important;
  --callout-title-font-weight: ${settings.titleWeight} !important;
  --callout-title-font-size: ${settings.titleSize}px !important;
  --callout-title-line-height: 1.45 !important;
  --callout-title-opacity: 0.86 !important;
  --callout-icon-left: ${settings.paddingX}px !important;
  --callout-icon-title-gap: 8px !important;
  --callout-left-accent-width: 0px !important;
  --callout-body-padding-x: 0px !important;
  --callout-body-padding-bottom: 0px !important;
  --callout-body-gap-top: 4px !important;
  --callout-header-background: transparent !important;
  --callout-body-background: transparent !important;
  --callout-border-radius: ${settings.radius}px !important;
  --callout-border-width: 0px !important;

  box-sizing: border-box !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  padding: ${settings.paddingTop}px ${settings.paddingX}px ${settings.paddingBottom}px !important;
  margin-block: 0.4em !important;
  border: 0 !important;
  border-radius: ${settings.radius}px !important;
  outline: 0.5px solid color-mix(in srgb, currentColor ${settings.outlineOpacity}%, transparent) !important;
  outline-color: oklch(from currentColor l c h / ${outlineAlpha}) !important;
  outline-offset: -0.5px !important;
  background: color-mix(in srgb, currentColor ${settings.surfaceOpacity}%, transparent) !important;
  background: oklch(from currentColor l c h / ${surfaceAlpha}) !important;
  box-shadow: none !important;
}

${directContentSelectors} {
  box-sizing: border-box !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

${titleSelectors} {
  font-size: ${settings.titleSize}px !important;
  font-weight: ${settings.titleWeight} !important;
  line-height: 1.45 !important;
  opacity: 0.86 !important;
}

${subtypeSelectors(["NOTE", "Info"])} {
  --local-color: var(--b3-callout-note) !important;
  color: var(--b3-callout-note) !important;
}

${subtypeSelectors(["TIP"])} {
  --local-color: var(--b3-callout-tip) !important;
  color: var(--b3-callout-tip) !important;
}

${subtypeSelectors(["IMPORTANT"])} {
  --local-color: var(--b3-callout-important) !important;
  color: var(--b3-callout-important) !important;
}

${subtypeSelectors(["WARNING", "Question"])} {
  --local-color: var(--b3-callout-warning) !important;
  color: var(--b3-callout-warning) !important;
}

${subtypeSelectors(["CAUTION"])} {
  --local-color: var(--b3-callout-caution) !important;
  color: var(--b3-callout-caution) !important;
}

${subtypeSelectors(["Quote"])} {
  --local-color: var(--b3-theme-on-surface) !important;
  color: var(--b3-theme-on-surface) !important;
}

${subtypeTitleSelectors(["NOTE", "Info", "TIP", "IMPORTANT", "WARNING", "Question", "CAUTION", "Quote"])} {
  color: inherit !important;
}
${textColorCss}

${legacyCss}

${nativePseudoSelectors} {
  display: none !important;
}

${nativeIconSelectors} {
  display: flex !important;
}

${enhancedPseudoSelectors} {
  display: var(--callout-icon-before-display, inline-block) !important;
}
`;
}

export const CALLOUT_APPEARANCE_CSS = createCalloutAppearanceCss();

export class CalloutAppearanceStyles {
  private enhanceStyleObserver: MutationObserver | undefined;

  constructor(private readonly targetDocument: Document = document) {}

  private syncEnhanceState(): void {
    const active = this.targetDocument.getElementById(CALLOUT_ENHANCE_STYLE_ID) !== null;
    this.targetDocument.documentElement.toggleAttribute(CALLOUT_ENHANCE_STATE_ATTRIBUTE, active);
  }

  start(settings: Partial<Record<keyof CalloutAppearanceSettings, unknown>> = {}): void {
    this.syncEnhanceState();
    if (!this.enhanceStyleObserver) {
      const MutationObserverConstructor = this.targetDocument.defaultView?.MutationObserver;
      if (MutationObserverConstructor) {
        this.enhanceStyleObserver = new MutationObserverConstructor(() => this.syncEnhanceState());
        this.enhanceStyleObserver.observe(this.targetDocument.head, { childList: true });
      }
    }

    const css = createCalloutAppearanceCss(settings);
    const mounted = this.targetDocument.getElementById(CALLOUT_APPEARANCE_STYLE_ID);
    if (mounted) {
      if (mounted.textContent !== css) mounted.textContent = css;
      return;
    }

    const style = this.targetDocument.createElement("style");
    style.id = CALLOUT_APPEARANCE_STYLE_ID;
    style.textContent = css;
    this.targetDocument.head.append(style);
  }

  destroy(): void {
    this.enhanceStyleObserver?.disconnect();
    this.enhanceStyleObserver = undefined;
    this.targetDocument.documentElement.removeAttribute(CALLOUT_ENHANCE_STATE_ATTRIBUTE);
    this.targetDocument.getElementById(CALLOUT_APPEARANCE_STYLE_ID)?.remove();
  }
}
