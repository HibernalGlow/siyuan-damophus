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
      runtime: {
        getEnabledGroups: () => [{ id: "group-1", name: "含指定标签" }],
        getSettings: () => ({ deckId: "20230218211946-2kw8jgx" }),
      },
      openSettings: vi.fn(),
      reviewAll: vi.fn(),
      reviewGroup: vi.fn(),
      openMakeScope: vi.fn(),
      currentReviewContext: () => undefined,
      makeScope: FlashcardPlugin.prototype.makeScope,
      actionCategory: FlashcardPlugin.prototype.actionCategory,
      reviewCategory: FlashcardPlugin.prototype.reviewCategory,
      cancelCategory: FlashcardPlugin.prototype.cancelCategory,
      scopeActionLabel: FlashcardPlugin.prototype.scopeActionLabel,
    };

    FlashcardPlugin.prototype.addMenuItem.call(fakePlugin as never, { addItem } as never);

    expect(addItem).toHaveBeenCalledTimes(1);
    const item = addItem.mock.calls[0][0] as { label: string; type?: string; click?: unknown; submenu?: Array<{ label?: string; type?: string }> };
    expect(item.label).toBe("lets-flashcard.displayName");
    expect(item.type).toBe("submenu");
    expect(item.click).toBeUndefined();
    expect(item.submenu?.map((child) => child.label ?? child.type)).toEqual([
      "lets-flashcard.openSettings",
      "separator",
      "检测",
      "应用",
      "复习",
    ]);
    const detectMenu = item.submenu?.find((child) => child.label === "检测") as { submenu?: Array<{ label?: string }> };
    const applyMenu = item.submenu?.find((child) => child.label === "应用") as { submenu?: Array<{ label?: string }> };
    const reviewMenu = item.submenu?.find((child) => child.label === "复习") as { submenu?: Array<{ label?: string }> };
    expect(detectMenu.submenu?.map((child) => child.label)).toEqual(["含指定标签"]);
    expect(applyMenu.submenu?.map((child) => child.label)).toEqual(["含指定标签"]);
    expect(reviewMenu.submenu?.map((child) => child.label)).toEqual(["lets-flashcard.reviewAll", "含指定标签"]);
    (item.submenu?.[0] as { click?: () => void }).click?.();
    expect(fakePlugin.openSettings).toHaveBeenCalledTimes(1);
    detectMenu.submenu?.[0].click?.();
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
      makeScope: FlashcardPlugin.prototype.makeScope,
      actionCategory: FlashcardPlugin.prototype.actionCategory,
      reviewCategory: FlashcardPlugin.prototype.reviewCategory,
      cancelCategory: FlashcardPlugin.prototype.cancelCategory,
      scopeActionLabel: FlashcardPlugin.prototype.scopeActionLabel,
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
      runtime: {
        getEnabledGroups: () => [{ id: "group-1", name: "含指定标签" }],
        getSettings: () => ({ deckId: "20230218211946-2kw8jgx" }),
      },
      openSettings: vi.fn(),
      reviewAll,
      reviewGroup,
      reviewScopeCards: vi.fn(),
      openMakeScope: vi.fn(),
      unregisterContainers,
      unregisterDocumentTree,
      reviewDocumentTree: vi.fn(),
      openDocumentUnregisterDialog: vi.fn(),
      makeScope: FlashcardPlugin.prototype.makeScope,
      actionCategory: FlashcardPlugin.prototype.actionCategory,
      reviewCategory: FlashcardPlugin.prototype.reviewCategory,
      cancelCategory: FlashcardPlugin.prototype.cancelCategory,
      scopeActionLabel: FlashcardPlugin.prototype.scopeActionLabel,
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
    expect(addItem).toHaveBeenCalledTimes(1);
    const documentMenu = addItem.mock.calls[0][0] as { submenu?: Array<{ label?: string; type?: string; submenu?: Array<{ label?: string; click?: () => void }> }> };
    expect(documentMenu.submenu?.map((item) => item.label ?? item.type)).toEqual([
      "lets-flashcard.openSettings",
      "separator",
      "检测",
      "应用",
      "复习",
      "取消",
    ]);
    const documentDetect = documentMenu.submenu?.find((item) => item.label === "检测")!;
    const documentApply = documentMenu.submenu?.find((item) => item.label === "应用")!;
    const documentReview = documentMenu.submenu?.find((item) => item.label === "复习")!;
    const documentCancel = documentMenu.submenu?.find((item) => item.label === "取消")!;
    expect(documentDetect.submenu?.map((item) => item.label)).toEqual(["测试文档 · 全部闪卡", "测试文档 · 含指定标签"]);
    expect(documentApply.submenu?.map((item) => item.label)).toEqual(["测试文档 · 全部闪卡", "测试文档 · 含指定标签"]);
    expect(documentReview.submenu?.map((item) => item.label)).toEqual(["测试文档 · 全部到期卡"]);
    expect(documentCancel.submenu?.map((item) => item.label)).toEqual(["当前文档下所有闪卡登记"]);
    documentDetect.submenu?.[0].click?.();
    expect(instance.openMakeScope).toHaveBeenCalledWith(expect.objectContaining({
      type: "document",
      targetId: "20260823112002-aaaaaaa",
    }));
    documentApply.submenu?.[1].click?.();
    expect(instance.reviewScopeCards).toHaveBeenCalledWith(expect.objectContaining({
      type: "document",
      targetId: "20260823112002-aaaaaaa",
      groupId: "group-1",
    }));
    documentCancel.submenu?.[0].click?.();
    expect(instance.openDocumentUnregisterDialog).toHaveBeenCalledWith(["20260823112002-aaaaaaa"], "当前文档");

    addItem.mockClear();
    vi.stubGlobal("window", { siyuan: { notebooks: [{ id: "notebook-1", name: "测试笔记本" }] } });
    instance.handleDocumentTreeMenu({
      detail: { menu: blockMenu, type: "notebook", elements: [{ dataset: {}, parentElement: { dataset: { url: "notebook-1" } } }] },
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    const notebookMenu = addItem.mock.calls[0][0];
    expect(notebookMenu.submenu.map((item: { type?: string; label?: string }) => item.label ?? item.type)).toEqual([
      "lets-flashcard.openSettings",
      "separator",
      "检测",
      "应用",
      "复习",
      "取消",
    ]);
    notebookMenu.submenu.find((item: { label?: string; submenu?: Array<{ label?: string; click?: () => void }> }) => item.label === "取消")?.submenu?.[0].click?.();
    expect(unregisterDocumentTree).toHaveBeenCalledWith(
      ["notebook-1"],
      true,
      expect.objectContaining({ scope: "notebook", deckId: "20230218211946-2kw8jgx" }),
    );

    addItem.mockClear();
    instance.handleDocumentTreeMenu({
      detail: { menu: blockMenu, type: "document", elements: [{ dataset: { nodeId: "document-1", name: "测试文档" } }] },
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    const treeDocumentMenu = addItem.mock.calls[0][0] as { submenu?: Array<{ label?: string }> };
    expect(treeDocumentMenu.submenu?.map((item) => item.label)).toContain("检测");
    expect(treeDocumentMenu.submenu?.map((item) => item.label)).toContain("应用");
    expect(treeDocumentMenu.submenu?.map((item) => item.label)).toContain("复习");
    expect(treeDocumentMenu.submenu?.map((item) => item.label)).toContain("取消");
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

  it("registers the native breadcrumb button when the current frontend enables it", () => {
    const previousPlugin = plugin;
    const addBreadcrumbButton = vi.fn();
    const removeBreadcrumbButton = vi.fn();
    const reviewFromEditor = vi.fn();
    const instance = {
      breadcrumbButtonRegistered: false,
      runtime: { getSettings: () => ({
        showDesktopBreadcrumbReviewButton: true,
        showMobileBreadcrumbReviewButton: false,
      }) },
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

  it("removes the breadcrumb button when the current frontend disables it", () => {
    const previousPlugin = plugin;
    const removeBreadcrumbButton = vi.fn();
    const instance = {
      breadcrumbButtonRegistered: true,
      runtime: { getSettings: () => ({
        showDesktopBreadcrumbReviewButton: false,
        showMobileBreadcrumbReviewButton: true,
      }) },
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

  it("uses the mobile breadcrumb switch on mobile frontends", () => {
    const previousPlugin = plugin;
    const previousDocument = globalThis.document;
    const addBreadcrumbButton = vi.fn();
    const instance = {
      breadcrumbButtonRegistered: false,
      runtime: { getSettings: () => ({
        showDesktopBreadcrumbReviewButton: false,
        showMobileBreadcrumbReviewButton: true,
      }) },
      t: (key: string) => key,
      reviewFromEditor: vi.fn(),
    } as any;

    setPlugin({ addBreadcrumbButton } as never);
    vi.stubGlobal("document", { documentElement: { dataset: { frontend: "mobile" } } });
    try {
      (FlashcardPlugin.prototype as any).syncBreadcrumbButton.call(instance);
      expect(addBreadcrumbButton).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("document", previousDocument);
      setPlugin(previousPlugin as never);
    }
  });

});
