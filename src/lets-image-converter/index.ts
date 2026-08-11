import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import type { IEventBusMap } from "siyuan";
import {
  clampQuality,
  convertImageFile,
  filesFromPaste,
  parseImageFormat,
  type ImageConversionOptions,
} from "./image-converter";

const log = getLogger("lets-image-converter");

export default class ImageConverterPlugin extends SubPluginBase {
  private listening = false;
  private converting = false;

  private readonly handlePaste = (event: CustomEvent<IEventBusMap["paste"]>): void => {
    const detail = event.detail;
    const resolve = detail.resolve as unknown as (value: unknown) => void;
    const files = filesFromPaste(detail.files);
    if (files.length === 0 || !files.some((file) => file.type.startsWith("image/"))) {
      resolve({ files: detail.files });
      return;
    }

    if (this.converting) {
      resolve({ files: detail.files });
      return;
    }

    this.converting = true;
    void this.convertFiles(files)
      .then((converted) => resolve({ files: converted }))
      .catch((error) => {
        log.error("Image conversion failed; original files will be uploaded", error);
        resolve({ files });
      })
      .finally(() => {
        this.converting = false;
      });
  };

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("paste", this.handlePaste);
  }

  override onunload(): void {
    if (!this.listening) return;
    plugin.eventBus.off("paste", this.handlePaste);
    this.listening = false;
    this.converting = false;
  }

  private conversionOptions(): ImageConversionOptions {
    const format = String(this.getSetting("format") ?? "avifq60");
    const parsed = parseImageFormat(format);
    return {
      format,
      quality: clampQuality(this.getSetting("quality"), parsed.presetQuality),
    };
  }

  private async convertFiles(files: File[]): Promise<File[]> {
    const options = this.conversionOptions();
    const results: File[] = [];
    for (const file of files) {
      results.push(await convertImageFile(file, options));
    }
    return results;
  }
}
