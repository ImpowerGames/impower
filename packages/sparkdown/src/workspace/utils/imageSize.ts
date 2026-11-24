export interface ImageSize {
  width: number;
  height: number;
}

export const IMAGE_HEADER_BYTES = 65536;

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const sized = (width: number, height: number): ImageSize | undefined =>
  width > 0 && height > 0 ? { width, height } : undefined;

const EXIF_ORIENTATION_TAG = 0x0112;

const exifOrientation = (bytes: Uint8Array, start: number, blockEnd: number): number | undefined => {
  const end = Math.min(blockEnd, bytes.length);
  const order = ascii(bytes, start, 2);
  const little = order === "II";
  if ((!little && order !== "MM") || start + 8 > end) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
  if (view.getUint16(2, little) !== 42) return undefined;
  const directory = view.getUint32(4, little);
  if (directory + 2 > view.byteLength) return undefined;
  const count = view.getUint16(directory, little);
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > view.byteLength) return undefined;
    if (view.getUint16(entry, little) === EXIF_ORIENTATION_TAG) return view.getUint16(entry + 8, little);
  }
  return undefined;
};

const oriented = (size: ImageSize | undefined, orientation: number | undefined) =>
  size && orientation !== undefined && orientation >= 5 && orientation <= 8
    ? { width: size.height, height: size.width }
    : size;

const pngOrientation = (bytes: Uint8Array, view: DataView) => {
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    if (type === "eXIf") return exifOrientation(bytes, at + 8, at + 8 + length);
    if (type === "IDAT" || type === "IEND") return undefined;
    at += 12 + length;
  }
  return undefined;
};

const pngSize = (bytes: Uint8Array, view: DataView) =>
  bytes.length >= 24 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR"
    ? oriented(sized(view.getUint32(16), view.getUint32(20)), pngOrientation(bytes, view))
    : undefined;

const gifSize = (bytes: Uint8Array, view: DataView) =>
  bytes.length >= 10 && ascii(bytes, 0, 4) === "GIF8"
    ? sized(view.getUint16(6, true), view.getUint16(8, true))
    : undefined;

const bmpSize = (bytes: Uint8Array, view: DataView) =>
  bytes.length >= 26 && ascii(bytes, 0, 2) === "BM"
    ? sized(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)))
    : undefined;

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

const jpegSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let at = 2;
  let size: ImageSize | undefined;
  let orientation: number | undefined;
  while (at + 3 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) break;
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && orientation === undefined && ascii(bytes, at + 4, 6) === "Exif\0\0") {
      orientation = exifOrientation(bytes, at + 10, at + 2 + length);
    }
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame && size === undefined && at + 9 < bytes.length) {
      size = sized(view.getUint16(at + 7), view.getUint16(at + 5));
    }
    at += 2 + length;
  }
  return oriented(size, orientation);
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
  return (
    pngSize(bytes, view) ??
    jpegSize(bytes, view) ??
    gifSize(bytes, view) ??
    webpSize(bytes, view) ??
    bmpSize(bytes, view) ??
    svgSize(bytes)
  );
};

const RASTER_EXTENSIONS = new Set(["png", "apng", "jpg", "jpeg", "gif", "webp", "bmp"]);

export const isRasterImageFile = (file: { type: string; ext: string }) =>
  file.type === "image" && RASTER_EXTENSIONS.has(file.ext.toLowerCase());
