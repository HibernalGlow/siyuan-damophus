export interface StatisticsCardPreviewRequest {
  id: string;
  title: string;
  card: HTMLElement;
  trigger: HTMLElement;
}

export type StatisticsCardPreviewHandler = (request: StatisticsCardPreviewRequest) => void;

export interface StatisticsPreviewDialog {
  element: HTMLElement;
  destroy(): void;
}

export type StatisticsPreviewDialogConstructor = new (options: {
  title: string;
  content: string;
  width: string;
  height: string;
  destroyCallback: () => void;
}) => StatisticsPreviewDialog;

export function openStatisticsCardPreview(
  request: StatisticsCardPreviewRequest,
  DialogCtor: StatisticsPreviewDialogConstructor,
  mobile: boolean,
): void {
  const marker = document.createComment(`damophus-statistics-card:${request.id}`);
  const parent = request.card.parentNode;
  if (!parent) return;
  parent.replaceChild(marker, request.card);

  let restored = false;
  let removeGestureIsolation: (() => void) | undefined;
  const restore = () => {
    if (restored) return;
    restored = true;
    removeGestureIsolation?.();
    request.card.classList.remove("damophus-statistics-preview-card");
    marker.parentNode?.replaceChild(request.card, marker);
    request.trigger.focus();
  };
  const dialog = new DialogCtor({
    title: request.title,
    content: '<div class="damophus-statistics-preview-host"><div class="damophus-statistics-preview-scroll"></div></div>',
    width: mobile ? "100vw" : "min(96vw, 1200px)",
    height: mobile ? "100dvh" : "min(90dvh, 900px)",
    destroyCallback: restore,
  });
  dialog.element.classList.add("damophus-statistics-preview-dialog");
  if (mobile) removeGestureIsolation = isolateMobileDialogGestures(dialog.element);
  const target = dialog.element.querySelector<HTMLElement>(".damophus-statistics-preview-scroll");
  if (!target) {
    dialog.destroy();
    return;
  }
  request.card.classList.add("damophus-statistics-preview-card");
  target.append(request.card);
}
import { isolateMobileDialogGestures } from "./mobile-dialog-scroll";
