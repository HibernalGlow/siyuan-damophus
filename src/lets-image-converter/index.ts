import {mount, unmount} from "svelte";
import {openTab, type IEventBusMap, type Menu} from "siyuan";
import {getLogger} from "@/libs/logger";
import {SubPluginBase} from "@/libs/sub-plugin-base";
import {plugin} from "@/utils";
import {
  convertBatchImages,
  type BatchConversionOptions,
  type BatchProgress,
} from "./batch-converter";
import BatchImageConverter from "./BatchImageConverter.svelte";
import {
  clampQuality,
  convertImageFile,
  filesFromPaste,
  parseImageFormat,
  type ImageConversionOptions,
} from "./image-converter";
import {imageConverterTabTarget, imageConverterTabType} from "./tab-contract";
import "./image-converter.css";

const log = getLogger("lets-image-converter");
type BatchRunOptions = Omit<BatchConversionOptions, "onProgress" | "conversion"> & {format: string; quality: number};

export default class ImageConverterPlugin extends SubPluginBase {
  private listening = false;
  private converting = false;
  private tabRegistered = false;
  private readonly tabCleanups = new Map<HTMLElement, () => void>();

  private readonly handlePaste = (event: CustomEvent<IEventBusMap["paste"]>): void => {
    const detail = event.detail;
    const resolve = detail.resolve as unknown as (value: unknown) => void;
    const files = filesFromPaste(detail.files);
    if (files.length === 0 || !files.some((file) => file.type.startsWith("image/"))) {
      // Leave ordinary text and non-image pastes untouched. Calling the paste
      // resolver here replaces SiYuan's native text payload in newer builds.
      return;
    }
    if (this.converting) {
      return;
    }

    this.converting = true;
    void this.convertFiles(files)
      .then((converted) => resolve({files: converted}))
      .catch((error) => {
        log.error("Image conversion failed; original files will be uploaded", error);
        resolve({files});
      })
      .finally(() => { this.converting = false; });
  };

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: imageConverterTabType,
      init() {
        const element = this.element as HTMLElement;
        owner.tabCleanups.get(element)?.();
        const app = mount(BatchImageConverter, {
          target: element,
          props: {
            labels: owner.labels(),
            defaultFormat: owner.defaultFormat(),
            defaultQuality: owner.defaultQuality(),
            defaultSkipAnimated: owner.skipAnimated(),
            onRun: (options: BatchRunOptions, onProgress: (progress: BatchProgress) => void) => owner.runBatch(options, onProgress),
          },
        });
        owner.tabCleanups.set(element, () => void unmount(app));
      },
      destroy() {
        const element = this.element as HTMLElement;
        owner.tabCleanups.get(element)?.();
        owner.tabCleanups.delete(element);
      },
    });
  }

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("paste", this.handlePaste);
  }

  override onunload(): void {
    if (this.listening) {
      plugin.eventBus.off("paste", this.handlePaste);
      this.listening = false;
    }
    this.converting = false;
    for (const cleanup of this.tabCleanups.values()) cleanup();
    this.tabCleanups.clear();
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconImages",
      label: this.t("lets-image-converter.batchMenu"),
      click: () => this.openBatchTab(),
    });
  }

  private conversionOptions(): ImageConversionOptions {
    const format = this.defaultFormat();
    const parsed = parseImageFormat(format);
    return {
      format,
      quality: clampQuality(this.getSetting("quality"), parsed.presetQuality),
      skipAnimated: this.skipAnimated(),
      nativeCommand: this.nativeCommand(),
    };
  }

  private async convertFiles(files: File[]): Promise<File[]> {
    const options = this.conversionOptions();
    const results: File[] = [];
    for (const file of files) results.push(await convertImageFile(file, options));
    return results;
  }

  private defaultFormat(): string {
    return String(this.getSetting("format") ?? "avifq60");
  }

  private defaultQuality(): number {
    const parsed = parseImageFormat(this.defaultFormat());
    return clampQuality(this.getSetting("quality"), parsed.presetQuality);
  }

  private skipAnimated(): boolean {
    return this.getSetting("skipAnimated") !== false;
  }

  private nativeCommand(): string {
    return String(this.getSetting("nativeCommand") ?? "auto").trim() || "auto";
  }

  private openBatchTab(): void {
    void openTab({
      app: plugin.app,
      custom: {
        icon: "iconImages",
        title: this.t("lets-image-converter.batchTitle"),
        ...imageConverterTabTarget(plugin.name),
      },
    });
  }

  private runBatch(options: BatchRunOptions, onProgress: (progress: BatchProgress) => void) {
    return convertBatchImages({
      ...options,
      conversion: {
        format: options.format,
        quality: options.quality,
        nativeCommand: this.nativeCommand(),
      },
      onProgress,
    });
  }

  private labels(): Record<string, string> {
    return {
      title: this.t("lets-image-converter.batchTitle"),
      subtitle: this.t("lets-image-converter.batchDescription"),
      targetId: this.t("lets-image-converter.targetId"),
      targetIdPlaceholder: this.t("lets-image-converter.targetIdPlaceholder"),
      scope: this.t("lets-image-converter.scope"),
      scopeDocument: this.t("lets-image-converter.scopeDocument"),
      scopeNotebook: this.t("lets-image-converter.scopeNotebook"),
      format: this.t("lets-image-converter.formatTitle"),
      quality: this.t("lets-image-converter.qualityTitle"),
      includeChildren: this.t("lets-image-converter.includeChildren"),
      skipAnimated: this.t("lets-image-converter.skipAnimated"),
      start: this.t("lets-image-converter.start"),
      running: this.t("lets-image-converter.running"),
      reset: this.t("lets-image-converter.reset"),
      creatingSnapshot: this.t("lets-image-converter.creatingSnapshot"),
      completed: this.t("lets-image-converter.completed"),
      failed: this.t("lets-image-converter.failed"),
      resultSummary: this.t("lets-image-converter.resultSummary"),
      resultSkipped: this.t("lets-image-converter.resultSkipped"),
      formatAvifQ60: this.t("lets-image-converter.formatAvifQ60"),
      formatAvifQ80: this.t("lets-image-converter.formatAvifQ80"),
      formatWebpQ60: this.t("lets-image-converter.formatWebpQ60"),
      formatWebpQ80: this.t("lets-image-converter.formatWebpQ80"),
    };
  }
}
