export const DEFAULT_FORMAT = "avifq60";
export const DEFAULT_QUALITY = 60;

import {convertWithNativeCommand, type ImageFormat} from "./native-image-converter";

export interface ImageConversionOptions {
  format: string;
  quality: number;
  skipAnimated?: boolean;
  nativeCommand?: string;
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
  return {format: match[1] as ImageFormat, presetQuality: Math.min(100, Math.max(1, Number(match[2])))};
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
  return `${fileName.replace(/\.[^/.]+$/u, "")}.${format}`;
}

export function isImageAssetPath(path: string): boolean {
  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function hasWebpChunk(bytes: Uint8Array, chunkType: string): boolean {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    if (ascii(bytes, offset, 4) === chunkType) return true;
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    if (size < 0) return false;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function hasPngChunk(bytes: Uint8Array, chunkType: string): boolean {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (ascii(bytes, offset + 4, 4) === chunkType) return true;
    offset += 12 + size;
  }
  return false;
}

function hasAvifAnimationBrand(bytes: Uint8Array): boolean {
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (ascii(bytes, offset + 4, 4) === "ftyp") {
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
  if (mime === "image/gif" || ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") return true;
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return hasWebpChunk(data, "ANIM") || hasWebpChunk(data, "ANMF");
  if (data.length >= 8 && data[0] === 0x89 && ascii(data, 1, 3) === "PNG" && hasPngChunk(data, "acTL")) return true;
  return (mime === "image/avif" || ascii(data, 4, 4) === "ftyp") && hasAvifAnimationBrand(data);
}

export async function isAnimatedImage(file: File): Promise<boolean> {
  return isAnimatedImageBytes(await file.arrayBuffer(), file.type);
}

export async function convertImageFileDetailed(file: File, options: ImageConversionOptions): Promise<ConvertedImage> {
  const parsed = parseImageFormat(options.format);
  if (!isConvertibleImage(file, parsed.format)) return {file, skipped: true, reason: "same-format"};
  if (options.skipAnimated !== false && await isAnimatedImage(file)) return {file, skipped: true, reason: "animated"};
  const encoded = await convertWithNativeCommand(file, parsed.format, clampQuality(options.quality, parsed.presetQuality), options.nativeCommand);
  return {file: new File([encoded], outputFileName(file.name, parsed.format), {type: `image/${parsed.format}`, lastModified: file.lastModified}), skipped: false};
}

export async function convertImageFile(file: File, options: ImageConversionOptions): Promise<File> {
  return (await convertImageFileDetailed(file, options)).file;
}

export function filesFromPaste(files: FileList | DataTransferItemList | File[] | undefined): File[] {
  if (!files) return [];
  const result: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index] as File | DataTransferItem;
    if (entry instanceof File) result.push(entry);
    else if (typeof entry?.getAsFile === "function") {
      const file = entry.getAsFile();
      if (file) result.push(file);
    }
  }
  return result;
}
