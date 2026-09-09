import { showMessage, type IEventBusMap, type IMenu, type Menu } from "siyuan";
import { registerReviewToolbarAction, type ReviewToolbarAction } from "@/flashcard/review-action-registry";
import type { FlashcardGroup, FlashcardReviewScope } from "@/flashcard/types";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import type { NativePriorityControls } from "@/flashcard/native-priority-controls";
import type { FlashcardUnregisterAudit, FlashcardUnregisterScope, RiffCardRecord } from "@/flashcard/siyuan-adapter";

export interface FlashcardMenuHost {
  readonly runtime: FlashcardRuntime;
  readonly compat: Pick<FlashcardRendererCompat, "install" | "uninstall">;
  readonly priorityControls: Pick<NativePriorityControls, "openPriorityMenuForAction" | "refresh">;
  isEntryEnabled(surface: string): boolean;
  t(key: string): string;
  openSettings(): void;
  currentReviewContext(): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined;
  makeScope(type: "document" | "notebook" | "group", targetId: string, targetName: string, group?: FlashcardGroup): FlashcardReviewScope;
  actionCategory(label: string, scopes: readonly FlashcardReviewScope[], action: "detect" | "apply"): IMenu;
  reviewCategory(context: { documentId: string; documentName: string } | undefined, groups: readonly FlashcardGroup[], notebookIds?: readonly string[], includeGlobal?: boolean, includeGroups?: boolean): IMenu;
  cancelCategory(targetIds: readonly string[], label: string, notebook?: boolean): IMenu;
  scopeActionLabel(scope: FlashcardReviewScope): string;
  reviewAll(): Promise<void>;
  syncTwinCards(): Promise<void>;
  reviewGroup(group: FlashcardGroup): Promise<void>;
  reviewScopeCards(scope: FlashcardReviewScope, retryAfterRegistration?: boolean): Promise<void>;
  openMakeScope(scope: FlashcardReviewScope): Promise<void>;
  reviewDocumentTree(ids: readonly string[], notebook: boolean, label: string): Promise<void>;
  reviewContainerSelection(ids: readonly string[], label: string): Promise<void>;
  unregisterContainers(containerIds: readonly string[], label: string): Promise<void>;
  unregisterDocumentTree(ids: readonly string[], notebook: boolean, audit?: FlashcardUnregisterAudit): Promise<void>;
  openDocumentUnregisterDialog(targetIds: readonly string[], label: string): void;
  createUnregisterAudit(scope: FlashcardUnregisterScope): FlashcardUnregisterAudit;
  documentScopeMenuItems(documentId: string, targetName: string): IMenu[];
  contextScopeMenuItem(type: "document" | "notebook", targetIds: readonly string[], targetName: string, providedScopes?: FlashcardReviewScope[]): IMenu;
  locateCard(card: RiffCardRecord): Promise<void>;
  unregisterCard(card: RiffCardRecord): Promise<boolean>;
  toggleRendererOverride(): Promise<void>;
}

export function buildFlashcardMenu(host: FlashcardMenuHost, menu: Menu): void {
  if (!host.isEntryEnabled("menu") || (!host.isEntryEnabled("tab") && !host.isEntryEnabled("dock"))) return;
  const submenu: IMenu[] = [];
  if (host.isEntryEnabled("tab")) {
    submenu.push({
      icon: "iconRiffCard",
      label: host.t("lets-flashcard.openSettings"),
      click: () => host.openSettings(),
    });
  }
  submenu.push({
    icon: "iconRefresh",
    label: "同步孪生卡进度",
    click: () => void host.syncTwinCards(),
  });
  const context = host.currentReviewContext();
  const groups = host.runtime.getEnabledGroups();
  const contextScopes = context
    ? [
      host.makeScope("document", context.documentId, "当前文档"),
      ...groups.map((group) => host.makeScope("document", context.documentId, "当前文档", group)),
    ]
    : [];
  const groupScopes = groups.map((group) => host.makeScope("group", group.id, group.name, group));
  const scopedActions = [...contextScopes, ...groupScopes];
  if (scopedActions.length > 0) {
    submenu.push({ type: "separator" });
    submenu.push(host.actionCategory("检测", scopedActions, "detect"));
    submenu.push(host.actionCategory("应用", scopedActions, "apply"));
    submenu.push(host.reviewCategory(context, groups));
    if (context) submenu.push(host.cancelCategory([context.documentId], "当前文档"));
  } else {
    submenu.push({
      icon: "iconRiffCard",
      label: host.t("lets-flashcard.reviewAll"),
      click: () => void host.reviewAll(),
    });
  }
  menu.addItem({
    icon: "iconRiffCard",
    label: host.t("lets-flashcard.displayName"),
    type: "submenu",
    submenu,
  });
}

