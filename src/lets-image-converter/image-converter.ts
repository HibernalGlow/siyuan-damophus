import imageCompression, { type Options as ImageCompressionOptions } from "browser-image-compression";

export const DEFAULT_FORMAT = "avifq60";
export const DEFAULT_QUALITY = 60;

export type ImageFormat = "avif" | "webp";

export interface ImageConversionOptions {
  format: string;
  quality: number;
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

export interface ParsedImageFormat {
  format: ImageFormat;
  presetQuality: number;
}

const IMAGE_FORMAT_PATTERN = /^(avif|webp)q([1-9][0-9]?)$/u;

export function parseImageFormat(value: unknown): ParsedImageFormat {
  const match = IMAGE_FORMAT_PATTERN.exec(String(value ?? ""));
  if (!match) return { format: "avif", presetQuality: DEFAULT_QUALITY };
  return {
    format: match[1] as ImageFormat,
    presetQuality: Math.min(100, Math.max(1, Number(match[2]))),
  };
}

export function clampQuality(value: unknown, fallback = DEFAULT_QUALITY): number {
  const quality = Number(value);
  if (!Number.isFinite(quality)) return fallback;
  return Math.min(100, Math.max(1, Math.round(quality)));
}

export function isConvertibleImage(file: File, outputFormat?: ImageFormat): boolean {
  return file.type.startsWith("image/") && file.type !== (outputFormat ? `image/${outputFormat}` : "");
}

export function outputFileName(fileName: string, format: ImageFormat): string {
  const baseName = fileName.replace(/\.[^/.]+$/u, "");
  return `${baseName}.${format}`;
}

export async function convertImageFile(
  file: File,
  options: ImageConversionOptions,
): Promise<File> {
  const parsed = parseImageFormat(options.format);
  if (!isConvertibleImage(file, parsed.format)) return file;
  const quality = clampQuality(options.quality, parsed.presetQuality) / 100;
  const compressionOptions: ImageCompressionOptions = {
    fileType: `image/${parsed.format}`,
    initialQuality: quality,
    maxSizeMB: options.maxSizeMB ?? 0.75,
    maxWidthOrHeight: options.maxWidthOrHeight ?? 1920,
    useWebWorker: true,
  };
  const compressed = await imageCompression(file, compressionOptions);
  return new File([compressed], outputFileName(file.name, parsed.format), {
    type: `image/${parsed.format}`,
    lastModified: file.lastModified,
  });
}

export function filesFromPaste(
  files: FileList | DataTransferItemList | File[] | undefined,
): File[] {
  if (!files) return [];
  const result: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index] as File | DataTransferItem;
    if (entry instanceof File) {
      result.push(entry);
      continue;
    }
    if (typeof entry?.getAsFile === "function") {
      const file = entry.getAsFile();
      if (file) result.push(file);
    }
  }
  return result;
}
