import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { getAllEditor, type IEventBusMap, type IMenu, type IProtyle } from "siyuan";
import {
  CALLOUT_TYPE_DEFINITIONS,
  convertBlocksToCallout,
  createCalloutConversionPlan,
  type CalloutTypeDefinition,
} from "./callout-conversion";
import { CalloutSmartInsert } from "./callout-smart-insert";
import { bindMenuIdentity } from "@/libs/menu-identity";

const TYPE_TRANSLATION_KEYS = {
  NOTE: "lets-callout-tools.note",
  TIP: "lets-callout-tools.tip",
  IMPORTANT: "lets-callout-tools.important",
  WARNING: "lets-callout-tools.warning",
  CAUTION: "lets-callout-tools.caution",
} as const;

export default class CalloutToolsPlugin extends SubPluginBase {
  private readonly smartInsert = new CalloutSmartInsert();
  private listening = false;
  private layoutReady = false;

  private readonly handleProtyle = (
    event: CustomEvent<
      IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["loaded-protyle-dynamic"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    if (this.smartInsertEnabled()) this.smartInsert.attach(event.detail.protyle);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.smartInsert.detach(event.detail.protyle);
  };

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.blockMenuConversionEnabled()) return;
    const items = CALLOUT_TYPE_DEFINITIONS
      .map((definition) => this.conversionMenuItem(
        definition,
        event.detail.blockElements,
        event.detail.protyle,
      ));
    if (items.some((item) => !item.disabled)) {
      event.detail.menu.addItem(bindMenuIdentity({
        icon: "iconCallout",
        label: this.t("lets-callout-tools.menuLabel"),
        submenu: items,
      }, { plugin: "siyuan-damophus", module: "calloutTools" }));
    }
  };

  override onload(): void {
    this.bindEvents();
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.syncSmartInsert();
  }

  onDataChanged(): void {
    if (this.layoutReady) this.syncSmartInsert();
  }

  override onunload(): void {
    this.unbindEvents();
    this.smartInsert.dispose();
    this.layoutReady = false;
  }

  private conversionMenuItem(
    definition: CalloutTypeDefinition,
    blocks: HTMLElement[],
    protyle: IProtyle,
  ): IMenu {
    const plan = createCalloutConversionPlan(
      blocks,
      definition,
      protyle,
      this.promoteHeadingToTitleEnabled(),
    );
    return {
      iconHTML: `<span class="b3-menu__icon" style="color:${definition.color}">${definition.icon}</span>`,
      label: this.t(TYPE_TRANSLATION_KEYS[definition.type]),
      disabled: !plan,
      click: () => {
        if (plan) convertBlocksToCallout(plan, protyle);
      },
    };
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
  }

  private syncSmartInsert(): void {
    if (!this.smartInsertEnabled()) {
      this.smartInsert.dispose();
      return;
    }
    for (const editor of getAllEditor()) {
      if (editor.protyle) this.smartInsert.attach(editor.protyle);
    }
  }

  private smartInsertEnabled(): boolean {
    return typeof this.getSetting !== "function" || this.getSetting("smartInsert") !== false;
  }

  private blockMenuConversionEnabled(): boolean {
    return typeof this.getSetting !== "function" || this.getSetting("blockMenuConversion") !== false;
  }

  private promoteHeadingToTitleEnabled(): boolean {
    return typeof this.getSetting !== "function" || this.getSetting("promoteHeadingToTitle") !== false;
  }
}
