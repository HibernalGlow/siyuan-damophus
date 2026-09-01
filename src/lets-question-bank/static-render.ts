/**
 * Static render pass for non-Protyle question content.
 *
 * The plugin renders question markdown to block DOM via Lute (Md2BlockDOM),
 * which leaves math, code highlighting, and diagram blocks unrendered; the
 * SiYuan editor normally finishes them with its protyle render passes. This
 * module runs those passes on the mounted static DOM.
 *
 * Preferred path: recent kernels expose the editor's real passes to plugins
 * via ProtyleMethod (require("siyuan")); those are used as-is so rendering
 * stays identical to the editor. Fallback path: local replicas below for
 * older kernels, loading KaTeX/hljs/mermaid from the same /stage/protyle CDN
 * with the app's own script ids so cached chunks are reused.
 *
 * Verified DOM shapes (kernel getBlockDOM):
 * - math block: div[data-subtype="math"][data-content] with a placeholder child div
 * - inline math: span[data-type="inline-math"][data-subtype="math"][data-content]
 * - mermaid/flowchart: div.render-node[data-subtype="mermaid|flowchart"][data-content]
 * - code block: div.code-block with .protyle-linenumber__rows and code.hljs
 */

import * as siyuanModule from "siyuan";

const PROTYLE_CDN = "/stage/protyle";
const KATEX_VERSION = "0.16.9";
const HLJS_VERSION = "11.11.2";
const MERMAID_VERSION = "11.13.0";
const FLOWCHART_VERSION = "1.18.0";
const ZWSP = String.fromCharCode(0x200b);

interface KatexLike {
  renderToString(input: string, options: Record<string, unknown>): string;
}

interface HljsLike {
  highlight(code: string, options: {language: string; ignoreIllegals?: boolean}): {value: string};
  getLanguage?(name: string): unknown;
}

interface MermaidLike {
  render(id: string, text: string): Promise<{svg: string}>;
  initialize(options: Record<string, unknown>): void;
  registerExternalDiagrams?(diagrams: unknown[]): Promise<void>;
}

interface FlowchartLike {
  parse(text: string): {drawSVG(target: Element): void};
}

interface DomPurifyLike {
  sanitize(input: string, options?: Record<string, unknown>): string;
}

export interface StaticMathRenderOptions {
  katex?: KatexLike;
  unescapeHtml?: (value: string) => string;
  macros?: Record<string, unknown>;
}

export interface StaticCodeRenderOptions {
  hljs?: HljsLike;
  lineWrap?: boolean;
  ligatures?: boolean;
  lineNumbers?: boolean;
}

export interface StaticDiagramRenderOptions {
  mermaid?: MermaidLike;
  flowchart?: FlowchartLike;
  domPurify?: DomPurifyLike;
  dark?: boolean;
  unescapeHtml?: (value: string) => string;
}

let renderSequence = 0;

