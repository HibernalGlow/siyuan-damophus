import { mount, unmount } from "svelte";
import { Dialog } from "siyuan";
import IconPicker, { type IconPickerLabels } from "./icon-picker.svelte";

export interface IconPickerDialogOptions {
  title: string;
  labels: IconPickerLabels;
  selected?: string;
  onSelect: (iconId: string) => void;
}

export function openIconPickerDialog(options: IconPickerDialogOptions): () => void {
  let instance: ReturnType<typeof mount> | undefined;
  const dialog = new Dialog({
    title: options.title,
    width: "min(560px, 92vw)",
    content: `<div class="damophus-theme-root damophus-question-bank-theme damophus-icon-picker p-4"></div>`,
    destroyCallback: () => {
      if (instance) {
        unmount(instance);
        instance = undefined;
      }
    },
  });
  const target = dialog.element.querySelector<HTMLElement>(".damophus-icon-picker");
  if (!target) return () => dialog.destroy();
  instance = mount(IconPicker, {
    target,
    props: {
      labels: options.labels,
      selected: options.selected ?? "",
      onSelect: (iconId: string) => {
        options.onSelect(iconId);
        dialog.destroy();
      },
    },
  });
  return () => dialog.destroy();
}
