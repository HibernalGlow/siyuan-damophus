import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import type { IEventBusMap } from "siyuan";

type SearchInputEvent = IEventBusMap["input-search"];

export default class SearchGroupPlugin extends SubPluginBase {
  private listening = false;

  private readonly handleSearchInput = (
    event: CustomEvent<SearchInputEvent>,
  ): void => {
    const detail = event.detail;
    const dialogKey = detail.searchElement.closest<HTMLElement>("[data-key]")?.dataset.key;
    const isCurrentDocumentSearch = dialogKey === "dialog-search";
    const enabled = isCurrentDocumentSearch
      ? this.getSetting("currentDocumentSearch") === true
      : this.getSetting("globalSearch") !== false;
    if (!enabled) return;

    detail.config.group = 1;
    const searchRoot = detail.searchElement.closest<HTMLElement>(".b3-dialog, .search")
      ?? detail.searchElement.parentElement?.parentElement?.parentElement;
    const collapse = searchRoot?.querySelector<HTMLElement>("#searchCollapse");
    collapse?.parentElement?.classList.remove("fn__none");
  };

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("input-search", this.handleSearchInput);
  }

  override onunload(): void {
    if (!this.listening) return;
    plugin.eventBus.off("input-search", this.handleSearchInput);
    this.listening = false;
  }
}
