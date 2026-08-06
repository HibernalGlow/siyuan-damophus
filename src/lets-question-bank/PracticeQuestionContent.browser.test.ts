import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import type { Question, ShuffledOption } from "@/question-bank/core/types";
import PracticeQuestionContent from "./PracticeQuestionContent.svelte";

const blockId = "20260804120001-abcdefg";

const question: Question = {
  id: "q-objective",
  type: "multiple",
  title: "Objective question",
  stemMarkdown: "Select the correct options.",
  options: [
    { id: "A", markdown: "Alpha" },
    { id: "B", markdown: "Beta" },
  ],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "**Answer:** A",
  metadata: { topicId: "child", topicPath: ["Root topic", "Child topic"] },
};

const displayedOptions: ShuffledOption[] = [
  { originalId: "A", displayLabel: "A", markdown: "Alpha" },
  { originalId: "B", displayLabel: "B", markdown: "Beta" },
];

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function render(props: Record<string, unknown> = {}): void {
  const target = document.createElement("div");
  document.body.appendChild(target);
  mounted = mount(PracticeQuestionContent, {
    target,
    props: {
      label: (_key: string, fallback: string) => fallback,
      currentQuestion: question,
      currentQuestionBlockId: blockId,
      displayedOptions,
      selectedOptionIds: [],
      renderQuestionContent: (markdown: string) => markdown,
      questionTypeLabel: () => "Multiple choice",
      optionMarkdown: (option: ShuffledOption) => option.markdown,
      formatDuration: (milliseconds: number) => `${milliseconds} ms`,
      toggleOption: vi.fn(),
      changeSubjectiveScore: vi.fn(),
      ...props,
    },
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

describe("PracticeQuestionContent", () => {
  it("mounts the editable embed as the question body before reveal", async () => {
    const cleanup = vi.fn();
    const toggleOption = vi.fn();
    const mountSourceBlock = vi.fn((target: HTMLElement, sourceBlockId: string, editable: boolean) => {
      target.innerHTML = `<div data-mounted-block="${sourceBlockId}" contenteditable="${editable}">source</div>`;
      return cleanup;
    });
    render({ questionRenderMode: "embed", mountSourceBlock, toggleOption });
    await flush();

    expect(mountSourceBlock).toHaveBeenCalledWith(expect.any(HTMLElement), blockId, true, undefined, "embed");
    expect(document.querySelector(`[data-mounted-block="${blockId}"][contenteditable="true"]`)).not.toBeNull();
    expect(document.querySelector(".embedded-question-source")).not.toBeNull();
    expect(document.querySelector(".stem")).toBeNull();
    expect(document.querySelector(".solution")).toBeNull();
    expect(document.querySelector(".native-answer-source")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("Answer: A");

    const option = [...document.querySelectorAll<HTMLButtonElement>("button.option")]
      .find((item) => item.textContent?.includes("Alpha"));
    if (!option) throw new Error("Missing original embedded answer option");
    option.click();
    expect(toggleOption).toHaveBeenCalledWith("A");
  });

  it("uses the HTML renderer without mounting a source block", async () => {
    const mountSourceBlock = vi.fn();
    const renderQuestionContent = vi.fn((markdown: string, inheritStyles: boolean) => (
      `<span data-rendered="${inheritStyles}">${markdown}</span>`
    ));
    render({
      revealed: true,
      questionRenderMode: "html",
      inheritSourceStyles: false,
      renderQuestionContent,
      mountSourceBlock,
    });
    await flush();

    expect(renderQuestionContent).toHaveBeenCalledWith(question.solutionMarkdown, false);
    expect(document.querySelector(".solution")?.textContent).toContain("**Answer:** A");
    expect(mountSourceBlock).not.toHaveBeenCalled();
  });

  it("mounts the editable native question before reveal and the native solution after reveal", async () => {
    const cleanup = vi.fn();
    const mountSourceBlock = vi.fn((target: HTMLElement, sourceBlockId: string, sourceEditable: boolean, section?: "stem" | "solution", renderMode?: "native" | "embed") => {
      target.innerHTML = `<div data-mounted-block="${sourceBlockId}" data-mounted-section="${section ?? "stem"}" data-render-mode="${renderMode}" contenteditable="${sourceEditable}">source</div>`;
      return cleanup;
    });
    render({ questionRenderMode: "native", mountSourceBlock });
    await flush();

    expect(mountSourceBlock).toHaveBeenCalledWith(expect.any(HTMLElement), blockId, true, "stem", "native");
    expect(document.querySelector(`[data-mounted-block="${blockId}"][data-mounted-section="stem"][data-render-mode="native"][contenteditable="true"]`)).not.toBeNull();
    expect(document.querySelector(".native-question-source")).not.toBeNull();
    expect(document.querySelector(".native-answer-source")).toBeNull();
    const question = document.querySelector<HTMLElement>(".question");
    const host = document.querySelector<HTMLElement>(".source-block-host");
    expect(question && getComputedStyle(question).maxWidth).not.toBe("920px");
    expect(host && getComputedStyle(host).minHeight).toBe("0px");

    if (mounted) await unmount(mounted);
    mounted = undefined;
    expect(cleanup).toHaveBeenCalledOnce();

    render({ revealed: true, questionRenderMode: "native", mountSourceBlock });
    await flush();

    expect(mountSourceBlock).toHaveBeenCalledWith(expect.any(HTMLElement), blockId, true, "stem", "native");
    expect(mountSourceBlock).toHaveBeenCalledWith(expect.any(HTMLElement), blockId, true, "solution", "native");
    expect(document.querySelector(`[data-mounted-section="solution"][data-render-mode="native"][contenteditable="true"]`)).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".native-answer-source") && getComputedStyle(document.querySelector<HTMLElement>(".native-answer-source")!).minHeight).toBe("0px");

    if (mounted) await unmount(mounted);
    mounted = undefined;
    expect(cleanup).toHaveBeenCalledTimes(3);
  });

  it("mounts the solution embed only after the answer is revealed", async () => {
    const mountSourceBlock = vi.fn((target: HTMLElement, _sourceBlockId: string, _editable: boolean, section?: "stem" | "solution") => {
      target.innerHTML = `<div data-mounted-section="${section ?? "stem"}">source</div>`;
      return () => target.replaceChildren();
    });
    render({ revealed: true, questionRenderMode: "embed", mountSourceBlock });
    await flush();

    expect(mountSourceBlock).toHaveBeenCalledTimes(2);
    expect(mountSourceBlock).toHaveBeenNthCalledWith(1, expect.any(HTMLElement), blockId, true, undefined, "embed");
    expect(mountSourceBlock).toHaveBeenNthCalledWith(2, expect.any(HTMLElement), blockId, true, "solution", "embed");
    expect(document.querySelector(".embedded-question-source")).not.toBeNull();
    expect(document.querySelector('[data-mounted-section="solution"]')).not.toBeNull();
    expect(document.querySelector(".native-answer-source")).toBeNull();
    expect(document.querySelector(".solution")).toBeNull();
  });

  it("opens the source question block from its title action", async () => {
    const openQuestionSource = vi.fn();
    render({ openQuestionSource });
    await flush();

    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Edit source block in SiYuan"]');
    if (!button) throw new Error("Missing source edit button");
    button.click();

    expect(openQuestionSource).toHaveBeenCalledWith(blockId);
  });
});
