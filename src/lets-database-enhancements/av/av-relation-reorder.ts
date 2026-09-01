export interface DocContext {
  title: string;
  hPath: string;
  subject?: string;
  topicNumber?: string;
  normalizedIndex?: number;
  keywords: string[];
}

export const KNOWN_SUBJECTS: Array<{ name: string; aliases: string[] }> = [
  { name: "民诉法", aliases: ["民诉", "民事诉讼法", "民事诉讼"] },
  { name: "刑诉法", aliases: ["刑诉", "刑事诉讼法", "刑事诉讼"] },
  { name: "民法", aliases: ["民法典", "民法总则", "民法分则", "物权", "债权", "合同编", "侵权责任"] },
  { name: "刑法", aliases: ["刑法总则", "刑法分则"] },
  { name: "行政法", aliases: ["行政诉讼法", "行政诉讼", "行政法与行政诉讼法"] },
  { name: "商经法", aliases: ["商法", "经济法", "商法经济法", "公司法", "合伙企业法", "破产法", "票据法", "证券法", "反不正当竞争法", "劳动法"] },
  { name: "三国法", aliases: ["国际法", "国际公法", "国际私法", "国际经济法", "争端解决", "国际商事"] },
  { name: "理论法", aliases: ["法理学", "法理", "宪法", "法制史", "中国法律史", "法律职业道德"] },
  { name: "知识产权法", aliases: ["知产", "知产法", "著作权", "专利", "商标"] },
];

const CHINESE_DIGIT_MAP: Record<string, number> = {
  "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
  "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
  "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
  "二十一": 21, "二十二": 22, "二十三": 23, "二十四": 24, "二十五": 25,
  "二十六": 26, "二十七": 27, "二十八": 28, "二十九": 29, "三十": 30,
};

export function parseChineseOrArabicNumber(str: string): number | null {
  const trimmed = str.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) return num;
  if (CHINESE_DIGIT_MAP[trimmed] !== undefined) {
    return CHINESE_DIGIT_MAP[trimmed];
  }
  return null;
}

export function extractTopicNumber(text: string): { raw: string; index: number } | null {
  if (!text) return null;
  // Match patterns like "03", "专题三", "专题03", "专题3", "第3讲", "第三讲", "第03章", "3"
  const m1 = text.match(/(?:专题|第)\s*([0-9]+|[一二三四五六七八九十]+)\s*(?:讲|章|节|篇|部)?/);
  if (m1 && m1[1]) {
    const idx = parseChineseOrArabicNumber(m1[1]);
    if (idx !== null) {
      return { raw: m1[0], index: idx };
    }
  }

  const m2 = text.match(/^\s*([0-9]{1,3})\b/);
  if (m2 && m2[1]) {
    const idx = parseInt(m2[1], 10);
    if (!isNaN(idx)) {
      return { raw: m2[1], index: idx };
    }
  }

  return null;
}

export function detectSubject(text: string): string | undefined {
  if (!text) return undefined;
  for (const subj of KNOWN_SUBJECTS) {
    if (text.includes(subj.name)) return subj.name;
    for (const alias of subj.aliases) {
      if (text.includes(alias)) return subj.name;
    }
  }
  return undefined;
}

export function extractDocContext(rootElement?: HTMLElement | null): DocContext {
  let title = "";
  let hPath = "";

  if (rootElement) {
    const titleEl = rootElement.querySelector(".protyle-title [data-node-id]") || rootElement.querySelector(".protyle-title");
    if (titleEl) {
      title = titleEl.textContent?.trim() || "";
    }

    const breadcrumb = rootElement.querySelector(".protyle-breadcrumb");
    if (breadcrumb) {
      hPath = breadcrumb.textContent?.trim() || "";
    }
  }

  if (!title) {
    // 从当前活动的 tab 或文档标题获取
    const activeTab = document.querySelector(".layout-tab-bar .item--focus") || document.querySelector(".layout-tab-bar .item");
    if (activeTab) {
      title = activeTab.querySelector(".item__text")?.textContent?.trim() || "";
    }
  }

  const combinedText = `${hPath} ${title}`;
  const subject = detectSubject(combinedText);
  const topicInfo = extractTopicNumber(title) || extractTopicNumber(hPath);

  // 提取关键词（滤除无意义停用词）
  const cleanTitle = title
    .replace(/(?:专题|第)\s*([0-9]+|[一二三四五六七八九十]+)\s*(?:讲|章|节|篇|部)?/g, "")
    .replace(/[0-9]+/g, "")
    .replace(/[·\-—/\\|,，。:：()（）[\]]/g, " ")
    .trim();

  const words = cleanTitle.split(/\s+/).filter((w) => w.length >= 2 && !w.includes("法考"));

  return {
    title,
    hPath,
    subject,
    topicNumber: topicInfo?.raw,
    normalizedIndex: topicInfo?.index,
    keywords: words,
  };
}

