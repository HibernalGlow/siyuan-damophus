import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSurfaceTopicRelationTargets,
  findTopicRelationSurfaceCandidates,
  findTopicRelationTargets,
  type TopicRelationGroup,
} from "./topic-relations";
import {
  createNativeBlockRef,
  removeTopicRelationMarkers,
  syncTopicRelationMarkers,
  type TopicRelationLabels,
} from "./topic-relation-dom";
import { TopicRelationPanel } from "./topic-relation-panel";
import { buildTopicRelationStyles } from "./topic-relation-styles";

const labels: TopicRelationLabels = {
  topics: "Topics",
  topicNote: "Topic note",
  topicNotes: "Topic notes",
  otherTopicNotes: "Other topic notes",
  relatedQuestions: "Related questions",
  unresolved: "No topic note",
  loadFailed: "Failed",
  retry: "Retry",
  openRelations: "Open relations",
  more: "+{count}",
};

const group: TopicRelationGroup = {
  topicId: "civil-topic-a",
  label: "Detailed topic",
  notes: [
    {
      kind: "note",
      topicId: "civil-topic-a",
      blockId: "20260808000100-note001",
      rootId: "20260808000100-root001",
      type: "h",
      subtype: "h3",
      content: "Detailed topic",
      markdown: "### Detailed topic",
      hpath: "/Civil/Notes/精讲卷",
    },
    {
      kind: "note",
      topicId: "civil-topic-a",
      blockId: "20260808000100-note002",
      rootId: "20260808000100-root002",
      type: "p",
      subtype: "",
      content: "Recitation point",
      markdown: "Recitation point",
      hpath: "/Civil/Notes/背诵卷",
    },
  ],
  questions: [
    {
      kind: "question",
      topicId: "civil-topic-a",
      blockId: "20260808000100-question1",
      rootId: "20260808000100-root003",
      type: "h",
      subtype: "h5",
      content: "176.",
      markdown: "##### 176.",
      hpath: "/Civil/Questions",
    },
  ],
};

afterEach(() => {
  removeTopicRelationMarkers(document);
  document.querySelector('[data-topic-relations-surface]')?.remove();
  document.head.querySelector("#topic-relations-test-style")?.remove();
  document.body.innerHTML = "";
});

function installEditor(): void {
  document.body.innerHTML = `
    <div class="protyle">
      <div class="protyle-wysiwyg">
        <div id="note" data-node-id="20260808000100-note001" data-type="NodeHeading"
          custom-qb-note-topic-id="civil-topic-a"><div class="protyle-attr"></div></div>
        <div id="question" data-node-id="20260808000100-question1" data-type="NodeHeading"
          custom-qb-question-topic-ids="civil-topic-a"><div class="protyle-attr"></div></div>
      </div>
    </div>`;
}

function relationMarkerAfter(element: HTMLElement): HTMLElement {
  const marker = element.nextElementSibling;
  if (!(marker instanceof HTMLElement) || !marker.classList.contains("damophus-topic-relations")) {
    throw new Error("Missing adjacent topic relation marker");
  }
  return marker;
}

