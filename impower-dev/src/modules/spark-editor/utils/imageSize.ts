export interface ImageSize {
  width: number;
  height: number;
}

export const IMAGE_HEADER_BYTES = 65536;

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const sized = (width: number, height: number): ImageSize | undefined =>
  width > 0 && height > 0 ? { width, height } : undefined;

const pngSize = (bytes: Uint8Array, view: DataView) =>
  bytes.length >= 24 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR"
    ? sized(view.getUint32(16), view.getUint32(20))
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

const jpegSize = (bytes: Uint8Array, view: DataView) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return undefined;
    }
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = view.getUint16(at + 2);
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) {
      return sized(view.getUint16(at + 7), view.getUint16(at + 5));
    }
    at += 2 + length;
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
  return (
    pngSize(bytes, view) ??
    jpegSize(bytes, view) ??
    gifSize(bytes, view) ??
    webpSize(bytes, view) ??
    bmpSize(bytes, view) ??
    svgSize(bytes)
  );
};

export type TileShapeName = "portrait" | "landscape";

export const majorityShape = (sizes: readonly (ImageSize | undefined)[]): TileShapeName => {
  const known = sizes.filter((size): size is ImageSize => !!size);
  const tall = known.filter((size) => size.height > size.width).length;
  return tall * 2 > known.length ? "portrait" : "landscape";
};