export function buildBlockMenu(
  host: FlashcardMenuHost,
  event: CustomEvent<IEventBusMap["click-blockicon"]>,
): void {
  if (!host.isEntryEnabled("contextMenu")) return;
  const ids = event.detail.blockElements
    .map((element) => element.dataset.nodeId ?? "")
    .filter(Boolean);
  if (ids.length === 0) return;
  event.detail.menu.addItem({
    icon: "iconRiffCard",
    label: ids.length > 1 ? "复习所选容器内闪卡" : "复习此容器内闪卡",
    click: () => void host.reviewContainerSelection(ids, ids.length > 1 ? "所选容器" : "当前容器"),
  });
  event.detail.menu.addItem({
    icon: "iconCloseRound",
    label: ids.length > 1 ? "取消所选容器内所有闪卡登记" : "取消此容器内所有闪卡登记",
    click: () => void host.unregisterContainers(ids, "所选容器"),
  });
}

export function buildDocumentTitleMenu(
  host: FlashcardMenuHost,
  event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
): void {
  if (!host.isEntryEnabled("contextMenu")) return;
  const documentId = event.detail.data.id;
  if (!documentId) return;
  const targetName = event.detail.data.name ?? documentId;
  for (const item of host.documentScopeMenuItems(documentId, targetName)) event.detail.menu.addItem(item);
}

export function buildDocumentTreeMenu(
  host: FlashcardMenuHost,
  event: CustomEvent<IEventBusMap["open-menu-doctree"]>,
): void {
  if (!host.isEntryEnabled("contextMenu")) return;
  const isNotebook = event.detail.type === "notebook";
  const ids = [...event.detail.elements]
    .map((element) => isNotebook
      ? element.dataset.nodeId ?? element.dataset.url ?? element.parentElement?.dataset.url ?? ""
      : element.dataset.nodeId ?? "")
    .filter(Boolean);
  if (ids.length === 0) return;
  const targetName = ids.length > 1
    ? (isNotebook ? "所选笔记本" : "所选文档")
    : (isNotebook
      ? window.siyuan?.notebooks?.find((notebook) => notebook.id === ids[0])?.name
      : event.detail.elements[0]?.dataset.name) ?? ids[0];
  if (isNotebook) {
    event.detail.menu.addItem(host.contextScopeMenuItem("notebook", ids, targetName));
    return;
  }
  if (ids.length === 1) {
    for (const item of host.documentScopeMenuItems(ids[0], targetName)) event.detail.menu.addItem(item);
    return;
  }
  event.detail.menu.addItem(host.contextScopeMenuItem("document", ids, targetName));
}

export function documentScopeMenuItems(
  host: FlashcardMenuHost,
  documentId: string,
  targetName: string,
): IMenu[] {
  const scopes = [
    host.makeScope("document", documentId, targetName),
    ...host.runtime.getEnabledGroups().map((group) => host.makeScope("document", documentId, targetName, group)),
  ];
  return [
    host.contextScopeMenuItem("document", [documentId], targetName, scopes),
  ];
}

export function registerReviewToolbarActions(host: FlashcardMenuHost): Array<() => void> {
  const actions: ReviewToolbarAction[] = [
    {
      id: "locate", icon: "iconFocus", label: "定位闪卡原块", source: "DAMO",
      execute: async (context) => { const card = await context.resolveCard(); if (card) await host.locateCard(card); },
    },
    {
      id: "unregister", icon: "iconCloseRound", label: "取消闪卡登记", source: "DAMO",
      execute: async (context) => {
        const card = await context.resolveCard();
        if (card && await host.unregisterCard(card)) context.click('.card__action:not(.fn__none) button[data-type="-3"]');
      },
    },
    {
      id: "priority", icon: "iconSort", label: "设置闪卡优先级", source: "DAMO",
      execute: async (context) => { const card = await context.resolveCard(); if (card) host.priorityControls.openPriorityMenuForAction(context.trigger, card); },
    },
    {
      id: "renderer", icon: "iconEye", label: "切换按卡片渲染", source: "DAMO",
      execute: () => host.toggleRendererOverride(),
    },
    { id: "workbench", icon: "iconSettings", label: "打开闪卡工作台", source: "DAMO", execute: () => host.openSettings() },
    { id: "native.filter", icon: "iconFilter", label: "原生筛选", source: "思源", execute: (context) => { context.click('[data-type="filter"]'); } },
    { id: "native.fullscreen", icon: "iconFullscreen", label: "原生全屏", source: "思源", execute: (context) => { context.click('[data-type="fullscreen"]'); } },
    { id: "native.more", icon: "iconMore", label: "更多", source: "思源", execute: (context) => { context.click('[data-type="more"]'); } },
  ];
  return actions.map((action) => registerReviewToolbarAction(action));
}

