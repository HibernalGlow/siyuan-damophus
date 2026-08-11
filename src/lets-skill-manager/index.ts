import { openTab, showMessage, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { resolveSiyuanPluginIcon } from "@/libs/plugin-icons";
import { plugin } from "@/utils";
import { inspectSkillSourceRoot, syncSkillSourceRoot, type SkillSyncOptions } from "./api";
import { renderSkillManagerDock } from "./dock";
import { skillManagerAppearance } from "./plugin";
import { skillManagerDockType, skillManagerTabTarget, skillManagerTabType } from "./tab-contract";
import "./skill-manager.css";

const skillManagerIcon = resolveSiyuanPluginIcon(skillManagerAppearance.icon);

export default class SkillManagerPlugin extends SubPluginBase {
  private tabRegistered = false;
  private openEntry?: UnifiedEntryPoint;
  private dockCleanup?: () => void;
  private dockTarget?: HTMLElement;
  private readonly tabCleanups = new Map<HTMLElement, () => void>();

  override registerModels(): void {
    if (!this.tabRegistered) {
      this.tabRegistered = true;
      const owner = this;
      plugin.addTab({
        type: skillManagerTabType,
        init() {
          const element = this.element as HTMLElement;
          owner.tabCleanups.get(element)?.();
          owner.tabCleanups.set(element, owner.render(element));
        },
        destroy() {
          const element = this.element as HTMLElement;
          owner.tabCleanups.get(element)?.();
          owner.tabCleanups.delete(element);
        },
      });
    }
  }

  override onload(): void {
    if (!this.openEntry) {
      this.openEntry = this.createOpenEntry();
    }
    this.openEntry.setSurfaces(this.configuredEntrySurfaces());
    this.openEntry.setEnabled(true);
    this.renderOpenViews();
  }

  override async onLayoutReady(): Promise<void> {
    if (this.getSetting("detectUpdates") === false) return;
    const sourceRoot = this.sourceRoot();
    try {
      if (this.getSetting("syncOnStartup") === true) {
        const result = await syncSkillSourceRoot(sourceRoot, this.onlyChanged(), this.syncOptions());
        if (result.synced > 0 || result.unreadable > 0) {
          showMessage(this.syncResultMessage(result.synced, result.skipped, result.unreadable), 5000);
        }
        this.renderOpenViews();
        return;
      }
      const statuses = await inspectSkillSourceRoot(sourceRoot);
      const updates = statuses.filter((skill) => skill.state === "missing" || skill.state === "update").length;
      const unreadable = statuses.filter((skill) => skill.state === "unreadable").length;
      if (updates > 0 || unreadable > 0) {
        showMessage(this.t("lets-skill-manager.updatesDetected")
          .replace("{updates}", String(updates))
          .replace("{unreadable}", String(unreadable)), 5000);
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
  }

  override onunload(): void {
    this.openEntry?.setEnabled(false);
    this.dockCleanup?.();
    this.dockCleanup = undefined;
    for (const cleanup of this.tabCleanups.values()) cleanup();
    this.tabCleanups.clear();
  }

  private renderDock(): void {
    if (!this.dockTarget) return;
    this.dockCleanup?.();
    this.dockCleanup = this.render(
      this.dockTarget,
      this.isEntryEnabled("tab") ? () => this.openInTab() : undefined,
    );
  }

  private renderOpenViews(): void {
    this.renderDock();
    for (const [element, cleanup] of this.tabCleanups) {
      cleanup();
      this.tabCleanups.set(element, this.render(element));
    }
  }

  private render(target: HTMLElement, onOpenTab?: () => void): () => void {
    return renderSkillManagerDock(target, this.labels(), {
      sourceRoot: this.sourceRoot(),
      onlyChanged: this.onlyChanged(),
      syncOptions: this.syncOptions(),
    }, undefined, onOpenTab);
  }

  private openInTab(): void {
    void openTab({
      app: plugin.app,
      custom: {
        icon: skillManagerIcon,
        title: this.t("lets-skill-manager.displayName"),
        ...skillManagerTabTarget(plugin.name),
      },
    });
  }

  private sourceRoot(): string {
    const configured = String(this.getSetting("sourceRoot") ?? "").trim();
    if (configured) return configured;
    const homeDir = window.siyuan?.config?.system?.homeDir?.replace(/[\\/]+$/u, "");
    return homeDir ? `${homeDir}/.skills-manager/skills` : "~/.skills-manager/skills";
  }

  private onlyChanged(): boolean {
    return this.getSetting("updateMode") !== "all";
  }

  private syncOptions(): SkillSyncOptions {
    const workspaceDir = String(window.siyuan?.config?.system?.workspaceDir ?? "").replace(/[\\/]+$/u, "");
    return {
      backend: this.getSetting("syncBackend") === "builtin" ? "builtin" : "chezmoi",
      chezmoiCommand: String(this.getSetting("chezmoiCommand") ?? "chezmoi").trim() || "chezmoi",
      destinationRoot: workspaceDir ? `${workspaceDir}/data/storage/ai/agent/skills` : "",
    };
  }

  private syncResultMessage(synced: number, skipped: number, unreadable: number): string {
    return this.t("lets-skill-manager.syncResult")
      .replace("{synced}", String(synced))
      .replace("{skipped}", String(skipped))
      .replace("{unreadable}", String(unreadable));
  }

  addMenuItem(menu: Menu): void {
    this.openEntry?.addMenuItem(menu);
  }

  private createOpenEntry(): UnifiedEntryPoint {
    return new UnifiedEntryPoint({
      id: "skill-manager.open",
      title: this.t("lets-skill-manager.menu"),
      icon: skillManagerIcon,
      execute: () => this.openConfiguredSurface(),
      command: { langKey: "lets-skill-manager.commandOpen" },
      dock: {
        config: {
          position: "RightBottom",
          size: { width: 380, height: 0 },
          icon: skillManagerIcon,
          title: this.t("lets-skill-manager.displayName"),
          show: false,
        },
        data: {},
        type: skillManagerDockType,
        init: (target) => {
          this.dockTarget = target;
          this.renderDock();
        },
        destroy: () => {
          this.dockCleanup?.();
          this.dockCleanup = undefined;
          this.dockTarget = undefined;
        },
      },
    }, plugin);
  }

  private configuredEntrySurfaces() {
    const dock = this.isEntryEnabled("dock");
    const tab = this.isEntryEnabled("tab");
    const hasTarget = dock || tab;
    return {
      menu: hasTarget && this.isEntryEnabled("menu"),
      dock,
      command: hasTarget && this.isEntryEnabled("command"),
    };
  }

  private openConfiguredSurface(): void {
    if (this.isEntryEnabled("dock")) {
      if (this.openEntry?.openDock()) {
        return;
      }
    }
    if (this.isEntryEnabled("tab")) this.openInTab();
  }

  private labels() {
    return {
      title: this.t("lets-skill-manager.displayName"),
      refresh: this.t("lets-skill-manager.refresh"),
      openTab: this.t("lets-skill-manager.openTab"),
      source: this.t("lets-skill-manager.source"),
      syncAll: this.t("lets-skill-manager.syncAll"),
      updateAll: this.t("lets-skill-manager.updateAll"),
      update: this.t("lets-skill-manager.update"),
      newSkill: this.t("lets-skill-manager.newSkill"),
      select: this.t("lets-skill-manager.select"),
      content: this.t("lets-skill-manager.content"),
      save: this.t("lets-skill-manager.save"),
      rename: this.t("lets-skill-manager.rename"),
      remove: this.t("lets-skill-manager.remove"),
      empty: this.t("lets-skill-manager.empty"),
      saved: this.t("lets-skill-manager.saved"),
      synced: this.t("lets-skill-manager.synced"),
      syncResult: this.t("lets-skill-manager.syncResult"),
      updateResult: this.t("lets-skill-manager.updateResult"),
      failed: this.t("lets-skill-manager.failed"),
      confirmRemove: this.t("lets-skill-manager.confirmRemove"),
      search: this.t("lets-skill-manager.search"),
      filterState: this.t("lets-skill-manager.filterState"),
      allStates: this.t("lets-skill-manager.allStates"),
      sort: this.t("lets-skill-manager.sort"),
      sortNameAsc: this.t("lets-skill-manager.sortNameAsc"),
      sortNameDesc: this.t("lets-skill-manager.sortNameDesc"),
      sortState: this.t("lets-skill-manager.sortState"),
      preview: this.t("lets-skill-manager.preview"),
      edit: this.t("lets-skill-manager.edit"),
      visibleCount: this.t("lets-skill-manager.visibleCount"),
      logs: this.t("lets-skill-manager.logs"),
      logsEmpty: this.t("lets-skill-manager.logsEmpty"),
      copyLogs: this.t("lets-skill-manager.copyLogs"),
      clearLogs: this.t("lets-skill-manager.clearLogs"),
      logsCopied: this.t("lets-skill-manager.logsCopied"),
      logStarted: this.t("lets-skill-manager.logStarted"),
      logCompleted: this.t("lets-skill-manager.logCompleted"),
      logFailed: this.t("lets-skill-manager.logFailed"),
      logRefresh: this.t("lets-skill-manager.logRefresh"),
      states: {
        missing: this.t("lets-skill-manager.stateMissing"),
        synced: this.t("lets-skill-manager.stateSynced"),
        update: this.t("lets-skill-manager.stateUpdate"),
        "target-only": this.t("lets-skill-manager.stateTargetOnly"),
        unreadable: this.t("lets-skill-manager.stateUnreadable"),
      },
    };
  }
}
