import { describe, expect, test } from "vitest";
import { dataUrlBytes, iccDescription, pictureFileTraits } from "../../app/morph/pictureFileTraits";

const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const c of part) out.push(c.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out);
};

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

const icc = (description: string) => {
  const header = new Array(128).fill(0);
  const text = bytes("desc", [0, 0, 0, 0], u32be(description.length + 1), description, [0]);
  return bytes(header, u32be(1), "desc", u32be(144), u32be(text.length), text);
};

const pngChunk = (type: string, data: Uint8Array | number[] = []) =>
  bytes(u32be(data.length), type, data instanceof Uint8Array ? [...data] : data, [0, 0, 0, 0]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = pngChunk("IHDR", new Array(13).fill(0));
const IDAT = pngChunk("IDAT", [0]);

const png = (...chunks: Uint8Array[]) => bytes(PNG_SIGNATURE, ...chunks, IDAT);

const gif = (frames: number) => {
  const frame = bytes([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 1, 0, 0]);
  return bytes("GIF89a", [1, 0, 1, 0, 0, 0, 0], ...Array.from({ length: frames }, () => frame), [0x3b]);
};

const webp = (...chunks: Uint8Array[]) => {
  const body = bytes("WEBP", ...chunks);
  return bytes("RIFF", u32le(body.length), body);
};
const webpChunk = (type: string, data: number[] | Uint8Array) => {
  const list = [...data];
  return bytes(type, u32le(list.length), list, list.length & 1 ? [0] : []);
};

const jpeg = (profile?: Uint8Array) => {
  const app2 = profile ? bytes([0xff, 0xe2], [(profile.length + 16) >> 8, (profile.length + 16) & 255], "ICC_PROFILE", [0, 1, 1], profile) : bytes();
  return bytes([0xff, 0xd8], app2, [0xff, 0xda, 0, 2]);
};

const inflateTo = (profile: Uint8Array) => async () => profile;

describe("reading a layer file's traits (#2629)", () => {
  test("a still PNG has neither trait, and an APNG is animated", async () => {
    expect(await pictureFileTraits(png(IHDR))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, pngChunk("acTL", new Array(8).fill(0))))).toEqual({ animated: true, profile: false });
  });

  test("a PNG's embedded profile counts unless it is sRGB or the file declares sRGB", async () => {
    const iccp = pngChunk("iCCP", bytes("ICC Profile", [0, 0], [1, 2, 3]));
    expect(await pictureFileTraits(png(IHDR, iccp), inflateTo(icc("Display P3")))).toEqual({ animated: false, profile: true });
    expect(await pictureFileTraits(png(IHDR, iccp), inflateTo(icc("sRGB IEC61966-2.1")))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, pngChunk("sRGB", [0]), iccp), inflateTo(icc("Display P3")))).toEqual({ animated: false, profile: false });
  });

  test("a GIF is animated only with more than one frame", async () => {
    expect(await pictureFileTraits(gif(1))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(gif(2))).toEqual({ animated: true, profile: false });
  });

  test("a WebP is animated by its VP8X flag, and its ICCP chunk is read", async () => {
    expect(await pictureFileTraits(webp(webpChunk("VP8 ", [0, 0])))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(webp(webpChunk("VP8X", [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0])))).toEqual({ animated: true, profile: false });
    expect(await pictureFileTraits(webp(webpChunk("VP8X", [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0]), webpChunk("ICCP", icc("Adobe RGB (1998)"))))).toEqual({
      animated: false,
      profile: true,
    });
  });

  test("a JPEG's ICC_PROFILE segment is read", async () => {
    expect(await pictureFileTraits(jpeg())).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(jpeg(icc("Display P3")))).toEqual({ animated: false, profile: true });
    expect(await pictureFileTraits(jpeg(icc("sRGB built-in")))).toEqual({ animated: false, profile: false });
  });

  test("an ICC description is read from a desc tag", () => {
    expect(iccDescription(icc("Display P3"))).toBe("Display P3");
  });

  test("a data URL is read in place, base64 or percent-encoded, so an APNG layer given as one is still found animated", async () => {
    const apng = png(IHDR, pngChunk("acTL", new Array(8).fill(0)));
    const base64 = `data:image/png;base64,${btoa(String.fromCharCode(...apng))}`;
    expect(await pictureFileTraits(dataUrlBytes(base64)!)).toEqual({ animated: true, profile: false });
    expect(dataUrlBytes("data:image/svg+xml,%3Csvg%2F%3E")).toEqual(new TextEncoder().encode("<svg/>"));
    expect(dataUrlBytes("data:image/png;base64,%%%")).toBeUndefined();
    expect(dataUrlBytes("/not-a-data-url.png")).toBeUndefined();
  });
});
