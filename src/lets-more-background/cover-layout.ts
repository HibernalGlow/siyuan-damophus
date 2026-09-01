import type { MoreBackgroundOptions } from "./more-background";

export type CoverToolbarPosition = "adaptive" | "belowTags" | "belowIcon" | "native" | "custom";

export const COVER_LAYOUT_STYLE_ID = "damophus-more-background-layout-style";

const coverLayoutCss = `
.protyle[data-damophus-cover-layer="raised"] > .protyle-breadcrumb { position: relative; z-index: auto; }
.protyle[data-damophus-cover-layer="raised"] .protyle-background { z-index: 2; }
.protyle[data-damophus-cover-layer="raised"] .av__header { position: relative !important; z-index: 3 !important; }
.protyle[data-damophus-cover-layer="raised"] .av__views { z-index: 3 !important; }
/* Neo+ IDE hides the native toolbar and reserves the first 42px for document tabs.
   Attribute-view tabs are fixed to the viewport, so keep them below that tab strip. */
.neo-ide-body.body--toolbar-hide .av__views--fixed { top: 42px !important; }
.protyle[data-damophus-cover-breadcrumb="preserve"] > .protyle-breadcrumb > .protyle-breadcrumb__bar,
.protyle[data-damophus-cover-breadcrumb="preserve"] > .protyle-breadcrumb > .protyle-breadcrumb__space { position: relative; z-index: 3; }
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="readonly"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="doc"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="more"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="context"] { position: relative; z-index: 3; }
.protyle-icons[data-damophus-cover-toolbar] { opacity: 0; pointer-events: none; transition: opacity .2s ease-in-out; }
.protyle-top:hover .protyle-icons[data-damophus-cover-toolbar],
.protyle-background:hover .protyle-icons[data-damophus-cover-toolbar] { opacity: 1; pointer-events: auto; }
.protyle-icons[data-damophus-cover-toolbar="belowIcon"] { position: static; width: max-content; max-width: 100%; margin: 0 0 8px; }
.protyle-icons[data-damophus-cover-toolbar="custom"] { position: absolute; right: auto; left: var(--damophus-cover-toolbar-x); top: var(--damophus-cover-toolbar-y); transform: translate(var(--damophus-cover-toolbar-offset-x), var(--damophus-cover-toolbar-offset-y)); }
/* Long-press on mobile engages the cover drag; suppress the native image
   callout sheet and text selection that would otherwise interrupt it. */
.protyle-background__img img { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
`;

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
}

export function ensureCoverLayoutStyle(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById(COVER_LAYOUT_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = COVER_LAYOUT_STYLE_ID;
    style.textContent = coverLayoutCss;
    document.head.append(style);
  }
}

export function removeCoverLayoutStyle(): void {
  if (typeof document === "undefined") return;
  document.getElementById(COVER_LAYOUT_STYLE_ID)?.remove();
}

export function applyCoverLayout(root: HTMLElement, options: Pick<MoreBackgroundOptions,
  "toolbarPosition" | "toolbarCustomX" | "toolbarCustomY" | "coverBreadcrumb" | "coverDocumentMenu"
>): () => void {
  const background = root.querySelector<HTMLElement>(".protyle-background");
  const imageContainer = background?.querySelector<HTMLElement>(".protyle-background__img");
  const toolbar = background?.querySelector<HTMLElement>(
    '.protyle-icons[data-damophus-cover-toolbar], .protyle-background__img > .protyle-icons',
  );
  if (!background || !imageContainer || !toolbar) return () => {};

  const position: CoverToolbarPosition = options.toolbarPosition === "native" || options.toolbarPosition === "custom"
    ? options.toolbarPosition
    : "belowIcon";
  const placeholder = document.createComment("damophus-cover-toolbar");
  toolbar.before(placeholder);

  toolbar.dataset.damophusCoverToolbar = position;
  const customX = clampPercent(options.toolbarCustomX, 50);
  const customY = clampPercent(options.toolbarCustomY, 15);
  toolbar.style.setProperty("--damophus-cover-toolbar-x", `${customX}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-y", `${customY}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-offset-x", `${-customX}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-offset-y", `${-customY}%`);

  if (position === "belowIcon") {
    const infoArea = background.querySelector<HTMLElement>(".protyle-background__ia");
    const tags = infoArea?.querySelector<HTMLElement>(".b3-chips__doctag");
    if (infoArea) infoArea.insertBefore(toolbar, tags ?? infoArea.querySelector(".protyle-background__action"));
  } else if (toolbar.parentElement !== imageContainer) {
    imageContainer.prepend(toolbar);
  }

  const raised = options.coverBreadcrumb === true || options.coverDocumentMenu === true;
  root.dataset.damophusCoverLayer = raised ? "raised" : "native";
  root.dataset.damophusCoverBreadcrumb = options.coverBreadcrumb === true ? "cover" : "preserve";
  root.dataset.damophusCoverMenu = options.coverDocumentMenu === true ? "cover" : "preserve";

  return () => {
    if (placeholder.parentNode) placeholder.replaceWith(toolbar);
    toolbar.removeAttribute("data-damophus-cover-toolbar");
    toolbar.style.removeProperty("--damophus-cover-toolbar-x");
    toolbar.style.removeProperty("--damophus-cover-toolbar-y");
    toolbar.style.removeProperty("--damophus-cover-toolbar-offset-x");
    toolbar.style.removeProperty("--damophus-cover-toolbar-offset-y");
    root.removeAttribute("data-damophus-cover-layer");
    root.removeAttribute("data-damophus-cover-breadcrumb");
    root.removeAttribute("data-damophus-cover-menu");
  };
}
