import { describe, expect, test } from "vitest";
import { imageSizeOf } from "../../workspace/utils/imageSize";

const tiff = (orientation: number, littleEndian: boolean) => {
  const raw = new Uint8Array(26);
  const view = new DataView(raw.buffer);
  raw.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 0x0112, littleEndian);
  view.setUint16(12, 3, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  return raw;
};

const jpeg = (width: number, height: number, exif?: Uint8Array) => {
  const app1 = exif ? [0xff, 0xe1, 0, 0, ...Array.from("Exif").map((c) => c.charCodeAt(0)), 0, 0, ...exif] : [];
  if (exif) {
    const length = app1.length - 2;
    app1[2] = length >> 8;
    app1[3] = length & 0xff;
  }
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof]);
};

const chunk = (type: string, data: Uint8Array | number[]) => {
  const bytes = [...data];
  const length = bytes.length;
  return [length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...Array.from(type).map((c) => c.charCodeAt(0)), ...bytes, 0, 0, 0, 0];
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

describe("a picture's size as the browser draws it, read from its header (#2630)", () => {
  test("a JPEG whose EXIF orientation turns it a quarter turn reads with its sides swapped", () => {
    expect(imageSizeOf(jpeg(40, 30, tiff(6, true)))).toEqual({ width: 30, height: 40 });
    expect(imageSizeOf(jpeg(40, 30, tiff(8, false)))).toEqual({ width: 30, height: 40 });
    expect(imageSizeOf(jpeg(40, 30, tiff(5, true)))).toEqual({ width: 30, height: 40 });
  });

  test("a JPEG with no orientation, or one that only flips or turns it half way, keeps its frame size", () => {
    expect(imageSizeOf(jpeg(40, 30))).toEqual({ width: 40, height: 30 });
    expect(imageSizeOf(jpeg(40, 30, tiff(1, true)))).toEqual({ width: 40, height: 30 });
    expect(imageSizeOf(jpeg(40, 30, tiff(3, false)))).toEqual({ width: 40, height: 30 });
  });

  test("a PNG whose eXIf chunk runs past the bytes read still has its orientation read", () => {
    const whole = png(40, 30, [chunk("eXIf", [...tiff(6, true), ...new Array(4000).fill(0)])]);
    const cut = whole.slice(0, 8 + 25 + 8 + 26);
    expect(imageSizeOf(cut)).toEqual({ width: 30, height: 40 });
  });

  test("a PNG reads its eXIf orientation only before its image data, as the browser does", () => {
    const exif = chunk("eXIf", tiff(6, true));
    expect(imageSizeOf(png(40, 30, [exif]))).toEqual({ width: 30, height: 40 });
    expect(imageSizeOf(png(40, 30, [], [exif]))).toEqual({ width: 40, height: 30 });
    expect(imageSizeOf(png(40, 30, [chunk("eXIf", tiff(1, true))]))).toEqual({ width: 40, height: 30 });
  });
});
