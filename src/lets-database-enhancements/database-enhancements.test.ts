import { describe, expect, it } from "vitest";
import {
  parseDocTitleImg,
  buildCardCoverHTML,
  extractCardBlockId,
  INHERITED_IMG_CLASS,
} from "./av-cover-inherit";
import {
  detectSubject,
  extractTopicNumber,
  parseChineseOrArabicNumber,
  calculateRelationRelevance,
  type DocContext,
} from "./av-relation-reorder";

describe("Database Enhancements: Card Cover Inherit", () => {
  it("parses doc title-img in IAL correctly", () => {
    const ial = '{: id="20230805-root" title-img="background-image:url(&quot;assets/cover.png&quot;);background-position:center 30%;"}';
    expect(parseDocTitleImg(ial)).toBe('background-image:url("assets/cover.png");background-position:center 30%;');
  });

  it("parses direct asset path or URL correctly", () => {
    const ial = '{: id="20230805-root" title-img="assets/cover-123.jpg"}';
    expect(parseDocTitleImg(ial)).toBe("assets/cover-123.jpg");
  });

  it("handles null or empty IAL", () => {
    expect(parseDocTitleImg(null)).toBe(null);
    expect(parseDocTitleImg("")).toBe(null);
    expect(parseDocTitleImg('{: id="123" icon="1f4d6"}')).toBe(null);
  });

  it("builds card cover HTML correctly", () => {
    const html = buildCardCoverHTML("assets/cover.png");
    expect(html).toContain("av__gallery-img");
    expect(html).toContain(INHERITED_IMG_CLASS);
    expect(html).toContain('src="assets/cover.png"');
  });

  it("extracts block ID from block cell or content node accurately", () => {
    const cardEl = {
      getAttribute: (k: string) => (k === "data-id" ? "row-av-123" : null),
      querySelector: (selector: string) => {
        if (selector.includes("block")) {
          return {
            getAttribute: (k: string) => (k === "data-id" ? "bound-block-789" : null),
          };
        }
        return null;
      },
    } as any;
    expect(extractCardBlockId(cardEl)).toBe("bound-block-789");
  });
});

describe("Database Enhancements: Smart Relation Relevance Ranking", () => {
  it("parses numbers and Chinese numerals", () => {
    expect(parseChineseOrArabicNumber("3")).toBe(3);
    expect(parseChineseOrArabicNumber("03")).toBe(3);
    expect(parseChineseOrArabicNumber("三")).toBe(3);
    expect(parseChineseOrArabicNumber("七")).toBe(7);
    expect(parseChineseOrArabicNumber("十二")).toBe(12);
  });

  it("extracts topic number correctly", () => {
    expect(extractTopicNumber("03 专题三 民事诉讼法的基本原则")?.index).toBe(3);
    expect(extractTopicNumber("专题7 国际争端解决")?.index).toBe(7);
    expect(extractTopicNumber("第04讲 诉讼管辖")?.index).toBe(4);
    expect(extractTopicNumber("10 专题二 冲突规范")?.index).toBe(2);
  });

  it("detects subject category correctly", () => {
    expect(detectSubject("法考/03 民诉法/03 专题三")).toBe("民诉法");
    expect(detectSubject("07 专题七 国际争端的解决方式 三国法")).toBe("三国法");
    expect(detectSubject("民事诉讼法的基本原则")).toBe("民诉法");
    expect(detectSubject("刑法总则 犯罪构成")).toBe("刑法");
  });

  it("scores exact subject and topic matches much higher than unrelated items", () => {
    const context: DocContext = {
      title: "03 专题三 民事诉讼法的基本原则与基本制度",
      hPath: "法考/03 民诉法/03 专题三",
      subject: "民诉法",
      topicNumber: "03",
      normalizedIndex: 3,
      keywords: ["民事诉讼法", "基本原则", "基本制度"],
    };

    // Case 1: Exact matching row for the current doc
    const matchScore = calculateRelationRelevance(
      "03 专题三 民事诉讼法的基本原则与制度",
      "民诉法",
      context,
    );

    // Case 2: Same subject, different topic
    const sameSubjectScore = calculateRelationRelevance(
      "04 专题四 管辖制度",
      "民诉法",
      context,
    );

    // Case 3: Completely different subject (e.g. 三国法 专题七 in screenshot)
    const unrelatedScore = calculateRelationRelevance(
      "07 专题七 国际争端的解决方式",
      "三国法",
      context,
    );

    // Case 4: Another different subject (三国法 专题二)
    const unrelatedScore2 = calculateRelationRelevance(
      "10 专题二 冲突规范",
      "三国法",
      context,
    );

    expect(matchScore).toBeGreaterThan(sameSubjectScore);
    expect(sameSubjectScore).toBeGreaterThan(unrelatedScore);
    expect(unrelatedScore).toBeLessThanOrEqual(0);
    expect(unrelatedScore2).toBeLessThanOrEqual(0);
  });
});
