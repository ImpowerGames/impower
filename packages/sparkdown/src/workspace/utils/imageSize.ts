export interface ImageSize {
  width: number;
  height: number;
}

export const IMAGE_HEADER_BYTES = 65536;

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const sized = (width: number, height: number): ImageSize | undefined =>
  width > 0 && height > 0 ? { width, height } : undefined;

const pngHasNoExif = (bytes: Uint8Array, view: DataView) => {
  let at = 8;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at + 4, 4);
    if (type === "eXIf") return false;
    if (type === "IDAT" || type === "IEND") return true;
    at += 12 + view.getUint32(at);
  }
  return false;
};

const pngSize = (bytes: Uint8Array, view: DataView) =>
  bytes.length >= 24 && ascii(bytes, 12, 4) === "IHDR" && pngHasNoExif(bytes, view)
    ? sized(view.getUint32(16), view.getUint32(20))
    : undefined;

const GIF_IMAGE = 0x2c;
const GIF_EXTENSION = 0x21;
const GIF_TRAILER = 0x3b;

const gifSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 13 || ascii(bytes, 0, 4) !== "GIF8") return undefined;
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const flags = bytes[10]!;
  let at = 13 + (flags & 0x80 ? 3 * (2 << (flags & 0x07)) : 0);
  while (at < bytes.length) {
    const block = bytes[at]!;
    if (block === GIF_IMAGE) {
      if (at + 9 > bytes.length) return undefined;
      const left = view.getUint16(at + 1, true);
      const top = view.getUint16(at + 3, true);
      return sized(Math.max(width, left + view.getUint16(at + 5, true)), Math.max(height, top + view.getUint16(at + 7, true)));
    }
    if (block === GIF_TRAILER) return sized(width, height);
    if (block !== GIF_EXTENSION) return undefined;
    at += 2;
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at]! + 1;
    at += 1;
  }
  return undefined;
};

const BMP_CORE_HEADER = 12;

const bmpSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 26 || ascii(bytes, 0, 2) !== "BM") return undefined;
  return view.getUint32(14, true) === BMP_CORE_HEADER
    ? sized(view.getUint16(18, true), view.getUint16(20, true))
    : sized(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)));
};

const webpSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return undefined;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") {
    return sized(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return sized((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return sized(width, height);
  }
  return undefined;
};

const JPEG_START_OF_SCAN = 0xda;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_APP1 = 0xe1;
const JPEG_HIERARCHICAL_FRAMES = new Set([0xc5, 0xc6, 0xc7, 0xcd, 0xce, 0xcf]);

const jpegSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let at = 2;
  let size: ImageSize | undefined;
  while (at + 1 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) return size;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    if (marker === 0x00 || at + 3 >= bytes.length) return undefined;
    if (marker === JPEG_APP1 && (at + 10 > bytes.length || ascii(bytes, at + 4, 6) === "Exif\0\0")) return undefined;
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame && size === undefined) {
      if (JPEG_HIERARCHICAL_FRAMES.has(marker) || at + 9 > bytes.length) return undefined;
      size = sized(view.getUint16(at + 7), view.getUint16(at + 5));
      if (!size) return undefined;
    }
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
};

const SVG_TAG = /<svg\b[^>]*>/i;
const SVG_LENGTH = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i;

const svgAttribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(2).find((value) => value !== undefined);

const svgLength = (value: string | undefined) => {
  const match = value === undefined ? null : SVG_LENGTH.exec(value);
  return match ? Number(match[1]) : undefined;
};

const svgSize = (bytes: Uint8Array) => {
  const tag = SVG_TAG.exec(new TextDecoder().decode(bytes))?.[0];
  if (!tag) {
    return undefined;
  }
  const width = svgLength(svgAttribute(tag, "width"));
  const height = svgLength(svgAttribute(tag, "height"));
  if (width !== undefined && height !== undefined) {
    return sized(width, height);
  }
  const box = svgAttribute(tag, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  return box?.length === 4 && box.every(Number.isFinite) ? sized(box[2]!, box[3]!) : undefined;
};

export const imageSizeOf = (bytes: Uint8Array): ImageSize | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngSize(bytes, view);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes, view);
  if (ascii(bytes, 0, 4) === "GIF8") return gifSize(bytes, view);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpSize(bytes, view);
  if (ascii(bytes, 0, 2) === "BM") return bmpSize(bytes, view);
  return svgSize(bytes);
};

const RASTER_EXTENSIONS = new Set(["png", "apng", "jpg", "jpeg", "gif", "webp", "bmp"]);

export const isRasterImageFile = (file: { type: string; ext: string }) =>
  file.type === "image" && RASTER_EXTENSIONS.has(file.ext.toLowerCase());
