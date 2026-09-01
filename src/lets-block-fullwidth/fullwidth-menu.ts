import { getBlockAttrs, setBlockAttrs } from "@/api";
import { getLogger } from "@/libs/logger";
import {
  AFWD_ATTRIBUTE,
  AFWD_BLOCK_KEYS,
  AFWD_DOC_KEYS,
  AFWD_IMAGE_BLOCK_KEYS,
  parseAfwdAttr,
  serializeAfwdAttr,
} from "./fullwidth-attr";
import {
  AFWD_MENU_CLEAR_ID,
  AFWD_MENU_ENTRY_ID,
  AFWD_MENU_SEPARATOR_ID,
  afwdMenuItemId,
  buildFullwidthMenuEntry,
  type FullwidthLabelKey,
  type FullwidthMenuLabels,
} from "./fullwidth-menu-dom";

const log = getLogger("lets-block-fullwidth");

const SUPPORTED_GUTTER_TYPES = [
  "NodeParagraph",
  "NodeTable",
  "NodeAttributeView",
  "NodeSuperBlock",
  "NodeVideo",
  "NodeWidget",
  "NodeIFrame",
];

const MENU_POLL_ATTEMPTS = 20;
const MENU_POLL_INTERVAL_MS = 25;

export type FullwidthLabelProvider = (key: FullwidthLabelKey) => string;

interface DetectedBlock {
  isDoc: boolean;
  blockId: string;
  gutterType: string;
}

export class FullwidthMenuController {
  private handler: ((event: MouseEvent) => void) | null = null;
  private sequence = 0;
  private shouldDefer: (() => boolean) | null = null;

  constructor(private readonly targetDocument: Document = document) {}

  start(getLabel: FullwidthLabelProvider, shouldDefer: (() => boolean) | null = null): void {
    if (this.handler) return;
    this.shouldDefer = shouldDefer;
    this.handler = (event: MouseEvent) => {
      void this.handleMouseUp(event, getLabel);
    };
    this.targetDocument.addEventListener("mouseup", this.handler);
  }

  stop(): void {
    if (this.handler) {
      this.targetDocument.removeEventListener("mouseup", this.handler);
      this.handler = null;
    }
    this.sequence += 1;
    this.removeInjectedItems();
  }

  private removeInjectedItems(): void {
    this.targetDocument
      .querySelectorAll(`#${AFWD_MENU_ENTRY_ID}, #${AFWD_MENU_SEPARATOR_ID}`)
      .forEach((element) => element.remove());
  }

  private async handleMouseUp(event: MouseEvent, getLabel: FullwidthLabelProvider): Promise<void> {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const detected = this.detectBlock(target);
    if (!detected) return;
    // The active theme ships its own full-width menus: yield to it.
    if (this.shouldDefer?.()) return;

    const run = ++this.sequence;
    const menu = await this.waitForMenu();
    if (!menu || run !== this.sequence) return;
    // Let the menu finish building its own items before we read states.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (run !== this.sequence) return;

    await this.inject(menu, detected, run, getLabel);
  }

  private detectBlock(target: Element): DetectedBlock | null {
    const label = target.closest(".ariaLabel") as HTMLElement | null;
    const gutterType = label?.dataset.type ?? "";
    const isDoc = Boolean(target.closest(".protyle-title__icon")) || gutterType === "doc";
    if (!SUPPORTED_GUTTER_TYPES.includes(gutterType) && !isDoc) return null;

    let blockId: string | null = null;
    if (isDoc) {
      const parent = label?.parentElement as HTMLElement | undefined;
      const title = target.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title");
      blockId = parent?.dataset.nodeId ?? title?.dataset.nodeId ?? null;
    } else {
      blockId = label?.dataset.nodeId ?? null;
    }
    if (!blockId) return null;
    return { isDoc, blockId, gutterType };
  }

  private async waitForMenu(): Promise<HTMLElement | null> {
    for (let attempt = 0; attempt < MENU_POLL_ATTEMPTS; attempt += 1) {
      const menu = this.targetDocument.querySelector<HTMLElement>("#commonMenu:not(.fn__none)");
      if (menu) return menu;
      await new Promise((resolve) => setTimeout(resolve, MENU_POLL_INTERVAL_MS));
    }
    return null;
  }

  private async inject(
    menu: HTMLElement,
    detected: DetectedBlock,
    run: number,
    getLabel: FullwidthLabelProvider,
  ): Promise<void> {
    const list = menu.lastElementChild as HTMLElement | null;
    if (!list) return;

    try {
      const labels = {} as FullwidthMenuLabels;
      const labelKeys: FullwidthLabelKey[] = ["entry", "all", "db", "t", "p", "iframe", "sb", "on", "deep", "off", "clear"];
      for (const key of labelKeys) labels[key] = getLabel(key);

      if (!list.querySelector(`#${AFWD_MENU_ENTRY_ID}`)) {
        const entry = buildFullwidthMenuEntry(detected.isDoc, labels, this.blockKeysFor(detected));
        const separator = this.targetDocument.createElement("button");
        separator.className = "b3-menu__separator";
        separator.id = AFWD_MENU_SEPARATOR_ID;
        const anchor = list.lastElementChild?.previousElementSibling ?? null;
        if (anchor) {
          list.insertBefore(separator, anchor);
          list.insertBefore(entry, separator);
        } else {
          list.append(separator, entry);
        }
      }

      const attrs = await getBlockAttrs(detected.blockId);
      // Another gutter may have been clicked while we awaited the attributes.
      if (run !== this.sequence) return;
      const values = parseAfwdAttr(attrs[AFWD_ATTRIBUTE]);
      const blockKeys = this.blockKeysFor(detected);

      const clearButton = list.querySelector<HTMLButtonElement>(`#${AFWD_MENU_CLEAR_ID}`);
      if (detected.isDoc) {
        this.initDocStates(list, values);
        this.bindDocActions(list, clearButton, detected.blockId, values);
      } else {
        this.initBlockStates(list, values, blockKeys);
        this.bindBlockActions(list, clearButton, detected.blockId, blockKeys);
      }
    } catch (error) {
      log.warn("Failed to inject the full-width menu", error);
    }
  }

