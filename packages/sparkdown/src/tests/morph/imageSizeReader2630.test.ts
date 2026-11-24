import { describe, expect, test } from "vitest";
import { IMAGE_HEADER_BYTES, imageSizeOf } from "../../workspace/utils/imageSize";

const tiff = (orientation: number) => {
  const raw = new Uint8Array(26);
  const view = new DataView(raw.buffer);
  raw.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x0112, true);
  view.setUint16(12, 3, true);
  view.setUint32(14, 1, true);
  view.setUint16(18, orientation, true);
  return raw;
};

const segment = (marker: number, data: number[] | Uint8Array) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
const exifSegment = (tiffBytes: Uint8Array) => segment(0xe1, [...Array.from("Exif").map((c) => c.charCodeAt(0)), 0, 0, ...tiffBytes]);
const sof = (width: number, height: number, marker = 0xc0) =>
  segment(marker, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, ...new Array(9).fill(0)]);
const sos = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34];
const jpegOf = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat()]);

const crc32 = (bytes: number[]) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array | number[]) => {
  const body = [...Array.from(type).map((c) => c.charCodeAt(0)), ...data];
  const length = body.length - 4;
  const crc = crc32(body);
  return [length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...body, crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
};
const png = (width: number, height: number, before: number[][], after: number[][] = []) => {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...before.flat(),
    ...chunk("IDAT", [0, 0]),
    ...after.flat(),
    ...chunk("IEND", []),
  ]);
};

const header = (bytes: Uint8Array) => imageSizeOf(bytes.subarray(0, IMAGE_HEADER_BYTES));
const UPRIGHT = { width: 40, height: 30 };

describe("a picture's size read from its header, or none where the header cannot settle it (#2630)", () => {
  test("a JPEG with no Exif segment before its scan reads its frame size", () => {
    expect(header(jpegOf(sof(40, 30), sos))).toEqual(UPRIGHT);
    const xmp = segment(0xe1, Array.from("http://ns.adobe.com/xap/1.0/").map((c) => c.charCodeAt(0)));
    expect(header(jpegOf(xmp, sof(40, 30), sos))).toEqual(UPRIGHT);
    expect(header(jpegOf(sof(40, 30), sos, exifSegment(tiff(6))))).toEqual(UPRIGHT);
  });

  test("a JPEG with an Exif segment before its scan has no size, whatever its orientation", () => {
    for (const orientation of [1, 3, 6, 8]) {
      expect(header(jpegOf(exifSegment(tiff(orientation)), sof(40, 30), sos))).toBeUndefined();
      expect(header(jpegOf(sof(40, 30), exifSegment(tiff(orientation)), sos))).toBeUndefined();
    }
    const xmp = segment(0xe1, Array.from("http://ns.adobe.com/xap/1.0/").map((c) => c.charCodeAt(0)));
    expect(header(jpegOf(xmp, exifSegment(tiff(1)), sof(40, 30), sos))).toBeUndefined();
  });

  test("a JPEG whose walk cannot reach its scan has no size", () => {
    expect(header(jpegOf(sof(40, 30), [0x12, 0x34, 0x56], sos))).toBeUndefined();
    expect(header(jpegOf([0x12, 0x34], sof(40, 30), sos))).toBeUndefined();
    expect(header(jpegOf(sof(40, 30), [0xff, 0x00, 0x12], sos))).toBeUndefined();
    expect(header(jpegOf(sof(40, 30)))).toBeUndefined();
    expect(header(jpegOf(sof(40, 30), [0xff, 0xe1, 0x00, 0x20, 0x45, 0x78]))).toBeUndefined();
    const big = segment(0xe2, new Uint8Array(65530));
    expect(header(jpegOf(sof(40, 30), big, sos))).toBeUndefined();
    expect(header(jpegOf(sof(40, 30), segment(0xe2, new Uint8Array(65400)), sos))).toEqual(UPRIGHT);
  });

  test("a hierarchical JPEG frame, which the browser does not decode, has no size", () => {
    for (const marker of [0xc5, 0xc6, 0xc7, 0xcd, 0xce, 0xcf]) {
      expect(header(jpegOf(sof(40, 30, marker), sos))).toBeUndefined();
    }
    for (const marker of [0xc1, 0xc2, 0xc3, 0xc9]) {
      expect(header(jpegOf(sof(40, 30, marker), sos))).toEqual(UPRIGHT);
    }
  });

  test("a PNG with no eXIf chunk before its image data reads its IHDR size", () => {
    expect(header(png(40, 30, []))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [chunk("tEXt", Array.from("note").map((c) => c.charCodeAt(0)))]))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [], [chunk("eXIf", tiff(6))]))).toEqual(UPRIGHT);
  });

  test("a PNG with an eXIf chunk before its image data has no size, whatever it holds", () => {
    expect(header(png(40, 30, [chunk("eXIf", tiff(1))]))).toBeUndefined();
    expect(header(png(40, 30, [chunk("eXIf", tiff(6))]))).toBeUndefined();
    const bad = chunk("eXIf", tiff(6));
    bad[bad.length - 1]! ^= 0xff;
    expect(header(png(40, 30, [bad]))).toBeUndefined();
  });

  test("a PNG whose image data starts past the bytes read has no size", () => {
    expect(header(png(40, 30, [chunk("tEXt", new Array(65500).fill(0))]))).toBeUndefined();
  });

  test("a raster file with no size is never read as SVG text it carries", () => {
    const svgText = Array.from('<svg width="12" height="13">').map((c) => c.charCodeAt(0));
    expect(header(jpegOf(sof(40, 30), segment(0xe2, svgText), exifSegment(tiff(6)), sos))).toBeUndefined();
    expect(header(png(40, 30, [chunk("tEXt", svgText), chunk("eXIf", tiff(6))]))).toBeUndefined();
  });

  test("a BMP with a 12-byte core header reads its 16-bit sides", () => {
    const bmp = new Uint8Array(14 + 12 + 40 * 30 * 3);
    const view = new DataView(bmp.buffer);
    bmp.set([0x42, 0x4d]);
    view.setUint32(10, 26, true);
    view.setUint32(14, 12, true);
    view.setUint16(18, 40, true);
    view.setUint16(20, 30, true);
    view.setUint16(22, 1, true);
    view.setUint16(24, 24, true);
    expect(header(bmp)).toEqual(UPRIGHT);
  });

  test("a GIF whose first frame reaches past its screen is as large as that frame reaches", () => {
    const gif = (screen: [number, number], frame: [number, number, number, number]) =>
      new Uint8Array([
        ...Array.from("GIF89a").map((c) => c.charCodeAt(0)),
        screen[0], 0, screen[1], 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff,
        0x21, 0xf9, 4, 1, 0, 0, 0, 0,
        0x2c, frame[0], 0, frame[1], 0, frame[2], 0, frame[3], 0, 0, 2, 2, 0x44, 0x01, 0, 0x3b,
      ]);
    expect(header(gif([1, 1], [0, 0, 2, 2]))).toEqual({ width: 2, height: 2 });
    expect(header(gif([1, 1], [1, 1, 2, 2]))).toEqual({ width: 3, height: 3 });
    expect(header(gif([4, 3], [0, 0, 2, 2]))).toEqual({ width: 4, height: 3 });
  });
});
