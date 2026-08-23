import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlashcardResults from "./FlashcardResults.svelte";

let app: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

describe("flashcard registration results", () => {
  it("disables duplicate registration while verification is pending", async () => {
    let finishRegistration: (() => void) | undefined;
    const onRegister = vi.fn(() => new Promise<void>((resolve) => {
      finishRegistration = resolve;
    }));
    const target = document.createElement("div");
    document.body.append(target);
    app = mount(FlashcardResults, {
      target,
      props: {
        title: "P_（tag） · 待登记闪卡",
        rows: [{ id: "20260823130238-card001", content: "测试闪卡", type: "list" }],
        roots: [{
          blockId: "20260823130238-card001",
          renderer: "list",
          kind: "basic",
          attributes: {},
          content: "测试闪卡",
        }],
        due: {
          cards: [],
          unreviewedCount: 0,
          unreviewedNewCardCount: 0,
          unreviewedOldCardCount: 0,
          candidateCount: 1,
          registeredCount: 0,
        },
        filtered: true,
        canReview: false,
        onReview: vi.fn(),
        onRegister,
      },
    });
    await tick();

    const registerButton = target.querySelector<HTMLButtonElement>(".actions .b3-button");
    expect(registerButton?.textContent).toBe("一键制卡并登记");
    expect(target.textContent).not.toContain("复习过滤结果");
    registerButton?.click();

    await vi.waitFor(() => expect(registerButton?.disabled).toBe(true));
    expect(registerButton?.textContent).toBe("正在登记并验证…");
    registerButton?.click();
    expect(onRegister).toHaveBeenCalledTimes(1);

    finishRegistration?.();
    await vi.waitFor(() => expect(registerButton?.disabled).toBe(false));
    expect(registerButton?.textContent).toBe("一键制卡并登记");
  });
});