  // Image paragraphs additionally offer "deep": full width from inside any
  // container block.
  private blockKeysFor(detected: DetectedBlock): readonly string[] {
    if (detected.isDoc) return AFWD_DOC_KEYS;
    return detected.gutterType === "NodeParagraph" ? AFWD_IMAGE_BLOCK_KEYS : AFWD_BLOCK_KEYS;
  }

  private initDocStates(list: HTMLElement, values: string[]): void {
    const hasAll = values.includes("all");
    for (const key of AFWD_DOC_KEYS) {
      const item = list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(key)}`);
      if (!item) continue;
      const input = item.querySelector("input");
      if (!input) continue;
      input.checked = values.includes(key);
      if (key !== "all") {
        item.classList.toggle("b3-menu__item--disabled", hasAll);
        input.disabled = hasAll;
      }
    }
  }

  private initBlockStates(list: HTMLElement, values: string[], blockKeys: readonly string[]): void {
    for (const key of blockKeys) {
      const item = list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(key)}`);
      item?.classList.toggle("b3-menu__item--selected", values[0] === key);
    }
  }

  // Mirrors the Asri theme doc-level switch behavior: "all" is exclusive and
  // preserves the individual selections so they can be restored when "all"
  // is switched off again.
  private bindDocActions(
    list: HTMLElement,
    clearButton: HTMLButtonElement | null,
    blockId: string,
    initialValues: string[],
  ): void {
    let afwdAttrs = [...initialValues];
    let reserved: string[] = [];

    const setDisabled = (key: string, disabled: boolean) => {
      const item = list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(key)}`);
      if (!item) return;
      item.classList.toggle("b3-menu__item--disabled", disabled);
      const input = item.querySelector("input");
      if (input) input.disabled = disabled;
    };

    for (const key of AFWD_DOC_KEYS) {
      const item = list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(key)}`);
      if (!item) continue;
      item.onclick = (event) => {
        if (item.classList.contains("b3-menu__item--disabled")) return;
        const input = item.querySelector("input");
        if (!input) return;
        let isOn = input.checked;
        // Clicking the switch toggles the checkbox itself; clicking the label
        // row must toggle it manually.
        if (event.target === input) isOn = !isOn;
        else input.checked = !isOn;

        if (isOn) {
          if (key === "all") {
            for (const other of AFWD_DOC_KEYS) {
              if (other !== "all") setDisabled(other, false);
            }
            afwdAttrs = reserved.length > 0 ? [...reserved] : [];
          } else {
            afwdAttrs = afwdAttrs.filter((value) => value !== key);
          }
        } else if (key === "all") {
          if (!afwdAttrs.includes("all")) reserved = [...afwdAttrs];
          for (const other of AFWD_DOC_KEYS) {
            if (other !== "all") setDisabled(other, true);
          }
          afwdAttrs = ["all"];
        } else {
          afwdAttrs.push(key);
        }

        void setBlockAttrs(blockId, { [AFWD_ATTRIBUTE]: serializeAfwdAttr(afwdAttrs) });
      };
    }

    if (clearButton) {
      clearButton.onclick = () => {
        reserved = [];
        afwdAttrs = [];
        void setBlockAttrs(blockId, { [AFWD_ATTRIBUTE]: "" });
        this.initDocStates(list, []);
      };
    }
  }

  private bindBlockActions(
    list: HTMLElement,
    clearButton: HTMLButtonElement | null,
    blockId: string,
    blockKeys: readonly string[],
  ): void {
    for (const key of blockKeys) {
      const item = list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(key)}`);
      if (!item) continue;
      item.onclick = () => {
        const isSelected = item.classList.contains("b3-menu__item--selected");
        for (const other of blockKeys) {
          list.querySelector<HTMLButtonElement>(`#${afwdMenuItemId(other)}`)?.classList.remove("b3-menu__item--selected");
        }
        if (isSelected) {
          void setBlockAttrs(blockId, { [AFWD_ATTRIBUTE]: "" });
        } else {
          item.classList.add("b3-menu__item--selected");
          void setBlockAttrs(blockId, { [AFWD_ATTRIBUTE]: key });
        }
      };
    }

    if (clearButton) {
      clearButton.onclick = () => {
        void setBlockAttrs(blockId, { [AFWD_ATTRIBUTE]: "" });
        this.initBlockStates(list, [], blockKeys);
      };
    }
  }
}
