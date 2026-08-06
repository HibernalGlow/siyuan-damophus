import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import { getAllEditor, openMobileFileById, type IEventBusMap, type IProtyle } from "siyuan";
import { MobileBreadcrumbRenderer } from "./breadcrumb-renderer";
import { MobileFlashcardBreadcrumbController } from "./flashcard-breadcrumb";

export default class MobileBreadcrumbPlugin extends SubPluginBase {
  private listening = false;
  private readonly renderer = new MobileBreadcrumbRenderer({
    getSetting: (key) => this.getSetting(key),
    getExpandLabel: () => this.t("lets-mobile-breadcrumb.expand"),
    openMobileFile: (id) => openMobileFileById(plugin.app, id, ["cb-get-focus", "cb-get-all"]),
  });
  private readonly flashcards = new MobileFlashcardBreadcrumbController(this.renderer, document);

  private readonly handleLoaded = (
    event: CustomEvent<IEventBusMap["loaded-protyle-static"]>,
  ): void => {
    if (isMobile) void this.renderer.enhance(event.detail.protyle);
  };

  private readonly handleSwitch = (
    event: CustomEvent<IEventBusMap["switch-protyle"]>,
  ): void => {
    if (isMobile) void this.renderer.enhance(event.detail.protyle, undefined, true);
  };

  private readonly handleEditorClick = (
    event: CustomEvent<IEventBusMap["click-editorcontent"]>,
  ): void => {
    if (!isMobile) return;
    const target = event.detail.event.target;
    void this.renderer.enhance(
      event.detail.protyle,
      target instanceof Element ? target : undefined,
    );
  };

  override onload(): void {
    if (!this.listening) {
      this.listening = true;
      plugin.eventBus.on("loaded-protyle-static", this.handleLoaded);
      plugin.eventBus.on("switch-protyle", this.handleSwitch);
      plugin.eventBus.on("click-editorcontent", this.handleEditorClick);
    }
    if (isMobile) this.flashcards.start();
    for (const editor of getAllEditor()) {
      if (isMobile) void this.renderer.enhance(editor.protyle, undefined, true);
    }
  }

  override onunload(): void {
    this.flashcards.stop();
    if (this.listening) {
      plugin.eventBus.off("loaded-protyle-static", this.handleLoaded);
      plugin.eventBus.off("switch-protyle", this.handleSwitch);
      plugin.eventBus.off("click-editorcontent", this.handleEditorClick);
      this.listening = false;
    }
    this.renderer.destroy();
  }
}