function addScript(path: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = path;
    script.async = true;
    script.onload = () => {
      if (!document.getElementById(id)) script.id = id;
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${path}`));
    };
    document.head.append(script);
  });
}

function addStyle(href: string, id: string): void {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = href;
  link.id = id;
  document.head.append(link);
}

function ensureCodeThemeStyles(): void {
  const appearance = window.siyuan?.config?.appearance;
  if (!appearance) return;
  const css = appearance.mode === 0 ? appearance.codeBlockThemeLight : appearance.codeBlockThemeDark;
  const href = `${PROTYLE_CDN}/js/highlight.js/styles/${css || "default"}.min.css?v=${HLJS_VERSION}`;
  const existing = document.getElementById("protyleHljsStyle");
  if (existing && existing.getAttribute("href")?.includes(href)) return;
  existing?.remove();
  addStyle(href, "protyleHljsStyle");
}

function parseMacros(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function unescapeContent(value: string): string {
  return (window as unknown as {Lute?: {UnEscapeHTMLStr?(input: string): string}}).Lute?.UnEscapeHTMLStr?.(value) ?? value;
}

/** Reproduce app/src/protyle/render/mathRender.ts for read-only static DOM. */
export function renderStaticMath(element: Element, options: StaticMathRenderOptions): void {
  const {katex} = options;
  if (!katex) return;
  const targets = element.getAttribute("data-subtype") === "math" && element.getAttribute("data-render") !== "true"
    ? [element]
    : [...element.querySelectorAll('[data-subtype="math"]:not([data-render="true"])')];
  if (targets.length === 0) return;
  const unescapeHtml = options.unescapeHtml ?? unescapeContent;

  for (const target of targets) {
    const isBlock = target.tagName === "DIV";
    target.setAttribute("data-render", "true");
    let rendered: string;
    try {
      rendered = katex.renderToString(unescapeHtml(target.getAttribute("data-content") ?? ""), {
        displayMode: isBlock,
        output: "html",
        macros: options.macros ?? {},
        trust: true,
        strict: (errorCode: string) => (errorCode === "unicodeTextInMathMode" ? "ignore" : "warn"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const slot = isBlock ? target.firstElementChild?.firstElementChild : null;
      if (slot) {
        slot.textContent = message;
        slot.classList.add("ft__error");
      } else {
        target.textContent = message;
        target.classList.add("ft__error");
      }
      continue;
    }

    if (!isBlock) {
      target.classList.remove("ft__error");
      target.innerHTML = rendered;
      continue;
    }
    // Mirrors genRenderFrame + mathRender's block branch so the shared protyle
    // CSS lays the formula out identically (the placeholder child div is the
    // render target in Lute's output).
    const frame = target.firstElementChild;
    if (!frame) {
      target.innerHTML = rendered;
      continue;
    }
    frame.innerHTML = `<span></span><span class="protyle-cursor">${ZWSP}</span>`;
    const slot = frame.firstElementChild;
    if (!slot) {
      target.innerHTML = rendered;
      continue;
    }
    slot.classList.remove("ft__error");
    slot.setAttribute("contenteditable", "false");
    slot.innerHTML = rendered;
    const baseElements = target.querySelectorAll(".base");
    if (baseElements.length > 0) {
      baseElements[baseElements.length - 1].insertAdjacentHTML("afterend", "<span class='fn__flex-1'></span>");
    }
    const newlineElement = target.querySelector<HTMLElement>(".katex-html > .newline");
    if (newlineElement?.parentElement) {
      newlineElement.parentElement.style.display = "block";
    }
  }
}

function diagramRenderTarget(block: HTMLElement): HTMLElement {
  const placeholder = block.firstElementChild;
  if (placeholder instanceof HTMLElement && !placeholder.classList.contains("protyle-attr")) {
    return placeholder;
  }
  const created = document.createElement("div");
  block.prepend(created);
  return created;
}

function diagramError(target: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message.replace(/\n/u, "<br>") : String(error);
  target.innerHTML = `<div class="ft__error">${message}</div>`;
}

/** Reproduce app/src/protyle/render/mermaidRender.ts for static DOM. */
export async function renderStaticMermaid(element: Element, options: StaticDiagramRenderOptions): Promise<void> {
  const {mermaid} = options;
  if (!mermaid) return;
  const blocks = [...element.querySelectorAll<HTMLElement>('[data-subtype="mermaid"]:not([data-render="true"])')];
  if (blocks.length === 0) return;
  const unescapeHtml = options.unescapeHtml ?? unescapeContent;

  if (options.dark !== undefined) {
    mermaid.initialize({
      securityLevel: "loose",
      altFontFamily: "sans-serif",
      fontFamily: "sans-serif",
      startOnLoad: false,
      theme: options.dark ? "dark" : undefined,
      flowchart: {htmlLabels: true, useMaxWidth: true},
      sequence: {useMaxWidth: true, diagramMarginX: 8, diagramMarginY: 8, boxMargin: 8, showSequenceNumbers: true},
      gantt: {leftPadding: 75, rightPadding: 20},
    });
  }

  for (const block of blocks) {
    block.setAttribute("data-render", "true");
    const target = diagramRenderTarget(block);
    const content = block.getAttribute("data-content");
    if (!content) {
      target.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${ZWSP}</span>`;
      continue;
    }
    const id = `mermaid-static-${++renderSequence}`;
    try {
      target.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${ZWSP}</span><div contenteditable="false"><span id="${id}"></span></div>`;
      const result = await mermaid.render(id, unescapeHtml(content));
      let svg = result.svg.replace(/(href|src|xlink:href)\s*=\s*["']\\\\/giu, (_match, p1) => `${p1}="about:blank"`);
      if (options.domPurify) {
        svg = options.domPurify.sanitize(svg, {
          USE_PROFILES: {svg: true, svgFilters: true, mathMl: true},
          ADD_TAGS: ["foreignObject", "use", "style"],
          ADD_ATTR: ["dominant-baseline", "xlink:href", "href"],
          HTML_INTEGRATION_POINTS: {foreignobject: true},
        });
      }
      target.lastElementChild!.innerHTML = svg;
    } catch (error) {
      document.getElementById(id)?.parentElement?.remove();
      diagramError(target, error);
    }
  }
}

/** Reproduce app/src/protyle/render/flowchartRender.ts for static DOM. */
export function renderStaticFlowchart(element: Element, options: StaticDiagramRenderOptions): void {
  const {flowchart} = options;
  if (!flowchart) return;
  const blocks = [...element.querySelectorAll<HTMLElement>('[data-subtype="flowchart"]:not([data-render="true"])')];
  const unescapeHtml = options.unescapeHtml ?? unescapeContent;

  for (const block of blocks) {
    block.setAttribute("data-render", "true");
    const target = diagramRenderTarget(block);
    const content = block.getAttribute("data-content");
    if (!content) {
      target.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${ZWSP}</span>`;
      continue;
    }
    target.innerHTML = `<div contenteditable="false"></div>`;
    const drawTarget = target.lastElementChild!;
    try {
      flowchart.parse(unescapeHtml(content)).drawSVG(drawTarget);
    } catch (error) {
      diagramError(target, error);
    }
  }
}