export function calculateRelationRelevance(
  itemText: string,
  itemSubjectText: string,
  context: DocContext,
): number {
  if (!itemText && !itemSubjectText) return 0;

  let score = 0;
  const itemCombined = `${itemSubjectText} ${itemText}`;
  const itemSubject = detectSubject(itemCombined);

  // 1. 学科匹配维度
  if (context.subject) {
    if (itemSubject === context.subject) {
      score += 100;
    } else if (itemSubject && itemSubject !== context.subject) {
      // 明确属于其他不同科目，大幅惩罚降序
      score -= 50;
    }
  }

  // 2. 专题/章节编号匹配维度
  const itemTopicInfo = extractTopicNumber(itemText);
  if (context.normalizedIndex !== undefined && itemTopicInfo) {
    if (itemTopicInfo.index === context.normalizedIndex) {
      score += 80;
    } else if (Math.abs(itemTopicInfo.index - context.normalizedIndex) === 1) {
      score += 10;
    }
  }

  // 3. 关键词重合维度
  if (context.keywords.length > 0) {
    for (const kw of context.keywords) {
      if (itemText.includes(kw)) {
        score += 20;
      }
    }
  }

  return score;
}

export class AvRelationReorderManager {
  private observer?: MutationObserver;
  private enabled = true;
  private highlightEnabled = true;

  constructor(options?: { enabled?: boolean; highlightEnabled?: boolean }) {
    this.enabled = options?.enabled !== false;
    this.highlightEnabled = options?.highlightEnabled !== false;
  }

  updateOptions(options: { enabled?: boolean; highlightEnabled?: boolean }): void {
    this.enabled = options.enabled !== false;
    this.highlightEnabled = options.highlightEnabled !== false;
  }

  start(): () => void {
    if (this.observer) return () => {};

    const handleMenuMutations = (mutations: MutationRecord[]) => {
      if (!this.enabled) return;

      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              // 检查是否为思源菜单弹窗
              if (el.classList.contains("b3-menu") || el.querySelector?.(".b3-menu__items")) {
                this.checkAndReorderRelationMenu(el);
              }
            }
          }
        }
      }
    };

    this.observer = new MutationObserver(handleMenuMutations);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => this.destroy();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  checkAndReorderRelationMenu(menuRoot: HTMLElement): void {
    const menuItems = menuRoot.querySelector<HTMLElement>(".b3-menu__items") || menuRoot;
    const relationButtons = menuItems.querySelectorAll<HTMLElement>(
      'button[data-type="setRelationCell"]',
    );
    if (relationButtons.length === 0) return;

    // 防止重复重排造成循环触发
    if (menuItems.dataset.damophusReordered === "true") return;

    // 获取当前上下文
    const activeProtyle = document.querySelector<HTMLElement>(".protyle:not(.fn__none)");
    const context = extractDocContext(activeProtyle);

    // 分离已选项目与未选待选项 (已选项目带有 draggable=true 或删除图标)
    const separator = menuItems.querySelector<HTMLElement>(".b3-menu__separator");
    const unselectedItems: Array<{ el: HTMLElement; score: number }> = [];

    relationButtons.forEach((btn) => {
      // 若是已选项目，跳过
      if (btn.getAttribute("draggable") === "true") return;
      if (separator && btn.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING) {
        return;
      }

      const text = btn.querySelector(".b3-menu__label")?.textContent || btn.textContent || "";
      const subjectTag = btn.querySelector(".b3-chip, [data-dtype='select']")?.textContent || "";
      const score = calculateRelationRelevance(text, subjectTag, context);
      unselectedItems.push({ el: btn, score });
    });

    if (unselectedItems.length === 0) return;

    // 检查是否有正向匹配的条目
    const hasMatch = unselectedItems.some((item) => item.score > 0);
    if (!hasMatch) {
      menuItems.dataset.damophusReordered = "true";
      return;
    }

    // 按得分从高到低排序
    unselectedItems.sort((a, b) => b.score - a.score);

    // 标记已排序
    menuItems.dataset.damophusReordered = "true";

    // 重新挂载到 DOM 中
    unselectedItems.forEach((item, index) => {
      menuItems.appendChild(item.el);

      // 高亮最高匹配项
      if (this.highlightEnabled && item.score >= 80 && index === 0) {
        item.el.classList.add("damophus-relation-top-match");
        if (!item.el.querySelector(".damophus-relation-badge")) {
          const badge = document.createElement("span");
          badge.className = "damophus-relation-badge";
          badge.style.cssText =
            "font-size: 10px; padding: 1px 5px; border-radius: 4px; background-color: var(--b3-theme-primary-light); color: var(--b3-theme-primary); margin-left: 6px; flex-shrink: 0;";
          badge.textContent = "✨ 推荐关联";
          const label = item.el.querySelector(".b3-menu__label");
          if (label) {
            label.after(badge);
          } else {
            item.el.prepend(badge);
          }
        }
      }
    });

    // 聚焦排在第 1 位的最优推荐项，方便直接回车
    const firstItem = unselectedItems[0].el;
    menuItems.querySelectorAll(".b3-menu__item--current").forEach((el) => {
      el.classList.remove("b3-menu__item--current");
    });
    firstItem.classList.add("b3-menu__item--current");
  }
}
