import { describe, expect, test } from "vitest";
import { pictureFileComplete } from "../../app/morph/pictureFileTraits";

const base64 = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));

const PNG = base64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
const PNG_CUT_IN_IDAT = base64("iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAPUlEQVRYR+3QMQ0AMAzAsJY/6A2Enx4=");
const GIF = base64("R0lGODlhEAAQAIAAAP///wAAACH5BAAAAAAALAAAAAAQABAAAAIOhI+py+0Po5y02ouzPgUAOw==");
const WEBP = base64("UklGRkwAAABXRUJQVlA4IEAAAABwAwCdASog/////////////yIhKAgAgA2JZQDKLoB+AABBlBAA/vCbQ//ILlhdcjX/8gP+QH/ID/+PfYwoMAAA");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x03, 0x00, 0xff, 0xda, 0x00, 0x02, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd9]);

describe("a layer file whose bytes end before the image does is incomplete (#2631)", () => {
  test("a PNG is complete only when its chunks reach IEND after image data", () => {
    expect(pictureFileComplete(PNG)).toBe(true);
    expect(pictureFileComplete(PNG.subarray(0, PNG.length - 12))).toBe(false);
    expect(pictureFileComplete(PNG.subarray(0, 40))).toBe(false);
    expect(pictureFileComplete(PNG_CUT_IN_IDAT)).toBe(false);
  });

  test("a GIF needs its trailer, a WebP its whole RIFF length and a JPEG an end marker after its scan", () => {
    expect(pictureFileComplete(GIF)).toBe(true);
    expect(pictureFileComplete(GIF.subarray(0, GIF.length - 1))).toBe(false);
    expect(pictureFileComplete(WEBP)).toBe(true);
    expect(pictureFileComplete(WEBP.subarray(0, WEBP.length - 10))).toBe(false);
    expect(pictureFileComplete(JPEG)).toBe(true);
    expect(pictureFileComplete(JPEG.subarray(0, JPEG.length - 2))).toBe(false);
    expect(pictureFileComplete(JPEG.subarray(0, 7))).toBe(false);
  });

  test("a format it does not read, such as SVG, is not judged", () => {
    expect(pictureFileComplete(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true);
  });
});
