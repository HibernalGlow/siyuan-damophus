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
  containerClassName?: string;
  disableClose?: boolean;
  hideCloseIcon?: boolean;
  destroyCallback: () => void;
}) => StatisticsPreviewDialog;

export function openStatisticsCardPreview(
  request: StatisticsCardPreviewRequest,
  DialogCtor: StatisticsPreviewDialogConstructor,
  mobile: boolean,
): void {
  const previewCard = request.card.cloneNode(true) as HTMLElement;
  let removeGestureIsolation: (() => void) | undefined;
  const restore = () => {
    removeGestureIsolation?.();
    request.trigger.focus();
  };
  const dialog = new DialogCtor({
    title: request.title,
    content: '<div class="b3-dialog__content damophus-statistics-preview-content fn__flex-column"><div class="damophus-statistics-preview-host"><div class="damophus-statistics-preview-scroll"></div></div></div>',
    width: mobile ? "100vw" : "min(96vw, 1200px)",
    height: mobile ? "100dvh" : "min(90dvh, 900px)",
    containerClassName: "damophus-statistics-preview-container",
    disableClose: false,
    hideCloseIcon: false,
    destroyCallback: restore,
  });
  dialog.element.classList.add(
    "damophus-statistics-preview-dialog",
    "damophus-theme-root",
    "damophus-question-bank-theme",
  );
  // Some SiYuan mobile/browser builds add `fn__none` to Dialog close icons;
  // this preview must always provide an explicit way back to the report.
  dialog.element.querySelector<HTMLElement>(".b3-dialog__close")?.classList.remove("fn__none");
  if (mobile) removeGestureIsolation = isolateMobileDialogGestures(dialog.element);
  const target = dialog.element.querySelector<HTMLElement>(".damophus-statistics-preview-scroll");
  if (!target) {
    dialog.destroy();
    return;
  }
  previewCard.classList.add("damophus-statistics-preview-card");
  target.append(previewCard);
}
import { isolateMobileDialogGestures } from "../workspace/mobile-dialog-scroll";
