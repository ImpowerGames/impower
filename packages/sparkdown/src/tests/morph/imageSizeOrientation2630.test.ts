import { describe, expect, test } from "vitest";
import { IMAGE_HEADER_BYTES, imageSizeOf } from "../../workspace/utils/imageSize";

const tiff = (orientation: number, littleEndian = true, type = 3, count = 1) => {
  const raw = new Uint8Array(26);
  const view = new DataView(raw.buffer);
  raw.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 0x0112, littleEndian);
  view.setUint16(12, type, littleEndian);
  view.setUint32(14, count, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  return raw;
};

const subDirectoryTiff = (rootOrientation: number | undefined, subOrientation: number) => {
  const raw = new Uint8Array(64);
  const view = new DataView(raw.buffer);
  raw.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  const entries: [number, number, number][] = rootOrientation === undefined ? [] : [[0x0112, 3, rootOrientation]];
  entries.push([0x8769, 4, 40]);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, value], index) => {
    const at = 10 + index * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, 1, true);
    if (type === 3) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  view.setUint16(40, 1, true);
  view.setUint16(42, 0x0112, true);
  view.setUint16(44, 3, true);
  view.setUint32(46, 1, true);
  view.setUint16(50, subOrientation, true);
  return raw;
};

const segment = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
const exifSegment = (tiffBytes: Uint8Array) => segment(0xe1, [...Array.from("Exif").map((c) => c.charCodeAt(0)), 0, 0, ...tiffBytes]);
const sof = (width: number, height: number) => segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, ...new Array(9).fill(0)]);
const sos = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34];
const jpegOf = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat()]);

const jpeg = (width: number, height: number, exif?: Uint8Array, exifAfterFrame = false) => {
  const app1 = exif ? exifSegment(exif) : [];
  return exifAfterFrame ? jpegOf(sof(width, height), app1, sos) : jpegOf(app1, sof(width, height), sos);
};

