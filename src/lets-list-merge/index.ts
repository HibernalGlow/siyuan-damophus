import { SubPluginBase } from "@/libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { Dialog, showMessage, type ICommand, type IEventBusMap, type IOperation, type IProtyle, type IMenu } from "siyuan";
import {
  applyListMergeDom,
  buildListMergeTransaction,
  createListMergePlan,
  hasMixedListTypes,
  resolveListMergeSelection,
  applyListNumberingDom,
  buildListNumberingTransaction,
  createListNumberingPlan,
  currentListNumberingStart,
  resolveListNumberingSelection,
  type ListMergePlan,
  type ListMergeSelection,
  type ListNumberingSelection,
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

export default class ListMergePlugin extends SubPluginBase {
  private listening = false;
  private commandEntries: ICommand[] = [];

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isEntryEnabled("menu")) return;
    const numberingSelection = resolveListNumberingSelection(event.detail.blockElements);
    if (numberingSelection) {
      event.detail.menu.addItem(this.numberingMenuItem(numberingSelection, event.detail.protyle));
      return;
    }
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

  private numberingMenuItem(selection: ListNumberingSelection, protyle: IProtyle): IMenu {
    return {
      icon: "iconOrderedList",
      label: this.t("lets-list-merge.numbering"),
      submenu: [
        {
          icon: "iconEdit",
          label: this.t("lets-list-merge.setNumberingStart"),
          click: () => this.openNumberingDialog(selection, protyle),
        },
        {
          icon: "iconOrderedList",
          label: this.t("lets-list-merge.resetNumberingStart"),
          click: () => this.executeNumbering(selection, protyle, 1),
        },
      ],
    };
  }

  private openNumberingDialog(selection: ListNumberingSelection, protyle: IProtyle): void {
    const dialog = new Dialog({
      title: this.t("lets-list-merge.setNumberingStart"),
      width: "min(420px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <label class="fn__flex-column">
            <span class="b3-label">${escapeHtml(this.t("lets-list-merge.numberingStartLabel"))}</span>
            <input class="b3-text-field fn__block" type="number" min="1" step="1" data-field="start">
          </label>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(this.t("lets-list-merge.cancel"))}</button>
          <button class="b3-button b3-button--text" data-action="apply">${escapeHtml(this.t("lets-list-merge.apply"))}</button>
        </div>
      `,
    });
    const input = dialog.element.querySelector<HTMLInputElement>('[data-field="start"]');
    if (!input) {
      dialog.destroy();
      return;
    }
    input.value = String(currentListNumberingStart(selection));
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')
      ?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="apply"]')
      ?.addEventListener("click", () => {
        const start = Number(input.value);
        if (!Number.isSafeInteger(start) || start < 1) {
          showMessage(this.t("lets-list-merge.invalidNumberingStart"), 5000, "error");
          return;
        }
        dialog.destroy();
        this.executeNumbering(selection, protyle, start);
      });
    dialog.bindInput(input, () => {
      dialog.element.querySelector<HTMLButtonElement>('[data-action="apply"]')?.click();
    });
    input.focus();
    input.select();
  }

  private executeNumbering(
    selection: ListNumberingSelection,
    protyle: IProtyle,
    start: number,
  ): void {
    try {
      const plan = createListNumberingPlan(selection, start);
      if (!plan) return;
      const transaction = buildListNumberingTransaction(plan, selection);
      applyListNumberingDom(plan, selection);
      protyle.getInstance().transaction(
        transaction.doOperations as IOperation[],
        transaction.undoOperations as IOperation[],
      );
      showMessage(this.t("lets-list-merge.numberingSuccess")
        .replace("{start}", String(start))
        .replace("{count}", String(transaction.result.itemCount)));
    } catch (error) {
      log.error("list-numbering.failed", error);
      showMessage(this.t("lets-list-merge.numberingFailure"), 7000, "error");
    }
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
