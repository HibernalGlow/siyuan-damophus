import {encodeAvif} from "./avif-encoder";

export const DEFAULT_FORMAT = "avifq60";
export const DEFAULT_QUALITY = 60;

export type ImageFormat = "avif" | "webp";

export interface ImageConversionOptions {
  format: string;
  quality: number;
  maxWidthOrHeight?: number;
  skipAnimated?: boolean;
}

export interface ParsedImageFormat {
  format: ImageFormat;
  presetQuality: number;
}

export interface ConvertedImage {
  file: File;
  skipped: boolean;
  reason?: "animated" | "same-format";
}

const IMAGE_FORMAT_PATTERN = /^(avif|webp)q([1-9][0-9]?)$/u;
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);

export function parseImageFormat(value: unknown): ParsedImageFormat {
  const match = IMAGE_FORMAT_PATTERN.exec(String(value ?? ""));
  if (!match) return {format: "avif", presetQuality: DEFAULT_QUALITY};
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
  if (!file.type.startsWith("image/")) return false;
  return file.type !== (outputFormat ? `image/${outputFormat}` : "");
}

export function outputFileName(fileName: string, format: ImageFormat): string {
  const baseName = fileName.replace(/\.[^/.]+$/u, "");
  return `${baseName}.${format}`;
}

export function isImageAssetPath(path: string): boolean {
  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function hasChunk(bytes: Uint8Array, chunkType: string): boolean {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes[offset]
      | (bytes[offset + 1] << 8)
      | (bytes[offset + 2] << 16)
      | (bytes[offset + 3] << 24);
    const type = ascii(bytes, offset + 4, 4);
    if (type === chunkType) return true;
    if (!Number.isFinite(size) || size < 0) return false;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function hasPngChunk(bytes: Uint8Array, chunkType: string): boolean {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = (bytes[offset] * 0x1000000)
      + (bytes[offset + 1] << 16)
      + (bytes[offset + 2] << 8)
      + bytes[offset + 3];
    if (ascii(bytes, offset + 4, 4) === chunkType) return true;
    if (size < 0) return false;
    offset += 12 + size;
  }
  return false;
}

function hasAvifAnimationBrand(bytes: Uint8Array): boolean {
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = (bytes[offset] * 0x1000000)
      + (bytes[offset + 1] << 16)
      + (bytes[offset + 2] << 8)
      + bytes[offset + 3];
    const type = ascii(bytes, offset + 4, 4);
    if (type === "ftyp") {
      const brands = ascii(bytes, offset + 8, Math.min(size - 8, bytes.length - offset - 8));
      return brands.includes("avis") || brands.includes("msf1");
    }
    if (size < 8) break;
    offset += size;
  }
  return false;
}

export function isAnimatedImageBytes(bytes: ArrayBuffer | Uint8Array, mimeType = ""): boolean {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const mime = mimeType.toLowerCase();
  if (mime === "image/gif" || ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") {
    return true;
  }
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") {
    return hasChunk(data, "ANIM") || hasChunk(data, "ANMF");
  }
  if (data.length >= 8
    && data[0] === 0x89 && ascii(data, 1, 3) === "PNG"
    && hasPngChunk(data, "acTL")) {
    return true;
  }
  return (mime === "image/avif" || ascii(data, 4, 4) === "ftyp") && hasAvifAnimationBrand(data);
}

export async function isAnimatedImage(file: File): Promise<boolean> {
  return isAnimatedImageBytes(await file.arrayBuffer(), file.type);
}

async function imageDataFromFile(file: File, maxWidthOrHeight = 1920): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidthOrHeight / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), {width, height});
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("Unable to create an image canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

async function encodeWebp(imageData: ImageData, quality: number): Promise<ArrayBuffer> {
  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(imageData.width, imageData.height)
    : Object.assign(document.createElement("canvas"), {width: imageData.width, height: imageData.height});
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("Unable to create an image canvas");
  context.putImageData(imageData, 0, 0);
  if ("convertToBlob" in canvas) {
    return (await (canvas as OffscreenCanvas).convertToBlob({type: "image/webp", quality: quality / 100})).arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (!blob) reject(new Error("WebP encoding is not supported by this browser"));
      else void blob.arrayBuffer().then(resolve, reject);
    }, "image/webp", quality / 100);
  });
}

export async function convertImageFileDetailed(
  file: File,
  options: ImageConversionOptions,
): Promise<ConvertedImage> {
  const parsed = parseImageFormat(options.format);
  if (!isConvertibleImage(file, parsed.format)) {
    return {file, skipped: true, reason: "same-format"};
  }
  if (options.skipAnimated !== false && await isAnimatedImage(file)) {
    return {file, skipped: true, reason: "animated"};
  }

  const quality = clampQuality(options.quality, parsed.presetQuality);
  const imageData = await imageDataFromFile(file, options.maxWidthOrHeight ?? 1920);
  const encoded = parsed.format === "avif"
    ? await encodeAvif(imageData, quality)
    : await encodeWebp(imageData, quality);
  return {
    file: new File([encoded], outputFileName(file.name, parsed.format), {
      type: `image/${parsed.format}`,
      lastModified: file.lastModified,
    }),
    skipped: false,
  };
}

export async function convertImageFile(file: File, options: ImageConversionOptions): Promise<File> {
  return (await convertImageFileDetailed(file, options)).file;
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
