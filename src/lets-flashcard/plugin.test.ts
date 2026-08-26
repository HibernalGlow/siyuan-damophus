import { describe, expect, it, vi } from "vitest";
import * as siyuan from "siyuan";
import pluginMetadata from "./plugin";
import FlashcardPlugin from "./index";
import { plugin, setPlugin } from "@/utils";

describe("flashcard plugin metadata", () => {
  it("declares the settings surface and native review entry points", () => {
    const entrySettings = pluginMetadata.settings?.filter((setting) => setting.entryManagement === "central");

    expect(entrySettings?.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["contextMenu", true],
      ["command", true],
      ["desktopDock", true],
      ["mobileDock", true],
      ["tab", true],
    ]);
    expect(pluginMetadata.settings?.some((setting) => setting.key === "openSettingsButton")).toBe(false);
  });

  it("contributes one top-level menu item with review actions as children", () => {
    const addItem = vi.fn();
    const fakePlugin = {
      isEntryEnabled: () => true,
      t: (key: string) => key,
      runtime: { getEnabledGroups: () => [{ id: "group-1", name: "含指定标签" }] },
      openSettings: vi.fn(),
      reviewAll: vi.fn(),
      reviewGroup: vi.fn(),
      openMakeScope: vi.fn(),
      currentReviewContext: () => undefined,
      scopeMenuItem: vi.fn((label: string) => ({ label })),
      batchUnregisterScopeMenuItem: vi.fn((label: string) => ({ label })),
    };

    FlashcardPlugin.prototype.addMenuItem.call(fakePlugin as never, { addItem } as never);

    expect(addItem).toHaveBeenCalledTimes(1);
    const item = addItem.mock.calls[0][0] as { label: string; type?: string; click?: unknown; submenu?: Array<{ label?: string; type?: string }> };
    expect(item.label).toBe("lets-flashcard.displayName");
    expect(item.type).toBe("submenu");
    expect(item.click).toBeUndefined();
    expect(item.submenu?.map((child) => child.type ?? child.label)).toEqual([
      "lets-flashcard.openSettings",
      "lets-flashcard.reviewAll",
      "separator",
      "检测：含指定标签",
      "复习：含指定标签",
    ]);
    (item.submenu?.[0] as { click?: () => void }).click?.();
    expect(fakePlugin.openSettings).toHaveBeenCalledTimes(1);
    (item.submenu?.find((child) => child.label === "检测：含指定标签") as { click?: () => void })?.click?.();
    expect(fakePlugin.openMakeScope).toHaveBeenCalledWith(expect.objectContaining({
      type: "group",
      groupId: "group-1",
      groupName: "含指定标签",
    }));
  });

  it("keeps notebook actions out of the plugin menu", () => {
    const addItem = vi.fn();
    const fakePlugin = {
      isEntryEnabled: () => true,
      t: (key: string) => key,
      runtime: { getEnabledGroups: () => [] },
      openSettings: vi.fn(),
      reviewAll: vi.fn(),
      reviewGroup: vi.fn(),
      currentReviewContext: () => ({
        documentId: "doc-1",
        documentName: "测试文档",
        notebookId: "box-1",
        notebookName: "测试笔记本",
      }),
      scopeMenuItem: vi.fn((label: string) => ({ label })),
      batchUnregisterScopeMenuItem: vi.fn((label: string) => ({ label })),
    };

    FlashcardPlugin.prototype.addMenuItem.call(fakePlugin as never, { addItem } as never);

    const item = addItem.mock.calls[0][0] as { submenu?: Array<{ label?: string }> };
    expect(item.submenu?.map((child) => child.label)).not.toContain("当前笔记本专项复习");
    expect(item.submenu?.map((child) => child.label)).not.toContain("取消当前笔记本下所有闪卡登记");
  });

  it("opens flashcard settings in its stable custom tab", () => {
    const previousPlugin = plugin;
    const app = {};
    const openTab = vi.spyOn(siyuan, "openTab").mockResolvedValue(undefined);
    setPlugin({ name: "damophus", app } as never);
    try {
      FlashcardPlugin.prototype.openSettings.call({ t: (key: string) => key } as never);
      expect(openTab).toHaveBeenCalledWith({
        app,
        custom: {
          title: "lets-flashcard.openSettings",
          icon: "iconRiffCard",
          id: "damophusdamophus-flashcard-settings",
        },
      });
    } finally {
      openTab.mockRestore();
      setPlugin(previousPlugin as never);
    }
  });

  it("adds scoped flashcard submenus for documents and notebooks", () => {
    vi.stubGlobal("document", {});
    const addItem = vi.fn();
    const unregisterContainers = vi.fn();
    const unregisterDocumentTree = vi.fn();
    const reviewAll = vi.fn();
    const reviewGroup = vi.fn();
    const instance = new FlashcardPlugin() as any;
    Object.assign(instance, {
      isEntryEnabled: () => true,
      t: (key: string) => key,
      runtime: { getEnabledGroups: () => [{ id: "group-1", name: "含指定标签" }] },
      openSettings: vi.fn(),
      reviewAll,
      reviewGroup,
      unregisterContainers,
      unregisterDocumentTree,
      reviewDocumentTree: vi.fn(),
      scopeMenuItem: vi.fn((label: string) => ({ label })),
      batchUnregisterScopeMenuItem: vi.fn((label: string) => ({ label })),
    });
    const blockMenu = { addItem };

    instance.handleBlockMenu({
      detail: { menu: blockMenu, blockElements: [{ dataset: { nodeId: "20260823112001-stts5qv" } }] },
    });
    const action = addItem.mock.calls.map(([item]) => item).find((item) => item.label === "取消此容器内所有闪卡登记");
    expect(action).toBeDefined();
    expect(action.label).toBe("取消此容器内所有闪卡登记");
    action.click();
    expect(unregisterContainers).toHaveBeenCalledWith(["20260823112001-stts5qv"], "所选容器");

    addItem.mockClear();
    instance.handleDocumentTitleMenu({
      detail: { menu: blockMenu, data: { id: "20260823112002-aaaaaaa", name: "测试文档" } },
    });
    expect(addItem).toHaveBeenCalledTimes(2);
    const documentMenu = addItem.mock.calls[0][0];
    expect(documentMenu.label).toBe("当前文档专项复习");
    expect(documentMenu.type).toBeUndefined();
    expect(addItem.mock.calls[1][0].label).toBe("取消当前文档下所有闪卡登记");
    addItem.mock.calls[1][0].click();
    expect(unregisterDocumentTree).toHaveBeenCalledWith(["20260823112002-aaaaaaa"], false);

    addItem.mockClear();
    vi.stubGlobal("window", { siyuan: { notebooks: [{ id: "notebook-1", name: "测试笔记本" }] } });
    instance.handleDocumentTreeMenu({
      detail: { menu: blockMenu, type: "notebook", elements: [{ dataset: {}, parentElement: { dataset: { url: "notebook-1" } } }] },
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    const notebookMenu = addItem.mock.calls[0][0];
    expect(notebookMenu.submenu.map((item: { type?: string; label?: string }) => item.type ?? item.label)).toContain("当前笔记本专项复习");
    notebookMenu.submenu.find((item: { label?: string }) => item.label === "取消当前笔记本下所有闪卡登记")?.click();
    expect(unregisterDocumentTree).toHaveBeenCalledWith(["notebook-1"], true);
  });

  it("prefers the official mobile pop editor over desktop tabs and DOM", () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousCss = globalThis.CSS;
    vi.stubGlobal("window", {
      siyuan: {
        mobile: {
          popEditor: { protyle: { block: { rootID: "mobile-doc" }, notebookId: "mobile-book" } },
          editor: { protyle: { block: { rootID: "other-mobile-doc" }, notebookId: "other-book" } },
        },
        notebooks: [{ id: "mobile-book", name: "移动笔记本" }],
      },
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({ dataset: { nodeId: "desktop-doc" } })),
      querySelectorAll: vi.fn(() => []),
    });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const context = (FlashcardPlugin.prototype as any).currentReviewContext.call({});
    expect(context).toEqual({
      documentId: "mobile-doc",
      documentName: "mobile-doc",
      notebookId: "mobile-book",
      notebookName: "移动笔记本",
    });
    vi.stubGlobal("window", previousWindow);
    vi.stubGlobal("document", previousDocument);
    vi.stubGlobal("CSS", previousCss);
  });

  it("falls back to the provided editor when mobile context is unavailable", () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousCss = globalThis.CSS;
    vi.stubGlobal("window", { siyuan: { notebooks: [] } });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => undefined),
      querySelectorAll: vi.fn(() => []),
    });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const context = (FlashcardPlugin.prototype as any).currentReviewContext.call({}, {
      block: { rootID: "editor-doc" },
      notebookId: "editor-book",
    });
    expect(context?.documentId).toBe("editor-doc");
    expect(context?.notebookId).toBe("editor-book");
    vi.stubGlobal("window", previousWindow);
    vi.stubGlobal("document", previousDocument);
    vi.stubGlobal("CSS", previousCss);
  });

  it("uses the visible mobile protyle when official mobile editors are absent", () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousCss = globalThis.CSS;
    vi.stubGlobal("window", { siyuan: { notebooks: [] } });
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => selector.includes(".protyle.fn__flex-1")
        ? { dataset: { nodeId: "mobile-dom-doc" } }
        : undefined),
      querySelectorAll: vi.fn(() => []),
    });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const context = (FlashcardPlugin.prototype as any).currentReviewContext.call({});
    expect(context?.documentId).toBe("mobile-dom-doc");
    vi.stubGlobal("window", previousWindow);
    vi.stubGlobal("document", previousDocument);
    vi.stubGlobal("CSS", previousCss);
  });

  it("intercepts the native mobile spaced-repetition button for the current document", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const fakeDocument = { addEventListener, removeEventListener };
    const reviewDocumentScope = vi.fn();
    const instance = {
      mobileNativeEntryBound: false,
      isEntryEnabled: () => true,
      currentReviewContext: () => ({ documentId: "doc-1", documentName: "当前文档" }),
      reviewDocumentScope,
      bindMobileNativeReviewEntry: (FlashcardPlugin.prototype as any).bindMobileNativeReviewEntry,
      unbindMobileNativeReviewEntry: (FlashcardPlugin.prototype as any).unbindMobileNativeReviewEntry,
      handleMobileNativeReviewEntry: (FlashcardPlugin.prototype as any).handleMobileNativeReviewEntry,
    } as any;
    const previousDocument = globalThis.document;
    vi.stubGlobal("document", fakeDocument);
    Object.assign(instance, { mobileNativeEntryBound: false });
    instance.bindMobileNativeReviewEntry();
    expect(addEventListener).toHaveBeenCalledWith("click", instance.handleMobileNativeReviewEntry, true);
    instance.unbindMobileNativeReviewEntry();
    expect(removeEventListener).toHaveBeenCalledWith("click", instance.handleMobileNativeReviewEntry, true);
    vi.stubGlobal("document", previousDocument);
  });

  it("registers one native breadcrumb button for desktop and mobile editors", () => {
    const previousPlugin = plugin;
    const addBreadcrumbButton = vi.fn();
    const removeBreadcrumbButton = vi.fn();
    const reviewFromEditor = vi.fn();
    const instance = {
      breadcrumbButtonRegistered: false,
      runtime: { getSettings: () => ({ showBreadcrumbReviewButton: true }) },
      t: (key: string) => key === "lets-flashcard.reviewCurrentDocument" ? "复习当前文档闪卡" : key,
      reviewFromEditor,
    } as any;

    setPlugin({ addBreadcrumbButton, removeBreadcrumbButton } as never);
    try {
      (FlashcardPlugin.prototype as any).syncBreadcrumbButton.call(instance);
      expect(addBreadcrumbButton).toHaveBeenCalledTimes(1);
      const options = addBreadcrumbButton.mock.calls[0][0] as {
        id: string;
        icon: string;
        title: string;
        callback: (event: MouseEvent, protyle: unknown) => void;
      };
      expect(options).toMatchObject({
        id: "damophus-flashcard",
        icon: "iconRiffCard",
        title: "复习当前文档闪卡",
      });
      const protyle = { block: { rootID: "doc-1" } };
      options.callback({} as MouseEvent, protyle);
      expect(reviewFromEditor).toHaveBeenCalledWith(protyle);

      (FlashcardPlugin.prototype as any).syncBreadcrumbButton.call(instance);
      expect(removeBreadcrumbButton).toHaveBeenCalledWith("damophus-flashcard");
      expect(addBreadcrumbButton).toHaveBeenCalledTimes(2);
    } finally {
      setPlugin(previousPlugin as never);
    }
  });

  it("removes the breadcrumb button when its setting is disabled", () => {
    const previousPlugin = plugin;
    const removeBreadcrumbButton = vi.fn();
    const instance = {
      breadcrumbButtonRegistered: true,
      runtime: { getSettings: () => ({ showBreadcrumbReviewButton: false }) },
      t: (key: string) => key,
    } as any;

    setPlugin({ removeBreadcrumbButton } as never);
    try {
      (FlashcardPlugin.prototype as any).syncBreadcrumbButton.call(instance);
      expect(removeBreadcrumbButton).toHaveBeenCalledWith("damophus-flashcard");
      expect(instance.breadcrumbButtonRegistered).toBe(false);
    } finally {
      setPlugin(previousPlugin as never);
    }
  });

});