export async function toggleRendererOverride(host: FlashcardMenuHost): Promise<void> {
  const settings = host.runtime.getSettings();
  const enabled = !settings.rendererInterceptionEnabled;
  await host.runtime.saveSettings({ ...settings, rendererInterceptionEnabled: enabled });
  if (enabled) host.compat.install();
  else host.compat.uninstall();
  host.priorityControls.refresh();
  showMessage(enabled ? "已启用按卡片 renderer 渲染" : "已关闭按卡片 renderer 渲染", 3000, "info");
}

export function contextScopeMenuItem(
  host: FlashcardMenuHost,
  type: "document" | "notebook",
  targetIds: readonly string[],
  targetName: string,
  providedScopes?: FlashcardReviewScope[],
): IMenu {
  const singleTarget = targetIds.length === 1;
  const submenu: IMenu[] = [];
  if (host.isEntryEnabled("tab")) {
    submenu.push({
      icon: "iconRiffCard",
      label: host.t("lets-flashcard.openSettings"),
      click: () => host.openSettings(),
    });
    submenu.push({ type: "separator" });
  }
  const scopes = providedScopes ?? (singleTarget
    ? [
      host.makeScope(type, targetIds[0], targetName),
      ...host.runtime.getEnabledGroups().map((group) => host.makeScope(type, targetIds[0], targetName, group)),
    ]
    : []);
  if (scopes.length > 0) {
    submenu.push(host.actionCategory("检测", scopes, "detect"));
    submenu.push(host.actionCategory("应用", scopes, "apply"));
  }
  if (singleTarget) {
    submenu.push(host.reviewCategory(
      { documentId: targetIds[0], documentName: targetName },
      host.runtime.getEnabledGroups(),
      type === "notebook" ? targetIds : undefined,
      false,
      false,
    ));
  } else {
    submenu.push({
      icon: "iconPlay",
      label: "复习",
      type: "submenu",
      submenu: [{
        icon: type === "notebook" ? "iconNotebook" : "iconFile",
        label: `${targetName} · 全部到期卡`,
        click: () => void host.reviewDocumentTree(targetIds, type === "notebook", targetName),
      }],
    });
  }
  submenu.push(host.cancelCategory(
    targetIds,
    type === "notebook" ? (singleTarget ? "当前笔记本" : "所选笔记本") : (singleTarget ? "当前文档" : "所选文档"),
    type === "notebook",
  ));
  return {
    icon: "iconRiffCard",
    label: host.t("lets-flashcard.displayName"),
    type: "submenu",
    submenu,
  };
}

export function actionCategory(
  host: FlashcardMenuHost,
  label: string,
  scopes: readonly FlashcardReviewScope[],
  action: "detect" | "apply",
): IMenu {
  return {
    icon: action === "detect" ? "iconSearch" : "iconRiffCard",
    label,
    type: "submenu",
    submenu: scopes.map((scope) => ({
      icon: action === "detect" ? "iconSearch" : "iconRiffCard",
      label: host.scopeActionLabel(scope),
      click: () => void (action === "detect" ? host.openMakeScope(scope) : host.reviewScopeCards(scope)),
    })),
  };
}

export function reviewCategory(
  host: FlashcardMenuHost,
  context: { documentId: string; documentName: string } | undefined,
  groups: readonly FlashcardGroup[],
  notebookIds?: readonly string[],
  includeGlobal = true,
  includeGroups = true,
): IMenu {
  const submenu: IMenu[] = [];
  if (includeGlobal) {
    submenu.push({
      icon: "iconRiffCard",
      label: host.t("lets-flashcard.reviewAll"),
      click: () => void host.reviewAll(),
    });
  }
  if (context) {
    submenu.push({
      icon: "iconFile",
      label: `${context.documentName} · 全部到期卡`,
      click: () => void host.reviewDocumentTree(
        notebookIds ?? [context.documentId],
        Boolean(notebookIds),
        context.documentName,
      ),
    });
  }
  if (includeGroups) {
    for (const group of groups) {
      submenu.push({
        icon: "iconRiffCard",
        label: group.name,
        click: () => void host.reviewGroup(group),
      });
    }
  }
  return { icon: "iconPlay", label: "复习", type: "submenu", submenu };
}

export function cancelCategory(
  host: FlashcardMenuHost,
  targetIds: readonly string[],
  label: string,
  notebook = false,
): IMenu {
  return {
    icon: "iconCloseRound",
    label: "取消",
    type: "submenu",
    submenu: [{
      icon: "iconCloseRound",
      label: `${label}下所有闪卡登记`,
      click: () => {
        if (notebook) {
          void host.unregisterDocumentTree(targetIds, true, host.createUnregisterAudit("notebook"));
          return;
        }
        void host.openDocumentUnregisterDialog(targetIds, label);
      },
    }],
  };
}

export function documentUnregisterMenuItem(
  host: FlashcardMenuHost,
  targetIds: readonly string[],
  label: string,
): IMenu {
  return {
    icon: "iconCloseRound",
    label: `取消${label}闪卡登记`,
    click: () => host.openDocumentUnregisterDialog(targetIds, label),
  };
}
