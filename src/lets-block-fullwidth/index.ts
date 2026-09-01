import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile } from "@/utils";
import { globalExcludedAfwdTypes } from "./fullwidth-attr";
import { FullwidthMenuController } from "./fullwidth-menu";
import {
  FullwidthSpacingSync,
  FullwidthStyles,
  MOBILE_SCOPE_CLASS,
  applyGlobalFullwidthScope,
  isThemeNativeAfwd,
} from "./fullwidth-styles";

const log = getLogger("lets-block-fullwidth");

export default class BlockFullwidthPlugin extends SubPluginBase {
  private readonly styles = new FullwidthStyles();
  private readonly spacing = new FullwidthSpacingSync();
  private readonly menu = new FullwidthMenuController();

  override onload(): void {
    this.styles.start();
    this.spacing.start();
    // When the active theme ships its own full-width menus (Asri), the menu
    // controller yields to it on every gutter click; the stylesheet stays
    // because its breakout values are compatible with the theme's own.
    this.menu.start(
      (key) => this.t(`lets-block-fullwidth.menu.${key}`),
      () => isThemeNativeAfwd(),
    );
    if (isMobile) document.body.classList.add(MOBILE_SCOPE_CLASS);
    this.applyGlobal();
    log.debug("fullwidth module loaded");
  }

  onDataChanged(): void {
    this.applyGlobal();
  }

  override onunload(): void {
    this.menu.stop();
    this.spacing.stop();
    this.styles.destroy();
    document.body.classList.remove(MOBILE_SCOPE_CLASS);
    applyGlobalFullwidthScope(document, false);
  }

  private applyGlobal(): void {
    const enabled = this.getSetting("globalEnabled") === true;
    applyGlobalFullwidthScope(document, enabled, globalExcludedAfwdTypes(this.getSetting("globalExcludedTypes")));
  }
}
