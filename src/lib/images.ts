import "server-only";
import sharp from "sharp";

export const MAX_PHOTOS = 8;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const WEB_MAX_WIDTH = 2000;
export const SOFT_WIDTH = 800;

export const TYPE_MESSAGE = "Only JPEG, PNG and WebP photos are allowed.";
export const SIZE_MESSAGE = "That photo is larger than the 5 MB limit. Please choose a smaller file.";

export type ProcessedImage = {
  original: Buffer;
  web: Buffer;
  ext: "jpg" | "png" | "webp";
  contentType: string;
  width: number;
  height: number;
  originalWidth: number;
  resized: boolean;
  soft: boolean;
};

export class ImageError extends Error {}

export async function processImage(data: Buffer, declaredType: string): Promise<ProcessedImage> {
  if (data.length > MAX_BYTES) throw new ImageError(SIZE_MESSAGE);
  if (!ALLOWED_TYPES.includes(declaredType)) throw new ImageError(TYPE_MESSAGE);
  let meta;
  try {
    meta = await sharp(data).metadata();
  } catch {
    throw new ImageError("That file could not be read as an image. " + TYPE_MESSAGE);
  }
  const fmt = meta.format;
  if (!fmt || !["jpeg", "png", "webp"].includes(fmt) || !meta.width || !meta.height) {
    throw new ImageError(TYPE_MESSAGE);
  }
  const ext = fmt === "jpeg" ? "jpg" : (fmt as "png" | "webp");
  const contentType = fmt === "jpeg" ? "image/jpeg" : `image/${fmt}`;
  // Orientation can swap width and height.
  const swap = (meta.orientation ?? 1) >= 5;
  const originalWidth = swap ? meta.height : meta.width;
  const originalHeight = swap ? meta.width : meta.height;
  let web = data;
  let width = originalWidth;
  let height = originalHeight;
  let resized = false;
  if (originalWidth > WEB_MAX_WIDTH) {
    const out = await sharp(data).rotate().resize({ width: WEB_MAX_WIDTH, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    web = out.data;
    width = out.info.width;
    height = out.info.height;
    resized = true;
  }
  return {
    original: data,
    web,
    ext,
    contentType,
    width,
    height,
    originalWidth,
    resized,
    soft: originalWidth < SOFT_WIDTH,
  };
}
