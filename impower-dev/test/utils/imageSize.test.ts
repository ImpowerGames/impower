import { describe, expect, it } from "vitest";
import { imageSizeOf, majorityShape } from "../../src/modules/spark-editor/utils/imageSize";

const bytes = (length: number, write: (view: DataView, raw: Uint8Array) => void) => {
  const raw = new Uint8Array(length);
  write(new DataView(raw.buffer), raw);
  return raw;
};
const text = (raw: Uint8Array, at: number, value: string) => {
  for (let i = 0; i < value.length; i += 1) raw[at + i] = value.charCodeAt(i);
};

describe("reading a picture's size from its header", () => {
  it("reads PNG, GIF and BMP", () => {
    const png = bytes(24, (view, raw) => {
      raw.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      text(raw, 12, "IHDR");
      view.setUint32(16, 300);
      view.setUint32(20, 400);
    });
    const gif = bytes(10, (view, raw) => {
      text(raw, 0, "GIF89a");
      view.setUint16(6, 640, true);
      view.setUint16(8, 400, true);
    });
    const bmp = bytes(26, (view, raw) => {
      text(raw, 0, "BM");
      view.setInt32(18, 120, true);
      view.setInt32(22, -80, true);
    });
    expect([imageSizeOf(png), imageSizeOf(gif), imageSizeOf(bmp)]).toEqual([
      { width: 300, height: 400 },
      { width: 640, height: 400 },
      { width: 120, height: 80 },
    ]);
  });

  it("reads a JPEG's frame header past the segments before it", () => {
    const jpeg = bytes(40, (view, raw) => {
      raw.set([0xff, 0xd8, 0xff, 0xe0]);
      view.setUint16(4, 16);
      raw.set([0xff, 0xc0], 20);
      view.setUint16(22, 17);
      raw[24] = 8;
      view.setUint16(25, 900);
      view.setUint16(27, 600);
    });
    expect(imageSizeOf(jpeg)).toEqual({ width: 600, height: 900 });
  });

  it("reads lossy, lossless and extended WebP", () => {
    const riff = (chunk: string, write: (view: DataView, raw: Uint8Array) => void) =>
      bytes(32, (view, raw) => {
        text(raw, 0, "RIFF");
        text(raw, 8, "WEBP");
        text(raw, 12, chunk);
        write(view, raw);
      });
    const lossy = riff("VP8 ", (view) => {
      view.setUint16(26, 1280, true);
      view.setUint16(28, 720, true);
    });
    const lossless = riff("VP8L", (view) => {
      view.setUint32(21, (99 & 0x3fff) | ((199 & 0x3fff) << 14), true);
    });
    const extended = riff("VP8X", (_view, raw) => {
      raw.set([0xff, 0x01, 0x00], 24);
      raw.set([0x3f, 0x00, 0x00], 27);
    });
    expect([imageSizeOf(lossy), imageSizeOf(lossless), imageSizeOf(extended)]).toEqual([
      { width: 1280, height: 720 },
      { width: 100, height: 200 },
      { width: 512, height: 64 },
    ]);
  });

  it("reads an SVG from its width and height, or else its viewBox", () => {
    const svg = (root: string) =>
      new TextEncoder().encode(`<?xml version="1.0"?>\n<!-- art -->\n${root}<rect/></svg>`);
    expect(imageSizeOf(svg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200px">'))).toEqual({
      width: 100,
      height: 200,
    });
    expect(imageSizeOf(svg('<svg width="100%" viewBox="0 0 300,150">'))).toEqual({ width: 300, height: 150 });
    expect(imageSizeOf(svg("<svg height='12.5' width='40'>"))).toEqual({ width: 40, height: 12.5 });
    expect(imageSizeOf(svg("<svg width='10em'>"))).toBeUndefined();
  });

  it("knows nothing of a file that is not a picture or is cut short", () => {
    expect(imageSizeOf(new TextEncoder().encode("not a png"))).toBeUndefined();
    expect(imageSizeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
  });
});

describe("the shape most pictures share", () => {
  it("is portrait only when more than half of the known pictures are taller than wide", () => {
    const tall = { width: 300, height: 400 };
    const wide = { width: 640, height: 400 };
    expect(majorityShape([tall, tall, wide])).toBe("portrait");
    expect(majorityShape([tall, wide])).toBe("landscape");
    expect(majorityShape([tall, undefined, undefined])).toBe("portrait");
    expect(majorityShape([])).toBe("landscape");
  });
});
