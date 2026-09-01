const OUTLINE_ISOLATION_CLASS = "damophus-question-bank-dock-open";
const SIDEBAR_OPEN_TRANSFORM = "translateX(0px)";

/**
 * On mobile the question-bank dock lives inside the full-screen `#sidebar`
 * panel (z-index 7) while the document editor behind stays mounted and
 * "visible". The floating-toc plugin therefore keeps the editor's outline
 * alive, and its `position: fixed` element (z-index 20) floats above this
 * panel - beyond the reach of the host-scoped isolation CSS. SiYuan signals
 * sidebar visibility purely through an inline transform ("translateX(0px)"
 * means open, see MobileBackFoward) and hides inactive tab panels with
 * `fn__none`; mirror both onto a body class so global CSS can hide every
 * floating outline while the question-bank panel is the visible surface.
 */
export function isolateFloatingOutlinesFromMobileDock(panel: HTMLElement): () => void {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return () => {};
  const sync = () => {
    const visible = sidebar.style.transform === SIDEBAR_OPEN_TRANSFORM
      && panel.isConnected
      && !panel.classList.contains("fn__none");
    document.body.classList.toggle(OUTLINE_ISOLATION_CLASS, visible);
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(sidebar, { attributes: true, attributeFilter: ["style"] });
  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
  return () => {
    observer.disconnect();
    document.body.classList.remove(OUTLINE_ISOLATION_CLASS);
  };
}
