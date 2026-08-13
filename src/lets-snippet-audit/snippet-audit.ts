export interface SiyuanSnippet {
  id: string;
  name: string;
  type: "css" | "js";
  enabled: boolean;
  disabledInPublish?: boolean;
  content: string;
}

export type SnippetRisk = "low" | "medium" | "high";
export type SnippetPreviewScene = "document" | "callout" | "tag" | "reference" | "database" | "flashcard" | "workspace";

export interface SnippetAnalysis {
  purposeKey: string;
  destinationKey: string;
  risk: SnippetRisk;
  reasonKeys: string[];
  previewScenes: SnippetPreviewScene[];
}

const has = (source: string, pattern: RegExp) => pattern.test(source);

export function analyzeSnippet(snippet: SiyuanSnippet): SnippetAnalysis {
  const source = `${snippet.name}\n${snippet.content}`;
  const reasonKeys: string[] = [];
  let risk: SnippetRisk = "low";
  let purposeKey = snippet.type === "css" ? "genericCss" : "genericJs";
  let destinationKey = snippet.type === "css" ? "appearanceTweaks" : "dedicatedModule";
  const previewScenes: SnippetPreviewScene[] = snippet.type === "css" ? ["document"] : [];

  if (snippet.type === "css") {
    if (has(source, /callout|NodeCallout|引用块|引述块/i)) previewScenes.push("callout");
    if (has(source, /data-type[^\n]*(tag|标签)|标签外观|--tag-color/i)) previewScenes.push("tag");
    if (has(source, /block-ref|块引用|引用样式|protyle-attr--refcount/i)) previewScenes.push("reference");
    if (has(source, /workspace|工作空间|dock__split|侧边栏分隔/i)) previewScenes.push("workspace");
    if (has(source, /flashcard|riff|闪卡|card__/i)) previewScenes.push("flashcard");
    if (has(source, /attribute|数据库|\.av__|data-av-/i)) previewScenes.push("database");
  }

  if (has(source, /callout|NodeCallout|引用块|引述块/i)) {
    purposeKey = "callout";
    destinationKey = "calloutAppearance";
  } else if (has(source, /data-type[^\n]*(tag|标签)|标签外观|--tag-color/i)) {
    purposeKey = "tag";
    destinationKey = "appearanceTweaks";
  } else if (has(source, /block-ref|块引用|引用样式|protyle-attr--refcount/i)) {
    purposeKey = "reference";
    destinationKey = "appearanceTweaks";
  } else if (has(source, /workspace|工作空间|dock__split|侧边栏分隔/i)) {
    purposeKey = "workspace";
    destinationKey = "appearanceTweaks";
  } else if (has(source, /flashcard|riff|闪卡|card__/i)) {
    purposeKey = "flashcard";
    destinationKey = "studyModule";
  } else if (has(source, /attribute|数据库|\.av__|data-av-/i)) {
    purposeKey = "database";
    destinationKey = "dedicatedModule";
  }

  if (has(source, /setInterval\s*\(|BodyEventRunFun|while\s*\(/i)) {
    risk = "high";
    reasonKeys.push("polling");
  }
  if (has(source, /MutationObserver|addEventListener\s*\(/i)) {
    if (risk === "low") risk = "medium";
    reasonKeys.push("globalListener");
  }
  if (has(source, /:has\s*\(/i)) {
    if (risk === "low") risk = "medium";
    reasonKeys.push("hasSelector");
  }
  if (has(source, /\*\s*\{|\.protyle-wysiwyg\s+\*/i)) {
    if (risk === "low") risk = "medium";
    reasonKeys.push("broadSelector");
  }
  if ((snippet.content.match(/!important/g) ?? []).length >= 8) {
    if (risk === "low") risk = "medium";
    reasonKeys.push("manyImportant");
  }
  if (reasonKeys.length === 0) reasonKeys.push("noKnownRisk");
  return { purposeKey, destinationKey, risk, reasonKeys, previewScenes };
}

const SCENE_MARKUP: Record<SnippetPreviewScene, string> = {
  document: `<main class="protyle-wysiwyg" data-node-id="preview-document"><h1 data-type="NodeHeading" class="h1">行政法专题笔记</h1><p data-type="NodeParagraph" class="p">这里展示当前 CSS 在普通思源文档中的效果。</p><blockquote data-type="NodeBlockquote" class="bq">程序正当原则要求行政行为遵循公开、公平和必要程序。</blockquote><ul data-type="NodeList" class="list"><li data-type="NodeListItem" class="li"><span data-type="NodeParagraph" class="p">行政许可</span></li><li data-type="NodeListItem" class="li"><span data-type="NodeParagraph" class="p">行政处罚</span></li></ul><div class="protyle-attr"><span class="protyle-attr--refcount">2 个引用</span></div></main>`,
  tag: `<div class="protyle-wysiwyg"><div data-node-id="preview-tag"><span>行政法笔记 </span><span data-type="tag">行政许可</span><span> 与 </span><span data-type="tag">行政处罚</span></div></div>`,
  reference: `<div class="protyle-wysiwyg"><div data-node-id="preview-reference"><span>参见 </span><span data-type="block-ref sup">行政行为效力</span><span> 以及 </span><span data-type="block-ref sub">程序正当原则</span><span class="protyle-attr--refcount">2 个引用</span></div></div>`,
  callout: `<div class="b3-typography protyle-wysiwyg"><div class="callout" data-node-id="preview-callout" data-type="NodeCallout" data-subtype="TIP"><div class="callout-info"><span class="callout-icon">i</span><span class="callout-title">提示</span></div><div class="callout-content"><p>这里显示 Callout 正文样式。</p></div></div></div>`,
  database: `<div class="av" data-av-id="preview-av"><div class="av__row"><div class="av__cell"><span class="av__celltext av__celltext--text">案例名称</span></div><div class="av__cell"><span class="av__celltext--url b3-chip">https://example.com/a/very/long/legal-reference</span></div><div class="av__cell"><span class="b3-chip">已复习</span></div></div></div>`,
  flashcard: `<div class="card__main"><div class="card__block"><div class="protyle-wysiwyg"><div data-node-id="preview-card">行政行为的合法要件是什么？</div></div></div><div class="fn__flex card__action"><button class="b3-button">显示答案</button></div></div>`,
  workspace: `<div class="layout__dockl"><div class="dock__item"><span>文档</span></div><div class="dock__split"></div><div class="dock__item"><span>标签</span></div></div><div class="workspace"><button class="toolbar__item"><span class="toolbar__text">法考工作空间</span><span class="b3-list-item__arrow">›</span></button></div>`,
};

export function buildSnippetPreviewDocument(scene: SnippetPreviewScene, css: string, themeVariables: Readonly<Record<string, string>> = {}): string {
  const safeCss = css.replace(/@import[^;]+;/giu, "").replace(/<\/style/giu, "<\\/style");
  const hostVariables = Object.entries(themeVariables).map(([name, value]) => `${name}:${value}`).join(";");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--b3-theme-background:#fff;--b3-theme-on-background:#24292f;--b3-theme-surface:#f3f5f7;--b3-theme-on-surface:#57606a;--b3-theme-primary:#3b6ea8;--b3-theme-on-primary:#fff;--b3-border-color:#d8dee4;--b3-font-background7:#dce8f5;--b3-bq-background7:#e8f1fa;--b3-protyle-inline-mark-background:#3b6ea8;${hostVariables};font-family:system-ui,sans-serif;color:var(--b3-theme-on-background);background:var(--b3-theme-background)}*{box-sizing:border-box}body{margin:0;padding:16px;font-size:15px;background:var(--b3-theme-background);color:var(--b3-theme-on-background)}.protyle-wysiwyg{line-height:1.7}.protyle-wysiwyg h1,.protyle-wysiwyg h2,.protyle-wysiwyg h3{margin:0 0 10px}.protyle-wysiwyg blockquote,.bq{margin:12px 0;padding:10px 14px;border-left:3px solid var(--b3-theme-primary);background:var(--b3-bq-background7)}.protyle-wysiwyg .list{padding-left:24px}.callout{padding:12px;border-radius:6px;background:var(--b3-bq-background7);color:var(--b3-theme-primary)}.callout-info{display:flex;gap:8px;font-weight:600}.callout-content p{margin:8px 0 0}.av{border:1px solid var(--b3-border-color);overflow:hidden}.av__row{display:grid;grid-template-columns:1fr 1.4fr 1fr}.av__cell{min-width:0;padding:8px;border-right:1px solid var(--b3-border-color)}.b3-chip{display:inline-block;max-width:100%;padding:2px 6px;border-radius:4px;background:var(--b3-theme-surface)}.card__main{border:1px solid var(--b3-border-color);padding:14px}.card__action{display:flex;justify-content:flex-end;margin-top:12px}.b3-button{padding:5px 10px}.layout__dockl{display:flex;align-items:center;gap:10px}.dock__item{padding:8px}.dock__split{width:1px;height:28px;background:var(--b3-border-color)}.workspace{margin-top:14px}.toolbar__item{display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px;border:1px solid var(--b3-border-color);background:transparent}
${safeCss}
</style></head><body>${SCENE_MARKUP[scene]}</body></html>`;
}
