import { fetchSyncPost, getFrontend, openTab, showMessage, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import {
  createAgentModeToggle,
  isAgentMenuTarget,
  isMobileAgentEntryTarget,
  resolveAgentSurface,
  selectedBlockIds,
} from "./surface-helpers";
import "./agent-surface.css";

const log = getLogger("lets-agent-surface");
const AGENT_TAB_TYPE = "damophus-agent-surface-tab";
type AgentModel = {
  panelElement?: HTMLElement;
  insertBlockMentions?: (mentions: BlockMention[]) => void;
};
type BlockMention = { id: string; label: string };
type DockHost = {
  layout?: { element?: HTMLElement };
  data?: Record<string, AgentModel | undefined>;
};

function desktopDockHosts(): DockHost[] {
  const layout = (window.siyuan as unknown as {
    layout?: { leftDock?: DockHost; rightDock?: DockHost; bottomDock?: DockHost };
  }).layout;
  return [layout?.leftDock, layout?.rightDock, layout?.bottomDock].filter(
    (host): host is DockHost => Boolean(host),
  );
}

function agentModel(): AgentModel | undefined {
  if (getFrontend() === "mobile" || getFrontend() === "browser-mobile") {
    return (window.siyuan as unknown as { mobile?: { agentChat?: AgentModel } }).mobile?.agentChat;
  }
  for (const host of desktopDockHosts()) {
    const model = host.data?.agentChat;
    if (model) return model;
  }
  return undefined;
}

export default class AgentSurfacePlugin extends SubPluginBase {
  private listening = false;
  private tabRegistered = false;
  private allowingNativeDockClick = false;
  private allowingNativeMobileAgentClick = false;
  private panelOrigin?: { parent: Node; nextSibling: ChildNode | null };
  private readonly tabTargets = new Set<HTMLElement>();
  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const agentDock = event.target instanceof Element
      ? event.target.closest('.dock__item[data-type="agentChat"]')
      : null;
    if (agentDock && !this.allowingNativeDockClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.openAgent();
      return;
    }
    const mobileFrontend = getFrontend() === "mobile" || getFrontend() === "browser-mobile";
    if (mobileFrontend && !this.allowingNativeMobileAgentClick
      && isMobileAgentEntryTarget(event.target)) {
      if (this.mobileDropdown()) window.setTimeout(() => this.applyMobileDropdownSurface(), 0);
      return;
    }
    if (!this.shouldIntercept()) return;
    if (!isAgentMenuTarget(event.target)) return;

    if (resolveAgentSurface(getFrontend(), this.openInNewTab()) === "desktop-tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closeNativeMenu();
      void this.openAgent(selectedBlockIds());
      return;
    }
    // Native mode keeps ownership of both opening and reference insertion.
    if (mobileFrontend && this.mobileDropdown()) window.setTimeout(() => this.applyMobileDropdownSurface(), 0);
  };
  private readonly handleMobileSidebarBack = (event: MouseEvent): void => {
    if (getFrontend() !== "mobile" && getFrontend() !== "browser-mobile") return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target?.closest("#sidebar > .toolbar--border > svg:last-child")) return;
    const sidebar = document.getElementById("sidebar");
    const model = document.getElementById("model");
    if (sidebar?.style.transform !== "translateX(0px)" || model?.style.transform !== "translateX(0px)") return;

    // SiYuan's mobile back handler checks #model before #sidebar. When both
    // are open, keep the Agent conversation alive and close only the sidebar.
    event.preventDefault();
    event.stopImmediatePropagation();
    sidebar.style.transform = "";
    const mask = document.querySelector<HTMLElement>(".side-mask");
    mask?.classList.add("fn__none");
    if (mask) mask.style.opacity = "";
  };

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: AGENT_TAB_TYPE,
      init() {
        const target = this.element as HTMLElement;
        target.classList.add("damophus-agent-tab-host");
        void owner.attachTab(target);
      },
      destroy() {
        owner.detachTab(this.element as HTMLElement);
      },
    });
  }

  override onload(): void {
    if (!this.listening) {
      this.listening = true;
      document.addEventListener("click", this.handleDocumentClick, true);
      document.addEventListener("click", this.handleMobileSidebarBack, true);
    }
  }

  override onLayoutReady(): void {
  }

  override onunload(): void {
    if (this.listening) {
      document.removeEventListener("click", this.handleDocumentClick, true);
      document.removeEventListener("click", this.handleMobileSidebarBack, true);
      this.listening = false;
    }
    this.closeNativeMobileAgent();
    document.getElementById("model")?.classList.remove("damophus-agent-dropdown-mobile");
    for (const target of this.tabTargets) this.detachTab(target);
    this.panelOrigin = undefined;
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    menu.addItem({
      icon: "iconSparkles",
      label: this.t("lets-agent-surface.open"),
      click: () => void this.openAgent(),
    });
    const mobileFrontend = getFrontend() === "mobile" || getFrontend() === "browser-mobile";
    menu.addItem(createAgentModeToggle(
      mobileFrontend ? this.mobileDropdown() : this.openInNewTab(),
      this.t(mobileFrontend ? "lets-agent-surface.mobileDropdownMenu" : "lets-agent-surface.openInNewTabMenu"),
      (value) => this.setSetting(mobileFrontend ? "mobileDropdown" : "openInNewTab", value),
    ));
  }

  private shouldIntercept(): boolean {
    return this.getSetting("interceptAddToAgent") !== false;
  }

  private openInNewTab(): boolean {
    return this.getSetting("openInNewTab") === true;
  }

  private mobileDropdown(): boolean {
    return this.getSetting("mobileDropdown") !== false;
  }

  private closeNativeMenu(): void {
    const menus = (window.siyuan as unknown as {
      menus?: { menu?: { close?: () => void; remove?: () => void } };
    }).menus;
    if (typeof menus?.menu?.close === "function") menus.menu.close();
    else menus?.menu?.remove?.();
  }

  private async openAgent(ids: string[] = []): Promise<void> {
    const surface = resolveAgentSurface(getFrontend(), this.openInNewTab(), this.mobileDropdown());
    if (surface === "mobile-dropdown" || surface === "mobile-native") {
      this.openMobileAgent();
      if (ids.length > 0) {
        window.setTimeout(() => this.insertBlockMentions(ids), 120);
      }
      return;
    }
    if (surface === "desktop-tab" && this.isEntryEnabled("tab")) {
      await this.openAgentTab(ids);
      return;
    }
    this.openDesktopAgent();
    if (ids.length > 0) window.setTimeout(() => this.insertBlockMentions(ids), 80);
  }

  private openDesktopAgent(): void {
    const item = document.querySelector<HTMLElement>('.dock__item[data-type="agentChat"]');
    if (!item) {
      showMessage(this.t("lets-agent-surface.unavailable"), 3000, "error");
      return;
    }
    if (!item.classList.contains("dock__item--active")) this.clickNativeAgentDock(item);
  }

  private clickNativeAgentDock(item: HTMLElement): void {
    this.allowingNativeDockClick = true;
    try {
      item.click();
    } finally {
      this.allowingNativeDockClick = false;
    }
  }

  private openMobileAgent(): void {
    const nativeMenuItem = document.querySelector<HTMLElement>("#menuAgentChat");
    if (nativeMenuItem) {
      this.clickNativeMobileAgentEntry(nativeMenuItem);
      if (this.mobileDropdown()) window.setTimeout(() => this.applyMobileDropdownSurface(), 0);
      return;
    }
    const menuButton = document.querySelector<HTMLElement>(
      '#toolbarMore, #toolbar [data-type="menu"], #toolbar [data-type="more"], #toolbar .toolbar__icon[aria-label*="Menu"]',
    );
    if (!menuButton) {
      showMessage(this.t("lets-agent-surface.mobileUnavailable"), 3000, "error");
      return;
    }
    menuButton.click();
    window.setTimeout(() => {
      const item = document.querySelector<HTMLElement>("#menuAgentChat");
      if (item) this.clickNativeMobileAgentEntry(item);
      if (this.mobileDropdown()) window.setTimeout(() => this.applyMobileDropdownSurface(), 0);
    }, 0);
  }

  private clickNativeMobileAgentEntry(item: HTMLElement): void {
    this.allowingNativeMobileAgentClick = true;
    try {
      item.click();
    } finally {
      this.allowingNativeMobileAgentClick = false;
    }
  }

  private closeNativeMobileAgent(): void {
    const model = document.getElementById("model");
    if (model && model.getBoundingClientRect().left < window.innerWidth) {
      document.getElementById("modelClose")?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
    }
    model?.classList.remove("damophus-agent-dropdown-mobile");
  }

  private async openAgentTab(ids: string[]): Promise<void> {
    if (!await this.ensureDesktopAgentModel()) return;
    await openTab({
      app: plugin.app,
      custom: {
        id: `${plugin.name}${AGENT_TAB_TYPE}`,
        icon: "iconSparkles",
        title: this.t("lets-agent-surface.displayName"),
      },
    });
    if (ids.length > 0) window.setTimeout(() => this.insertBlockMentions(ids), 80);
  }

  private async ensureDesktopAgentModel(): Promise<AgentModel | undefined> {
    const existing = agentModel();
    if (existing?.panelElement) return existing;
    this.openDesktopAgent();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
      const model = agentModel();
      if (model?.panelElement) return model;
    }
    log.warn("native agent model did not become available");
    return undefined;
  }

  private async attachTab(target: HTMLElement): Promise<void> {
    const model = await this.ensureDesktopAgentModel();
    const panel = model?.panelElement;
    if (!panel) return;
    if (panel.parentElement === target) return;
    this.rememberPanelOrigin(panel);
    target.replaceChildren(panel);
    this.tabTargets.add(target);
    this.collapseNativeAgentDock();
  }

  private detachTab(target: HTMLElement): void {
    const panel = target.querySelector<HTMLElement>(".sy__agentChat");
    if (panel) this.restorePanel(panel);
    this.tabTargets.delete(target);
  }

  private rememberPanelOrigin(panel: HTMLElement): void {
    if (this.panelOrigin || !panel.parentNode) return;
    this.panelOrigin = { parent: panel.parentNode, nextSibling: panel.nextSibling };
  }

  private restorePanel(panel: HTMLElement): void {
    const origin = this.panelOrigin;
    if (!origin) return;
    const nextSibling = origin.nextSibling?.parentNode === origin.parent ? origin.nextSibling : null;
    origin.parent.insertBefore(panel, nextSibling);
  }

  private collapseNativeAgentDock(): void {
    const item = document.querySelector<HTMLElement>('.dock__item[data-type="agentChat"]');
    if (item?.classList.contains("dock__item--active")) this.clickNativeAgentDock(item);
  }

  private async insertBlockMentions(ids: string[]): Promise<void> {
    const mentions = await Promise.all(ids.map(async (id): Promise<BlockMention> => {
      try {
        const response = await fetchSyncPost("/api/block/getRefText", { id });
        if (typeof response?.data === "string" && response.data) {
          return { id, label: response.data };
        }
      } catch (error) {
        log.warn("failed to resolve block mention label", { id, error });
      }
      return { id, label: id };
    }));
    const model = agentModel();
    model?.insertBlockMentions?.(mentions);
  }

  private applyMobileDropdownSurface(): void {
    if (getFrontend() === "mobile" || getFrontend() === "browser-mobile") {
      const model = document.getElementById("model");
      // `#model` is the native mobile Agent host, but its inner class changed
      // between SiYuan releases. The call site is reached only after the
      // Agent entry has been activated, so do not gate the layout on a brittle
      // version-specific child selector.
      if (model) model.classList.add("damophus-agent-dropdown-mobile");
      return;
    }
  }
}

export { AGENT_TAB_TYPE };