function resolveCodeLanguage(block: Element, code: Element, hljs: HljsLike): string {
  const candidates = [
    block.getAttribute("data-language") ?? undefined,
    /language-([\w#+.-]+)/u.exec(code.className)?.[1],
    block.querySelector(".protyle-action__language")?.textContent?.trim() || undefined,
  ];
  for (const candidate of candidates) {
    if (candidate && (!hljs.getLanguage || hljs.getLanguage(candidate))) return candidate;
  }
  return "plaintext";
}

/**
 * Reproduce app/src/protyle/render/highlightRender.ts for read-only static DOM.
 * Line numbers use the simple (non-wrapped) branch; wrapped code falls back to
 * hiding the gutter because per-line measurement needs editor-specific layout.
 */
export function renderStaticCode(element: Element, options: StaticCodeRenderOptions): void {
  const {hljs} = options;
  if (!hljs) return;
  const lineWrap = options.lineWrap ?? true;
  const ligatures = options.ligatures ?? true;
  const lineNumbers = options.lineNumbers ?? false;

  for (const block of element.querySelectorAll<HTMLElement>(".code-block")) {
    const code = block.querySelector("code");
    if (!code || code.getAttribute("data-render") === "true") continue;
    code.setAttribute("data-render", "true");

    const language = resolveCodeLanguage(block, code, hljs);
    const lineWrapAttr = block.getAttribute("linewrap");
    const wrapped = lineWrapAttr === "true" || (lineWrapAttr !== "false" && lineWrap);
    const lineNumberAttr = block.getAttribute("linenumber");
    const wantsLineNumbers = lineNumberAttr === "true" || (lineNumberAttr !== "false" && lineNumbers);
    const ligatureAttr = block.getAttribute("ligatures");
    const ligaturesEnabled = ligatureAttr === "true" || (ligatureAttr !== "false" && ligatures);

    const rows = block.querySelector<HTMLElement>(".protyle-linenumber__rows");
    const plainText = code.textContent ?? "";
    if (rows && wantsLineNumbers && !wrapped) {
      rows.className = "protyle-linenumber__rows";
      rows.innerHTML = "<span></span>".repeat(plainText.split(/\r\n|\r|\n/u).length);
      block.style.display = "";
    } else if (rows) {
      rows.className = "fn__none";
      rows.innerHTML = "";
      block.style.display = "block";
    }
    code.classList.add("hljs");
    code.style.setProperty("white-space", wrapped ? "pre-wrap" : "pre");
    code.style.setProperty("word-break", wrapped ? "break-word" : "initial");
    code.style.fontVariantLigatures = ligaturesEnabled ? "normal" : "none";
    code.innerHTML = hljs.highlight(
      plainText + (plainText.endsWith("\n") ? "" : "\n"),
      {language, ignoreIllegals: true},
    ).value;
  }
}

export interface OfficialProtylePasses {
  highlightRender(element: Element, cdn?: string, zoom?: number): void;
  mathRender(element: Element, cdn?: string, maxWidth?: boolean): void;
  mermaidRender(element: Element, cdn?: string): void;
  flowchartRender(element: Element, cdn?: string): void;
  chartRender?(element: Element, cdn?: string): void;
  mindmapRender?(element: Element, cdn?: string): void;
  abcRender?(element: Element, cdn?: string): void;
  plantumlRender?(element: Element, cdn?: string): void;
  graphvizRender?(element: Element, cdn?: string): void;
  htmlRender?(element: Element): void;
}

/**
 * ProtyleMethod is available on recent kernels (SiYuan >= 3.1.x); it hands us
 * the editor's own render implementations. Returns undefined on older kernels,
 * where the local replicas below take over.
 */
export function resolveOfficialPasses(): OfficialProtylePasses | undefined {
  const method = (siyuanModule as unknown as {ProtyleMethod?: OfficialProtylePasses}).ProtyleMethod;
  return method?.mathRender && method.mermaidRender ? method : undefined;
}

function applyOfficialPasses(element: Element, passes: OfficialProtylePasses): void {
  // Order mirrors the app's own static renderer (AgentMessageRenderer.postRender).
  const queue = [
    passes.highlightRender,
    passes.mathRender,
    passes.mermaidRender,
    passes.flowchartRender,
    passes.chartRender,
    passes.mindmapRender,
    passes.abcRender,
    passes.plantumlRender,
    passes.graphvizRender,
    passes.htmlRender,
  ];
  for (const pass of queue) {
    if (!pass) continue;
    try {
      pass.call(passes, element);
    } catch {
      // A failing pass must not block the remaining ones.
    }
  }
}

async function ensureScripts(): Promise<{mermaid?: MermaidLike; flowchart?: FlowchartLike; domPurify?: DomPurifyLike}> {
  if (!window.siyuan?.config) return {};
  const loadMermaid = addScript(`${PROTYLE_CDN}/js/mermaid/mermaid.min.js?v=${MERMAID_VERSION}`, "protyleMermaidScript")
    .then(() => addScript(`${PROTYLE_CDN}/js/mermaid/mermaid-zenuml.min.js?v=0.2.2`, "protyleMermaidZenumlScript"))
    .then(() => {
      const mermaid = (window as unknown as {mermaid?: MermaidLike}).mermaid;
      if (!mermaid?.registerExternalDiagrams) return;
      const zenuml = (window as unknown as {zenuml?: unknown}).zenuml;
      if (zenuml) void mermaid.registerExternalDiagrams([zenuml]).catch(() => undefined);
    })
    .catch(() => undefined);
  const loadFlowchart = addScript(
    `${PROTYLE_CDN}/js/flowchart.js/flowchart.min.js?v=${FLOWCHART_VERSION}`,
    "protyleFlowchartScript",
  ).catch(() => undefined);
  const loadHljs = Promise.all([
    addScript(`${PROTYLE_CDN}/js/highlight.js/highlight.min.js?v=${HLJS_VERSION}`, "protyleHljsScript"),
    addScript(`${PROTYLE_CDN}/js/highlight.js/third-languages.js?v=2.0.1`, "protyleHljsThirdScript"),
  ]).then(() => undefined).catch(() => undefined);
  const loadKatex = Promise.all([
    Promise.resolve(addStyle(`${PROTYLE_CDN}/js/katex/katex.min.css?v=${KATEX_VERSION}`, "protyleKatexStyle")),
    addScript(`${PROTYLE_CDN}/js/katex/katex.min.js?v=${KATEX_VERSION}`, "protyleKatexScript")
      .then(() => addScript(`${PROTYLE_CDN}/js/katex/mhchem.min.js?v=${KATEX_VERSION}`, "protyleKatexMhchemScript")),
  ]).then(() => undefined).catch(() => undefined);
  ensureCodeThemeStyles();
  await Promise.all([loadMermaid, loadFlowchart, loadHljs, loadKatex]);

  const globals = window as unknown as {
    mermaid?: MermaidLike;
    flowchart?: FlowchartLike;
    DOMPurify?: DomPurifyLike;
  };
  return {mermaid: globals.mermaid, flowchart: globals.flowchart, domPurify: globals.DOMPurify};
}

/** Run every pass on a mounted static content container. */
export async function renderStaticContent(element: Element, officialPasses?: OfficialProtylePasses): Promise<void> {
  if (!window.siyuan?.config) return;
  const passes = officialPasses ?? resolveOfficialPasses();
  if (passes) {
    applyOfficialPasses(element, passes);
    return;
  }
  const loaded = await ensureScripts();
  const globals = {...resolveStaticRenderGlobals(), ...loaded};
  renderStaticMath(element, globals);
  renderStaticCode(element, globals);
  renderStaticFlowchart(element, globals);
  await renderStaticMermaid(element, globals);
}

function resolveStaticRenderGlobals() {
  const editor = window.siyuan?.config?.editor ?? {};
  return {
    katex: (window as unknown as {katex?: KatexLike}).katex,
    hljs: (window as unknown as {hljs?: HljsLike}).hljs,
    macros: parseMacros(editor.katexMacros),
    lineWrap: editor.codeLineWrap !== false,
    ligatures: editor.codeLigatures !== false,
    lineNumbers: editor.codeSyntaxHighlightLineNum === true,
    dark: window.siyuan?.config?.appearance?.mode === 1,
    unescapeHtml: unescapeContent,
  };
}

/** Svelte action: finish math/code/diagram rendering after {@html} content mounts. */
export function staticContentRender(node: HTMLElement): {update: () => void; destroy: () => void} {
  const run = () => {
    void renderStaticContent(node);
  };
  run();
  return {
    update: run,
    destroy: () => {},
  };
}
