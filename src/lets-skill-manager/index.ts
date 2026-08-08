import { type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { renderSkillManagerDock } from "./dock";
import "./skill-manager.css";

export default class SkillManagerPlugin extends SubPluginBase {
  private cleanup?: () => void;

  override registerModels(): void {
    const owner = this;
    plugin.addDock({
      config: {
        position: "RightBottom",
        size: { width: 380, height: 0 },
        icon: "iconSparkles",
        title: this.t("lets-skill-manager.displayName"),
        show: false,
      },
      data: {},
      type: "damophus-skill-manager-dock",
      init() {
        owner.cleanup?.();
        owner.cleanup = renderSkillManagerDock(this.element as HTMLElement, owner.labels());
      },
      destroy() {
        owner.cleanup?.();
        owner.cleanup = undefined;
      },
    });
  }

  override onunload(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconSparkles",
      label: this.t("lets-skill-manager.menu"),
      click: () => {
        const dock = document.querySelector<HTMLElement>('.dock__item[data-type="damophus-skill-manager-dock"]');
        dock?.click();
      },
    });
  }

  private labels() {
    return {
      title: this.t("lets-skill-manager.displayName"),
      refresh: this.t("lets-skill-manager.refresh"),
      source: this.t("lets-skill-manager.source"),
      sourcePlaceholder: this.t("lets-skill-manager.sourcePlaceholder"),
      sync: this.t("lets-skill-manager.sync"),
      newSkill: this.t("lets-skill-manager.newSkill"),
      nameOptional: this.t("lets-skill-manager.nameOptional"),
      select: this.t("lets-skill-manager.select"),
      content: this.t("lets-skill-manager.content"),
      save: this.t("lets-skill-manager.save"),
      rename: this.t("lets-skill-manager.rename"),
      remove: this.t("lets-skill-manager.remove"),
      empty: this.t("lets-skill-manager.empty"),
      saved: this.t("lets-skill-manager.saved"),
      synced: this.t("lets-skill-manager.synced"),
      failed: this.t("lets-skill-manager.failed"),
      confirmRemove: this.t("lets-skill-manager.confirmRemove"),
    };
  }
}
