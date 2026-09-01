const ASSET_EDIT_SELECTOR = '[data-type="editAssetItem"]';
const ASSET_CUT_ATTRIBUTE = "data-damophus-asset-cut";

/** Adds a cut action to the native menu opened for an attribute-view asset. */
export function appendAssetCutMenu(menu: HTMLElement, label: string): boolean {
  const items = menu.querySelector<HTMLElement>(".b3-menu__items:last-child");
  const copyItem = items?.querySelector<HTMLElement>('[data-id="copy"]');
  const deleteItem = items?.querySelector<HTMLElement>('[data-id="delete"]');
  if (!items || !copyItem || !deleteItem || items.querySelector(`[${ASSET_CUT_ATTRIBUTE}]`)) return false;

  const cutItem = document.createElement("button");
  cutItem.type = "button";
  cutItem.className = "b3-menu__item";
  cutItem.setAttribute(ASSET_CUT_ATTRIBUTE, "true");
  cutItem.dataset.id = "damophusCutAsset";
  cutItem.innerHTML = `<svg class="b3-menu__icon"><use xlink:href="#iconCut"></use></svg><span class="b3-menu__label"></span>`;
  const labelElement = cutItem.querySelector<HTMLElement>(".b3-menu__label");
  if (labelElement) labelElement.textContent = label;
  cutItem.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    // Trigger the native actions so platform-specific clipboard behavior is preserved.
    copyItem.click();
    deleteItem.click();
  });
  deleteItem.after(cutItem);
  return true;
}

export class AvAssetCutManager {
  private started = false;

  public constructor(private readonly getLabel: () => string) {}

  updateOptions(options: { enabled: boolean }): void {
    if (options.enabled) this.start();
    else this.stop();
  }

  start(): void {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    document.addEventListener("click", this.handleDocumentClick, true);
  }

  stop(): void {
    if (!this.started || typeof document === "undefined") return;
    this.started = false;
    document.removeEventListener("click", this.handleDocumentClick, true);
  }

  private readonly handleDocumentClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(ASSET_EDIT_SELECTOR)) return;
    this.scheduleInstall(0);
  };

  private scheduleInstall(attempt: number): void {
    window.setTimeout(() => {
      const menu = document.querySelector<HTMLElement>("#commonMenu:not(.fn__none)");
      if (menu && appendAssetCutMenu(menu, this.getLabel())) return;
      if (attempt < 1) this.scheduleInstall(attempt + 1);
    }, attempt === 0 ? 0 : 40);
  }
}