const crc32 = (bytes: number[]) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array | number[], badCrc = false) => {
  const body = [...Array.from(type).map((c) => c.charCodeAt(0)), ...data];
  const length = body.length - 4;
  const crc = crc32(body) ^ (badCrc ? 1 : 0);
  return [
    length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...body,
    crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff,
  ];
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
const TURNED = { width: 30, height: 40 };
const UPRIGHT = { width: 40, height: 30 };

describe("a picture's size as the browser draws it, read from its header (#2630)", () => {
  test("a JPEG whose EXIF orientation turns it a quarter turn reads with its sides swapped", () => {
    expect(header(jpeg(40, 30, tiff(6)))).toEqual(TURNED);
    expect(header(jpeg(40, 30, tiff(8, false)))).toEqual(TURNED);
    expect(header(jpeg(40, 30, tiff(5)))).toEqual(TURNED);
  });

  test("a JPEG with no orientation, or one that only flips or turns it half way, keeps its frame size", () => {
    expect(header(jpeg(40, 30))).toEqual(UPRIGHT);
    expect(header(jpeg(40, 30, tiff(1)))).toEqual(UPRIGHT);
    expect(header(jpeg(40, 30, tiff(3, false)))).toEqual(UPRIGHT);
    expect(header(jpeg(40, 30, tiff(9)))).toEqual(UPRIGHT);
  });

  test("a JPEG whose Exif segment comes after its frame header, before its scan, reads its orientation too", () => {
    expect(header(jpeg(40, 30, tiff(6), true))).toEqual(TURNED);
    expect(header(jpeg(40, 30, tiff(1), true))).toEqual(UPRIGHT);
    expect(header(jpegOf(sof(40, 30), sos, exifSegment(tiff(6))))).toEqual(UPRIGHT);
  });

  test("only the first Exif segment counts, even when it holds no orientation", () => {
    expect(header(jpegOf(exifSegment(tiff(1)), exifSegment(tiff(6)), sof(40, 30), sos))).toEqual(UPRIGHT);
    expect(header(jpegOf(exifSegment(tiff(6)), exifSegment(tiff(1)), sof(40, 30), sos))).toEqual(TURNED);
    const empty = tiff(1);
    empty[8] = 0;
    expect(header(jpegOf(exifSegment(empty), exifSegment(tiff(6)), sof(40, 30), sos))).toEqual(UPRIGHT);
    const xmp = segment(0xe1, Array.from("http://ns.adobe.com/xap/1.0/").map((c) => c.charCodeAt(0)));
    expect(header(jpegOf(xmp, exifSegment(tiff(6)), sof(40, 30), sos))).toEqual(TURNED);
  });

  test("an orientation tag that is not one SHORT is ignored, as the browser ignores it", () => {
    expect(header(jpeg(40, 30, tiff(6, true, 1)))).toEqual(UPRIGHT);
    expect(header(jpeg(40, 30, tiff(6, true, 3, 0)))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [chunk("eXIf", tiff(6, true, 1))]))).toEqual(UPRIGHT);
  });

  test("an orientation in the Exif sub-directory counts when the root has none", () => {
    expect(header(jpegOf(exifSegment(subDirectoryTiff(undefined, 6)), sof(40, 30), sos))).toEqual(TURNED);
    expect(header(jpegOf(exifSegment(subDirectoryTiff(1, 6)), sof(40, 30), sos))).toEqual(UPRIGHT);
  });

  test("a JPEG broken after its frame header is read past the break, and one broken before it has no size", () => {
    const garbage = [0x12, 0x34, 0x56];
    expect(header(jpegOf(sof(40, 30), garbage, sos))).toEqual(UPRIGHT);
    expect(header(jpegOf(sof(40, 30), garbage, exifSegment(tiff(6)), sos))).toEqual(TURNED);
    expect(header(jpegOf(sof(40, 30), [0xff, 0x00, 0x12], exifSegment(tiff(6)), sos))).toEqual(TURNED);
    expect(header(jpegOf(garbage, sof(40, 30), sos))).toBeUndefined();
  });

  test("a JPEG whose bytes run out before its scan, with no Exif segment yet, has no size", () => {
    expect(header(jpegOf(sof(40, 30), [0x12, 0x34, 0x56, 0x78, 0x9a]))).toBeUndefined();
    expect(header(jpegOf(sof(40, 30), [0xff, 0xe1, 0xff, 0xff, 0x45, 0x78]))).toBeUndefined();
    const big = segment(0xe2, new Array(65500).fill(0));
    expect(header(jpegOf(sof(40, 30), big, exifSegment(tiff(6)), sos))).toBeUndefined();
    expect(header(jpegOf(exifSegment(tiff(6)), sof(40, 30), big, sos))).toEqual(TURNED);
  });

  test("a PNG reads its first eXIf orientation only before its image data, as the browser does", () => {
    const exif = chunk("eXIf", tiff(6));
    expect(header(png(40, 30, [exif]))).toEqual(TURNED);
    expect(header(png(40, 30, [], [exif]))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [chunk("eXIf", tiff(1))]))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [chunk("eXIf", tiff(1)), exif]))).toEqual(UPRIGHT);
  });

  test("a PNG eXIf chunk whose CRC is wrong is skipped, and the next good one counts", () => {
    expect(header(png(40, 30, [chunk("eXIf", tiff(6), true)]))).toEqual(UPRIGHT);
    expect(header(png(40, 30, [chunk("eXIf", tiff(6), true), chunk("eXIf", tiff(6))]))).toEqual(TURNED);
    expect(header(png(40, 30, [chunk("eXIf", tiff(6), true), chunk("eXIf", tiff(1))]))).toEqual(UPRIGHT);
  });

  test("the first valid orientation in the decoder's order counts, through the Exif sub-directory too", () => {
    const twoOrientations = (first: number, second: number) => {
      const bytes = new Uint8Array(38);
      bytes.set(tiff(first));
      bytes[8] = 2;
      bytes.set(tiff(second).slice(10, 22), 22);
      return bytes;
    };
    expect(header(jpeg(40, 30, twoOrientations(1, 6)))).toEqual(UPRIGHT);
    expect(header(jpeg(40, 30, twoOrientations(6, 1)))).toEqual(TURNED);
    expect(header(jpeg(40, 30, twoOrientations(0, 6)))).toEqual(TURNED);
    expect(header(jpegOf(exifSegment(subDirectoryTiff(0, 6)), sof(40, 30), sos))).toEqual(TURNED);
    expect(header(jpegOf(exifSegment(subDirectoryTiff(9, 6)), sof(40, 30), sos))).toEqual(TURNED);
  });

  test("a raster file whose size cannot be settled is never read as SVG text it carries", () => {
    const svgText = Array.from('<svg width="12" height="13">').map((c) => c.charCodeAt(0));
    const big = segment(0xe2, [...svgText, ...new Array(65470).fill(0)]);
    expect(header(jpegOf(sof(40, 30), big, exifSegment(tiff(6)), sos))).toBeUndefined();
    const note = chunk("tEXt", [...svgText, ...new Array(65500).fill(0)]);
    expect(header(png(40, 30, [note, chunk("eXIf", tiff(6))]))).toBeUndefined();
  });

  test("a hierarchical JPEG frame, which the browser does not decode, has no size", () => {
    for (const marker of [0xc5, 0xc6, 0xc7, 0xcd, 0xce, 0xcf]) {
      const frame = sof(40, 30);
      frame[1] = marker;
      expect(header(jpegOf(frame, sos))).toBeUndefined();
    }
  });

  test("a PNG whose image data starts past the bytes read has no size", () => {
    const note = chunk("tEXt", new Array(65500).fill(0));
    expect(header(png(40, 30, [note, chunk("eXIf", tiff(6))]))).toBeUndefined();
    expect(header(png(40, 30, [note]))).toBeUndefined();
    const cut = png(40, 30, [chunk("eXIf", [...tiff(6), ...new Array(4000).fill(0)])]).slice(0, 8 + 25 + 8 + 26);
    expect(header(cut)).toBeUndefined();
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
    const gif = (screen: [number, number], frame: [number, number, number, number]) => {
      const bytes = new Uint8Array([
        ...Array.from("GIF89a").map((c) => c.charCodeAt(0)),
        screen[0], 0, screen[1], 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff,
        0x21, 0xf9, 4, 1, 0, 0, 0, 0,
        0x2c, frame[0], 0, frame[1], 0, frame[2], 0, frame[3], 0, 0, 2, 2, 0x44, 0x01, 0, 0x3b,
      ]);
      return bytes;
    };
    expect(header(gif([1, 1], [0, 0, 2, 2]))).toEqual({ width: 2, height: 2 });
    expect(header(gif([1, 1], [1, 1, 2, 2]))).toEqual({ width: 3, height: 3 });
    expect(header(gif([4, 3], [0, 0, 2, 2]))).toEqual({ width: 4, height: 3 });
  });
});
