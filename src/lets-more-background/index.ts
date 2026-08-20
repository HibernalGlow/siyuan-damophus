import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { getAllEditor, type IEventBusMap, showMessage } from "siyuan";
import {
  startMoreBackground,
  type MoreBackgroundHandle,
  type MoreBackgroundOptions,
} from "./more-background";
import {
  DEFAULT_COVER_SOURCES,
  DEFAULT_SITE_CREDENTIALS,
  templateToUrl,
  type CoverSourceItem,
} from "./sources";

import { resolveBooruImageUrl } from "./booru";

export default class MoreBackgroundPlugin extends SubPluginBase {
  private controller?: MoreBackgroundHandle;
  private listening = false;
  private layoutReady = false;

  async testConnection(): Promise<void> {
    const opts = this.buildOptions();
    const testUrl =
      opts.sources.find((s) => s.url?.startsWith("booru:"))?.url ||
      "booru:sb?tags=wallpaper&rating=safe";
    try {
      const result = await resolveBooruImageUrl(testUrl, opts.siteCredentials);
      if (result) {
        showMessage(`${this.t("lets-more-background.testConnectionSuccess" as any)}\n${result}`);
      } else {
        showMessage(this.t("lets-more-background.testConnectionFailed" as any));
      }
    } catch {
      showMessage(this.t("lets-more-background.testConnectionFailed" as any));
    }
  }

  private readonly handleProtyle = (
    event: CustomEvent<
      | IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["loaded-protyle-dynamic"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    this.controller?.scanRoot(event.detail.protyle.element);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.controller?.disposeRoot(event.detail.protyle.element);
  };

  override onload(): void {}

  onDataChanged(): void {
    if (this.layoutReady && this.controller) {
      this.controller.updateOptions(this.buildOptions());
    }
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    this.startController();
  }

  override onunload(): void {
    this.unbindEvents();
    this.controller?.dispose();
    this.controller = undefined;
    this.layoutReady = false;
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
  }

  private startController(): void {
    this.controller?.dispose();
    const options = this.buildOptions();
    this.controller = startMoreBackground(options);
    for (const editor of getAllEditor()) {
      if (editor.protyle?.element) {
        this.controller.scanRoot(editor.protyle.element);
      }
    }
  }

  private buildOptions(): MoreBackgroundOptions {
    const rawTemplates = this.getSetting("templates");
    let sources: CoverSourceItem[] = [];

    if (Array.isArray(rawTemplates) && rawTemplates.length > 0) {
      sources = rawTemplates.map((tpl) => ({
        label: tpl.name || "Template",
        url: templateToUrl(tpl),
      }));
    } else {
      const rawSources = this.getSetting("sources");
      sources =
        Array.isArray(rawSources) && rawSources.length > 0
          ? rawSources
          : DEFAULT_COVER_SOURCES;
    }

    const siteCredentials = this.getSetting("siteCredentials") || DEFAULT_SITE_CREDENTIALS;

    return {
      width: Number(this.getSetting("width")) || 1920,
      height: Number(this.getSetting("height")) || 1080,
      assetsLocation: (this.getSetting("assetsLocation") || "/assets/more-background").toString(),
      readFromAssets: this.getSetting("readFromAssets") !== false,
      writeToAssets: this.getSetting("writeToAssets") === true,
      siteCredentials,
      sources,
      t: (key) => this.t(key),
    };
  }
}
