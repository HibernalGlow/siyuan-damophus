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
  it("keeps the answer and source block hidden before reveal", async () => {
    const mountSourceBlock = vi.fn();
    render({ questionRenderMode: "embed", mountSourceBlock });
    await flush();

    expect(document.querySelector(".solution")).toBeNull();
    expect(document.querySelector(".native-answer-source")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("Answer: A");
    expect(mountSourceBlock).not.toHaveBeenCalled();
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

  it.each([
    ["embed", true],
    ["native", false],
  ] as const)("mounts %s mode with editable=%s and disposes it", async (questionRenderMode, editable) => {
    const cleanup = vi.fn();
    const mountSourceBlock = vi.fn((target: HTMLElement, sourceBlockId: string, sourceEditable: boolean) => {
      target.innerHTML = `<div data-mounted-block="${sourceBlockId}" contenteditable="${sourceEditable}">source</div>`;
      return cleanup;
    });
    render({ revealed: true, questionRenderMode, mountSourceBlock });
    await flush();

    expect(mountSourceBlock).toHaveBeenCalledWith(expect.any(HTMLElement), blockId, editable);
    expect(document.querySelector(`[data-mounted-block="${blockId}"][contenteditable="${editable}"]`)).not.toBeNull();

    if (mounted) await unmount(mounted);
    mounted = undefined;
    expect(cleanup).toHaveBeenCalledOnce();
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
