import { openTab, showMessage, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { plugin } from "@/utils";
import { inspectSkillSourceRoot, syncSkillSourceRoot } from "./api";
import { renderSkillManagerDock } from "./dock";
import { skillManagerTabTarget, skillManagerTabType } from "./tab-contract";
import "./skill-manager.css";

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
      this.openEntry.registerDock();
    }
    this.openEntry.setEnabled(true);
    this.renderOpenViews();
  }

  override async onLayoutReady(): Promise<void> {
    if (this.getSetting("detectUpdates") === false) return;
    const sourceRoot = this.sourceRoot();
    try {
      if (this.getSetting("syncOnStartup") === true) {
        const result = await syncSkillSourceRoot(sourceRoot, this.onlyChanged());
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
    this.dockCleanup = this.render(this.dockTarget, () => this.openInTab());
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
    }, undefined, onOpenTab);
  }

  private openInTab(): void {
    void openTab({
      app: plugin.app,
      custom: {
        icon: "iconSparkles",
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
      icon: "iconSparkles",
      execute: () => {
        document.querySelector<HTMLElement>('.dock__item[data-type="damophus-skill-manager-dock"]')?.click();
      },
      dock: {
        config: {
          position: "RightBottom",
          size: { width: 380, height: 0 },
          icon: "iconSparkles",
          title: this.t("lets-skill-manager.displayName"),
          show: false,
        },
        data: {},
        type: "damophus-skill-manager-dock",
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

  private labels() {
    return {
      title: this.t("lets-skill-manager.displayName"),
      refresh: this.t("lets-skill-manager.refresh"),
      openTab: this.t("lets-skill-manager.openTab"),
      source: this.t("lets-skill-manager.source"),
      syncAll: this.t("lets-skill-manager.syncAll"),
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
      failed: this.t("lets-skill-manager.failed"),
      confirmRemove: this.t("lets-skill-manager.confirmRemove"),
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
