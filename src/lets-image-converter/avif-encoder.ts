let encoderModule: Promise<{encode: (data: Uint8Array, width: number, height: number, options: Record<string, unknown>) => Uint8Array}> | undefined;
let defaultOptions: Record<string, unknown> | undefined;

async function getEncoderModule(): Promise<{encode: (data: Uint8Array, width: number, height: number, options: Record<string, unknown>) => Uint8Array}> {
  if (!encoderModule) {
    encoderModule = Promise.all([
      import("@jsquash/avif/codec/enc/avif_enc.js"),
      import("@jsquash/avif/utils.js"),
      import("@jsquash/avif/meta.js"),
    ]).then(([codec, utils, meta]) => {
      defaultOptions = meta.defaultOptions as unknown as Record<string, unknown>;
      return utils.initEmscriptenModule(codec.default);
    });
  }
  return encoderModule;
}

export async function encodeAvif(
  imageData: ImageData,
  quality: number,
): Promise<ArrayBuffer> {
  const module = await getEncoderModule();
  const output = module.encode(
    new Uint8Array(imageData.data.buffer),
    imageData.width,
    imageData.height,
    {
      ...defaultOptions,
      quality,
      qualityAlpha: -1,
      speed: 6,
      subsample: 1,
      lossless: false,
    },
  );
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}
