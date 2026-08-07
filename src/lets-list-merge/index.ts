import { requestStrict } from "@/api";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { showMessage, type IEventBusMap, type IProtyle, type IMenu } from "siyuan";
import {
  createListMergePlan,
  hasMixedListTypes,
  mergeListBlocks,
  resolveListMergeSelection,
  type ListMergePlan,
  type ListMergeSelection,
  type ListSubtype,
} from "./list-merge";

const log = getLogger("lets-list-merge");
const listMergeOperations = {
  getChildBlocks: (id: string) => requestStrict<Array<{ id: string; type: string }>>(
    "/api/block/getChildBlocks",
    { id },
  ),
  moveBlock: (id: string, previousID?: string, parentID?: string) => requestStrict<unknown>(
    "/api/block/moveBlock",
    { id, previousID, parentID },
  ),
  deleteBlock: (id: string) => requestStrict<unknown>(
    "/api/block/deleteBlock",
    { id },
  ),
};

export default class ListMergePlugin extends SubPluginBase {
  private listening = false;
  private commandsRegistered = false;

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    const selection = resolveListMergeSelection(event.detail.blockElements);
    if (!selection) return;
    event.detail.menu.addItem(this.menuItem(selection));
  };

  override onload(): void {
    if (!this.commandsRegistered) {
      this.commandsRegistered = true;
      this.registerCommand("lets-list-merge.commandOrdered", "o");
      this.registerCommand("lets-list-merge.commandUnordered", "u");
    }
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  override onunload(): void {
    if (!this.listening) return;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    this.listening = false;
  }

  private registerCommand(langKey: string, subtype: ListSubtype): void {
    plugin.addCommand({
      langKey,
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.enabled) return;
        const selection = this.currentEditorSelection(protyle);
        const plan = selection && createListMergePlan(selection, subtype);
        if (plan) void this.execute(plan);
      },
    });
  }

  private currentEditorSelection(protyle: IProtyle): ListMergeSelection | undefined {
    const selected = Array.from(protyle.wysiwyg.element.querySelectorAll<HTMLElement>(
      '.protyle-wysiwyg--select[data-type="NodeList"]',
    ));
    return resolveListMergeSelection(selected);
  }

  private menuItem(selection: ListMergeSelection): IMenu {
    if (!hasMixedListTypes(selection)) {
      return {
        icon: "iconList",
        label: this.t("lets-list-merge.merge"),
        click: () => {
          const plan = createListMergePlan(selection);
          if (plan) void this.execute(plan);
        },
      };
    }
    return {
      icon: "iconList",
      label: this.t("lets-list-merge.merge"),
      submenu: [
        this.subtypeMenuItem(selection, "o", "lets-list-merge.mergeOrdered"),
        this.subtypeMenuItem(selection, "u", "lets-list-merge.mergeUnordered"),
      ],
    };
  }

  private subtypeMenuItem(
    selection: ListMergeSelection,
    subtype: ListSubtype,
    label: "lets-list-merge.mergeOrdered" | "lets-list-merge.mergeUnordered",
  ): IMenu {
    return {
      icon: subtype === "o" ? "iconOrderedList" : "iconList",
      label: this.t(label),
      click: () => {
        const plan = createListMergePlan(selection, subtype);
        if (plan) void this.execute(plan);
      },
    };
  }

  private async execute(plan: ListMergePlan): Promise<void> {
    try {
      const result = await mergeListBlocks(plan, listMergeOperations);
      showMessage(this.t("lets-list-merge.success").replace("{count}", String(result.mergedItemCount)));
    } catch (error) {
      log.error("list-merge.failed", error);
      showMessage(this.t("lets-list-merge.failure"), 7000, "error");
    }
  }
}