describe("topic relation editor projection", () => {
  it("renders the same grouped relation contract on note and question blocks", () => {
    installEditor();
    const targets = findTopicRelationTargets(document);
    const open = vi.fn();
    syncTopicRelationMarkers(document, targets, new Map([[group.topicId, group]]), {
      displayMode: "expanded",
      nativeHover: true,
      labels,
      onRetry: vi.fn(),
      onOpen: open,
    });

    const note = document.querySelector<HTMLElement>("#note");
    const question = document.querySelector<HTMLElement>("#question");
    if (!note || !question) throw new Error("Missing editor blocks");
    const noteMarker = relationMarkerAfter(note);
    const questionMarker = relationMarkerAfter(question);
    expect(noteMarker.textContent).toContain("Topic note");
    expect(noteMarker.textContent).toContain("Other topic notes");
    expect(noteMarker.textContent).toContain("Related questions");
    expect(noteMarker.querySelector(".damophus-topic-relations__row")?.textContent)
      .not.toContain("Detailed topic");
    expect(questionMarker.textContent).toContain("Topics");
    expect(questionMarker.querySelectorAll('[data-type="block-ref"]')).toHaveLength(2);
    expect(noteMarker.querySelector('[data-id="20260808000100-note001"]')).toBeNull();

    noteMarker.querySelector<HTMLButtonElement>(".damophus-topic-relations__topic-button")?.click();
    expect(open).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      group,
      "20260808000100-note001",
      "notes",
    );
  });

  it("keeps virtual relation HTML outside editable blocks and migrates legacy placement", () => {
    installEditor();
    const targets = findTopicRelationTargets(document);
    const options = {
      displayMode: "compact" as const,
      nativeHover: true,
      labels,
      onRetry: vi.fn(),
      onOpen: vi.fn(),
    };
    syncTopicRelationMarkers(document, targets, new Map([[group.topicId, group]]), options);

    const note = document.querySelector<HTMLElement>("#note");
    if (!note) throw new Error("Missing note block");
    const safeMarker = relationMarkerAfter(note);
    expect(note.innerHTML).not.toContain("damophus-topic-relations");
    expect(safeMarker.dataset.topicRelationsTargetId).toBe("20260808000100-note001");

    note.append(safeMarker);
    syncTopicRelationMarkers(document, targets, new Map([[group.topicId, group]]), options);

    expect(note.innerHTML).not.toContain("damophus-topic-relations");
    expect(relationMarkerAfter(note).dataset.signature).toBeTruthy();
  });

  it("projects a zoomed topic-note root beneath the SiYuan document title", () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div class="protyle-breadcrumb">
          <span class="protyle-breadcrumb__item" data-node-id="20260808000100-root001"></span>
          <span class="protyle-breadcrumb__item" data-node-id="20260808000100-note001"></span>
        </div>
        <div class="protyle-title" data-node-id="20260808000100-root001">
          <div class="protyle-title__input">Detailed topic</div>
          <div class="protyle-attr"></div>
        </div>
        <div class="protyle-wysiwyg"></div>
      </div>`;
    const candidates = findTopicRelationSurfaceCandidates(document);
    const targets = buildSurfaceTopicRelationTargets(candidates, [{
      block_id: "20260808000100-note001",
      attribute_name: "custom-qb-note-topic-id",
      attribute_value: "civil-topic-a",
    }]);

    syncTopicRelationMarkers(document, targets, new Map([[group.topicId, group]]), {
      displayMode: "compact",
      nativeHover: true,
      labels,
      onRetry: vi.fn(),
      onOpen: vi.fn(),
    });

    expect(candidates.map((candidate) => candidate.blockId)).toEqual([
      "20260808000100-root001",
      "20260808000100-note001",
    ]);
    expect(targets.map((target) => target.blockId)).toEqual([
      "20260808000100-note001",
    ]);
    expect(document.querySelector(".protyle-title .damophus-topic-relations")?.textContent)
      .toContain("Topic note");
    expect(document.querySelector(".protyle-title .damophus-topic-relations")?.textContent)
      .toContain("Related questions");
  });

  it("uses the native SiYuan block-reference contract and can disable only its popover", () => {
    const native = createNativeBlockRef(group.notes[0], true);
    const disabled = createNativeBlockRef(group.notes[0], false);

    expect(native.dataset.type).toBe("block-ref");
    expect(native.dataset.id).toBe("20260808000100-note001");
    expect(native.dataset.subtype).toBe("d");
    expect(native.hasAttribute("prevent-popover")).toBe(false);
    expect(disabled.getAttribute("prevent-popover")).toBe("true");
    expect(native.tabIndex).toBe(0);
  });

  it("opens a bottom panel on mobile and excludes the current host from its group", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Editable source";
    const anchor = document.createElement("button");
    editor.append(anchor);
    document.body.append(editor);
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const panel = new TopicRelationPanel();
    panel.open(anchor, group, "20260808000100-note001", "notes", {
      mobile: true,
      mobileHeight: 72,
      nativeHover: true,
      labels: {
        topicNotes: "Topic notes",
        otherTopicNotes: "Other topic notes",
        relatedQuestions: "Related questions",
        empty: "Empty",
        pin: "Pin",
        unpin: "Unpin",
        close: "Close",
      },
    });

    const surface = document.querySelector<HTMLElement>('[data-topic-relations-surface]');
    const sheet = surface?.querySelector<HTMLElement>(".damophus-topic-relations__panel--mobile");
    expect(sheet?.style.getPropertyValue("--damophus-topic-mobile-height")).toBe("72dvh");
    expect(surface?.querySelector('[data-id="20260808000100-note001"]')).toBeNull();
    expect(surface?.querySelector('[data-id="20260808000100-note002"]')).not.toBeNull();
    expect(surface?.querySelector('[data-id="20260808000100-question1"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(editor);
    expect(window.getSelection()?.rangeCount).toBe(0);
    panel.destroy();
  });

  it("prevents relation controls from focusing the surrounding editor", () => {
    installEditor();
    const targets = findTopicRelationTargets(document);
    syncTopicRelationMarkers(document, targets, new Map([[group.topicId, group]]), {
      displayMode: "compact",
      nativeHover: true,
      labels,
      onRetry: vi.fn(),
      onOpen: vi.fn(),
    });

    const controls = document.querySelectorAll<HTMLElement>(
      ".damophus-topic-relations__topic-button, .damophus-topic-relations__native-link",
    );
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((control) => {
      const pointerDown = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      expect(control.dispatchEvent(pointerDown)).toBe(false);
      expect(pointerDown.defaultPrevented).toBe(true);
    });
  });

  it("keeps custom appearance scoped and rejects unsafe declarations", () => {
    const style = document.createElement("style");
    style.id = "topic-relations-test-style";
    style.textContent = buildTopicRelationStyles(
      "border-left-color: rgb(1, 2, 3); position: fixed; background: url(https://example.com/a.png);",
    );
    document.head.append(style);

    expect(style.textContent).toContain("border-left-color: rgb(1, 2, 3);");
    expect(style.textContent).not.toContain("position: fixed;\n  background");
    expect(style.textContent).not.toContain("url(");
  });
});
