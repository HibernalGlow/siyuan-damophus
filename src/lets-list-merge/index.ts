import { SubPluginBase } from "@/libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { showMessage, type IEventBusMap, type IOperation, type IProtyle, type IMenu } from "siyuan";
import {
  applyListMergeDom,
  buildListMergeTransaction,
  createListMergePlan,
  hasMixedListTypes,
  resolveListMergeSelection,
  type ListMergePlan,
  type ListMergeSelection,
  type ListSubtype,
} from "./list-merge";

const log = getLogger("lets-list-merge");

export default class ListMergePlugin extends SubPluginBase {
  private listening = false;
  private commandsRegistered = false;

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    const selection = resolveListMergeSelection(event.detail.blockElements);
    if (!selection) return;
    event.detail.menu.addItem(this.menuItem(selection, event.detail.protyle));
  };

  override onload(): void {
    if (!this.commandsRegistered) {
      this.commandsRegistered = true;
      this.registerDefaultCommand();
      this.registerCommand("lets-list-merge.commandOrdered", "o");
      this.registerCommand("lets-list-merge.commandUnordered", "u");
    }
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  private registerDefaultCommand(): void {
    plugin.addCommand({
      langKey: "lets-list-merge.commandDefault",
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.enabled) return;
        const selection = this.currentEditorSelection(protyle);
        const plan = selection && createListMergePlan(selection, this.preferredSubtype());
        if (plan) this.execute(plan, selection, protyle);
      },
    });
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
        if (plan) this.execute(plan, selection, protyle);
      },
    });
  }

  private currentEditorSelection(protyle: IProtyle): ListMergeSelection | undefined {
    const selected = Array.from(protyle.wysiwyg.element.querySelectorAll<HTMLElement>(
      '.protyle-wysiwyg--select[data-type="NodeList"]',
    ));
    return resolveListMergeSelection(selected);
  }

  private menuItem(selection: ListMergeSelection, protyle: IProtyle): IMenu {
    if (!hasMixedListTypes(selection)) {
      return {
        icon: "iconList",
        label: this.t("lets-list-merge.merge"),
        click: () => {
          const plan = createListMergePlan(selection);
          if (plan) this.execute(plan, selection, protyle);
        },
      };
    }
    const subtypeOrder: ListSubtype[] = this.preferredSubtype() === "o"
      ? ["o", "u"]
      : ["u", "o"];
    return {
      icon: "iconList",
      label: this.t("lets-list-merge.merge"),
      submenu: subtypeOrder.map((subtype) => this.subtypeMenuItem(
        selection,
        protyle,
        subtype,
        subtype === "o" ? "lets-list-merge.mergeOrdered" : "lets-list-merge.mergeUnordered",
      )),
    };
  }

  private preferredSubtype(): ListSubtype {
    return this.getSetting("defaultMixedSubtype") === "u" ? "u" : "o";
  }

  private subtypeMenuItem(
    selection: ListMergeSelection,
    protyle: IProtyle,
    subtype: ListSubtype,
    label: "lets-list-merge.mergeOrdered" | "lets-list-merge.mergeUnordered",
  ): IMenu {
    return {
      icon: subtype === "o" ? "iconOrderedList" : "iconList",
      label: this.t(label),
      click: () => {
        const plan = createListMergePlan(selection, subtype);
        if (plan) this.execute(plan, selection, protyle);
      },
    };
  }

  private execute(plan: ListMergePlan, selection: ListMergeSelection, protyle: IProtyle): void {
    try {
      const transaction = buildListMergeTransaction(plan, selection, protyle.block.rootID);
      applyListMergeDom(plan, selection);
      protyle.getInstance().transaction(
        transaction.doOperations as IOperation[],
        transaction.undoOperations as IOperation[],
      );
      showMessage(this.t("lets-list-merge.success").replace("{count}", String(transaction.result.mergedItemCount)));
    } catch (error) {
      log.error("list-merge.failed", error);
      showMessage(this.t("lets-list-merge.failure"), 7000, "error");
    }
  }
}
