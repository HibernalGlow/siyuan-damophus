type RuntimeRequire = (id: string) => any;

function runtimeRequire(): RuntimeRequire | undefined {
  const runtime = globalThis as typeof globalThis & {
    require?: RuntimeRequire;
    window?: {require?: RuntimeRequire};
  };
  return runtime.window?.require ?? runtime.require;
}

interface NativeModules {
  childProcess: {
    execFile: (
      file: string,
      args: string[],
      options: {windowsHide: boolean; maxBuffer: number},
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => void;
  };
  fs: {
    mkdtemp: (prefix: string) => Promise<string>;
    writeFile: (path: string, data: Uint8Array) => Promise<void>;
    readFile: (path: string) => Promise<Uint8Array>;
    rm: (path: string, options: {recursive: boolean; force: boolean}) => Promise<void>;
  };
  os: {tmpdir: () => string};
  path: {join: (...parts: string[]) => string; basename: (path: string) => string};
}

function loadNativeModules(): NativeModules {
  const require = runtimeRequire();
  if (!require) {
    throw new Error("Image conversion requires SiYuan Desktop with a native image command");
  }
  try {
    return {
      childProcess: require("node:child_process"),
      fs: require("node:fs/promises"),
      os: require("node:os"),
      path: require("node:path"),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load SiYuan Desktop native runtime: ${detail}`);
  }
}

function commandName(command: string): string {
  return command.split(/[\\/]/u).pop()?.toLowerCase().replace(/\.exe$/u, "") ?? command.toLowerCase();
}

function commandCandidates(format: ImageFormat, configuredCommand: string): string[] {
  if (configuredCommand.trim() && configuredCommand.trim().toLowerCase() !== "auto") {
    return [configuredCommand.trim()];
  }
  return format === "avif" ? ["avifenc", "magick", "ffmpeg"] : ["magick", "ffmpeg"];
}

function commandArgs(command: string, format: ImageFormat, quality: number, input: string, output: string): string[] {
  switch (commandName(command)) {
    case "avifenc":
      return ["--qcolor", String(quality), "--qalpha", String(quality), "--speed", "6", input, output];
    case "ffmpeg":
      return [
        "-hide_banner", "-loglevel", "error", "-y", "-i", input,
        "-frames:v", "1", "-c:v", format === "avif" ? "libaom-av1" : "libwebp",
        "-q:v", String(format === "avif" ? Math.max(1, Math.round((100 - quality) * 0.63)) : quality),
        output,
      ];
    default:
      return [input, "-quality", String(quality), output];
  }
}

function execFile(
  childProcess: NativeModules["childProcess"],
  command: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(command, args, {windowsHide: true, maxBuffer: 4 * 1024 * 1024}, (error, stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      const detail = [stderr.trim(), stdout.trim(), error.message].filter(Boolean).join("\n");
      reject(new Error(`${command} failed: ${detail}`));
    });
  });
}

function hasOutputSignature(bytes: Uint8Array, format: ImageFormat): boolean {
  if (format === "webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") return false;
  const boxSize = bytes[0] * 0x1000000 + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  const brands = String.fromCharCode(...bytes.slice(8, Math.min(bytes.length, Math.max(12, boxSize))));
  return brands.includes("avif") || brands.includes("avis");
}

export type ImageFormat = "avif" | "webp";

export async function convertWithNativeCommand(
  file: File,
  format: ImageFormat,
  quality: number,
  configuredCommand = "auto",
): Promise<ArrayBuffer> {
  const modules = loadNativeModules();
  const tempRoot = await modules.fs.mkdtemp(modules.path.join(modules.os.tmpdir(), "damophus-image-"));
  const inputName = modules.path.basename(file.name).replace(/[^a-zA-Z0-9._-]/gu, "_") || "input.bin";
  const inputPath = modules.path.join(tempRoot, inputName);
  await modules.fs.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
  const errors: string[] = [];
  try {
    const candidates = commandCandidates(format, configuredCommand);
    for (let index = 0; index < candidates.length; index += 1) {
      const command = candidates[index];
      const attemptOutputPath = modules.path.join(tempRoot, `output-${index}.${format}`);
      try {
        await execFile(modules.childProcess, command, commandArgs(command, format, quality, inputPath, attemptOutputPath));
        const output = await modules.fs.readFile(attemptOutputPath);
        if (hasOutputSignature(output, format)) return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
        errors.push(`${command}: output signature is not ${format}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(
      `No native converter produced ${format}. Install avifenc, ImageMagick, or FFmpeg, `
        + `or set an absolute converter path. ${errors.join("; ")}`,
    );
  } finally {
    await modules.fs.rm(tempRoot, {recursive: true, force: true});
  }
}
