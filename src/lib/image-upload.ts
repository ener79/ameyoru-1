const SUPPORTED_IMAGE_LABELS =
  "PNG / JPEG / WebP / GIF / BMP / AVIF / HEIC / HEIF";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/x-png",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export interface ImageUpload {
  bytes: Buffer;
  ext: string;
}

export function contentTypeForImageExt(ext: string): string | null {
  const normalized = ext.toLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  if (normalized === "bmp") return "image/bmp";
  if (normalized === "avif") return "image/avif";
  if (normalized === "heic") return "image/heic";
  if (normalized === "heif") return "image/heif";
  return null;
}

function detectImageUpload(bytes: Buffer): { ext: string } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: "png" };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { ext: "jpg" };
  }

  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp" };
  }

  const gifHeader = bytes.toString("ascii", 0, 6);
  if (gifHeader === "GIF89a" || gifHeader === "GIF87a") {
    return { ext: "gif" };
  }

  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { ext: "bmp" };
  }

  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 4, 8) === "ftyp"
  ) {
    const brand = bytes.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") {
      return { ext: "avif" };
    }
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "hevx"
    ) {
      return { ext: "heic" };
    }
    if (brand === "mif1" || brand === "msf1") {
      return { ext: "heif" };
    }
  }

  return null;
}

function hasSupportedMime(type: string): boolean {
  if (!type || type === "application/octet-stream") return true;
  if (SUPPORTED_MIME_TYPES.has(type)) return true;
  return type.startsWith("image/");
}

export async function readImageUpload(
  file: File,
  opts: { maxBytes: number; label: string }
): Promise<{ ok: true; upload: ImageUpload } | { ok: false; error: string }> {
  if (file.size > opts.maxBytes) {
    return { ok: false, error: `${opts.label}不能超过 20MB` };
  }

  const type = file.type.toLowerCase();
  if (!hasSupportedMime(type)) {
    return {
      ok: false,
      error: `${opts.label}只支持 ${SUPPORTED_IMAGE_LABELS}`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageUpload(bytes);
  if (!detected) {
    return { ok: false, error: `${opts.label}文件内容不是有效图片` };
  }

  return { ok: true, upload: { bytes, ext: detected.ext } };
}
