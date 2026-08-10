import { SubPluginBase } from "@/libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { showMessage, type ICommand, type IEventBusMap, type IOperation, type IProtyle, type IMenu } from "siyuan";
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
import {
  applyMixedListDom,
  buildMixedListTransaction,
  createMixedListPlan,
  resolveMixedListSelection,
  type MixedListPlan,
  type MixedListSelection,
} from "./mixed-list";

const log = getLogger("lets-list-merge");

export default class ListMergePlugin extends SubPluginBase {
  private listening = false;
  private commandEntries: ICommand[] = [];

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isEntryEnabled("menu")) return;
    const listSelection = resolveListMergeSelection(event.detail.blockElements);
    if (listSelection) {
      event.detail.menu.addItem(this.menuItem(listSelection, event.detail.protyle));
      return;
    }
    const mixedSelection = resolveMixedListSelection(event.detail.blockElements);
    if (mixedSelection) {
      event.detail.menu.addItem(this.mixedMenuItem(mixedSelection, event.detail.protyle));
    }
  };

  override onload(): void {
    this.syncCommands();
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  private registerDefaultCommand(): void {
    const command: ICommand = {
      langKey: "lets-list-merge.commandDefault",
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.enabled) return;
        const selection = this.currentEditorSelection(protyle);
        const plan = selection && createListMergePlan(selection, this.preferredSubtype());
        if (plan) this.execute(plan, selection, protyle);
      },
    };
    plugin.addCommand(command);
    this.commandEntries.push(command);
  }

  override onunload(): void {
    this.removeCommands();
    if (!this.listening) return;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    this.listening = false;
  }

  private registerCommand(langKey: string, subtype: ListSubtype): void {
    const command: ICommand = {
      langKey,
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.enabled) return;
        const selection = this.currentEditorSelection(protyle);
        const plan = selection && createListMergePlan(selection, subtype);
        if (plan) this.execute(plan, selection, protyle);
      },
    };
    plugin.addCommand(command);
    this.commandEntries.push(command);
  }

  private syncCommands(): void {
    if (this.isEntryEnabled("command")) {
      if (this.commandEntries.length > 0) return;
      this.registerDefaultCommand();
      this.registerCommand("lets-list-merge.commandOrdered", "o");
      this.registerCommand("lets-list-merge.commandUnordered", "u");
      this.registerMixedCommand();
      return;
    }
    this.removeCommands();
  }

  private registerMixedCommand(): void {
    const command: ICommand = {
      langKey: "lets-list-merge.commandMixed",
      hotkey: "",
      editorCallback: (protyle) => {
        if (!this.enabled) return;
        const selection = this.currentMixedSelection(protyle);
        if (!selection) return;
        const plan = createMixedListPlan(selection, this.preferredSubtype());
        this.executeMixed(plan, selection, protyle);
      },
    };
    plugin.addCommand(command);
    this.commandEntries.push(command);
  }

  private removeCommands(): void {
    if (this.commandEntries.length === 0) return;
    for (const command of this.commandEntries) {
      const index = plugin.commands.indexOf(command);
      if (index >= 0) plugin.commands.splice(index, 1);
    }
    this.commandEntries = [];
  }

  private currentEditorSelection(protyle: IProtyle): ListMergeSelection | undefined {
    const selected = Array.from(protyle.wysiwyg.element.querySelectorAll<HTMLElement>(
      '.protyle-wysiwyg--select[data-type="NodeList"]',
    ));
    return resolveListMergeSelection(selected);
  }

  private currentMixedSelection(protyle: IProtyle): MixedListSelection | undefined {
    const selected = Array.from(protyle.wysiwyg.element.querySelectorAll<HTMLElement>(
      '.protyle-wysiwyg--select[data-node-id]',
    ));
    return resolveMixedListSelection(selected);
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

  private mixedMenuItem(selection: MixedListSelection, protyle: IProtyle): IMenu {
    const subtypeOrder: ListSubtype[] = this.preferredSubtype() === "o"
      ? ["o", "u"]
      : ["u", "o"];
    return {
      icon: "iconList",
      label: this.t("lets-list-merge.mixedList"),
      submenu: subtypeOrder.map((subtype) => ({
        icon: subtype === "o" ? "iconOrderedList" : "iconList",
        label: this.t(subtype === "o"
          ? "lets-list-merge.mixedListOrdered"
          : "lets-list-merge.mixedListUnordered"),
        click: () => {
          const plan = createMixedListPlan(selection, subtype);
          this.executeMixed(plan, selection, protyle);
        },
      })),
    };
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

  private executeMixed(plan: MixedListPlan, selection: MixedListSelection, protyle: IProtyle): void {
    try {
      const transaction = buildMixedListTransaction(plan, selection, protyle.block.rootID);
      applyMixedListDom(plan, selection);
      protyle.getInstance().transaction(
        transaction.doOperations as IOperation[],
        transaction.undoOperations as IOperation[],
      );
      showMessage(this.t("lets-list-merge.mixedSuccess")
        .replace("{items}", String(transaction.result.topLevelItemCount))
        .replace("{lists}", String(transaction.result.nestedListCount)));
    } catch (error) {
      log.error("mixed-list.failed", error);
      showMessage(this.t("lets-list-merge.failure"), 7000, "error");
    }
  }
}
