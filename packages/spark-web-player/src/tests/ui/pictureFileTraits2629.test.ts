import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { dataUrlBytes, iccWiderThanSRGB, pictureFileTraits } from "../../app/morph/pictureFileTraits";
import { browserPictureLoader } from "../../app/morph/MorphPlayback";

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
const s15 = (value: number) => u32be(Math.round(value * 65536) >>> 0);

type Primaries = Record<"rXYZ" | "gXYZ" | "bXYZ", [number, number, number]>;

const SRGB: Primaries = { rXYZ: [0.4361, 0.2225, 0.0139], gXYZ: [0.3851, 0.7169, 0.0971], bXYZ: [0.1431, 0.0606, 0.7141] };
const ADOBE_RGB: Primaries = { rXYZ: [0.6097, 0.3111, 0.0195], gXYZ: [0.2053, 0.6257, 0.0609], bXYZ: [0.1492, 0.0632, 0.7446] };
const DISPLAY_P3: Primaries = { rXYZ: [0.5151, 0.2412, -0.0011], gXYZ: [0.292, 0.6922, 0.0419], bXYZ: [0.1571, 0.0666, 0.7841] };

const icc = (space: string, description: string, primaries?: Primaries) => {
  const header = [...new Array(16).fill(0), ...bytes(space), ...new Array(108).fill(0)];
  const tags: [string, Uint8Array][] = [["desc", bytes("desc", [0, 0, 0, 0], u32be(description.length + 1), description, [0])]];
  for (const [signature, xyz] of Object.entries(primaries ?? {})) tags.push([signature, bytes("XYZ ", [0, 0, 0, 0], ...xyz.map(s15))]);
  let offset = 132 + tags.length * 12;
  const table: number[] = [];
  const data: number[] = [];
  for (const [signature, body] of tags) {
    table.push(...bytes(signature), ...u32be(offset), ...u32be(body.length));
    data.push(...body);
    offset += body.length;
  }
  return bytes(header, u32be(tags.length), table, data);
};

const pngChunk = (type: string, data: Uint8Array | number[] = []) =>
  bytes(u32be(data.length), type, data instanceof Uint8Array ? [...data] : data, [0, 0, 0, 0]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = pngChunk("IHDR", new Array(13).fill(0));
const IDAT = pngChunk("IDAT", [0]);

const png = (...chunks: Uint8Array[]) => bytes(PNG_SIGNATURE, ...chunks, IDAT);

const iccp = (profile: Uint8Array) => pngChunk("iCCP", bytes("ICC Profile", [0, 0], deflateSync(profile)));

const inflate = async (data: Uint8Array) => {
  const { inflateSync } = await import("node:zlib");
  return new Uint8Array(inflateSync(data));
};

const chrm = (values: number[]) => pngChunk("cHRM", values.flatMap((value) => u32be(Math.round(value * 100000))));

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

describe("reading a layer file's traits (#2629)", () => {
  test("a still PNG has neither trait, and an APNG is animated", async () => {
    expect(await pictureFileTraits(png(IHDR))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, pngChunk("acTL", new Array(8).fill(0))))).toEqual({ animated: true, profile: false });
  });

  test("a profile counts as sRGB by its primaries, whatever its name says", () => {
    expect(iccWiderThanSRGB(icc("RGB ", "Photoshop ICC profile", SRGB))).toBe(false);
    expect(iccWiderThanSRGB(icc("RGB ", "ClayRGB-elle-V4-srgbtrc.icc", ADOBE_RGB))).toBe(true);
    expect(iccWiderThanSRGB(icc("RGB ", "sRGB-ish Display P3", DISPLAY_P3))).toBe(true);
    expect(iccWiderThanSRGB(icc("GRAY", "Gray Gamma 2.2"))).toBe(false);
    expect(iccWiderThanSRGB(icc("RGB ", "sRGB IEC61966-2.1 (table only)"))).toBe(true);
    expect(iccWiderThanSRGB(icc("CMYK", "U.S. Web Coated (SWOP) v2"))).toBe(true);
  });

  test("a PNG's embedded profile is judged by its primaries, a declared sRGB chunk wins, and an iCCP that cannot be inflated is unread", async () => {
    expect(await pictureFileTraits(png(IHDR, iccp(icc("RGB ", "ClayRGB-elle-V4-srgbtrc.icc", ADOBE_RGB))), inflate)).toEqual({ animated: false, profile: true });
    expect(await pictureFileTraits(png(IHDR, iccp(icc("RGB ", "Photoshop ICC profile", SRGB))), inflate)).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, pngChunk("sRGB", [0]), iccp(icc("RGB ", "Display P3", DISPLAY_P3))), inflate)).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, iccp(icc("RGB ", "Display P3", DISPLAY_P3))))).toEqual({ animated: false, profile: false, unread: true });
  });

  test("a PNG's cHRM chunk counts when no profile overrides it", async () => {
    expect(await pictureFileTraits(png(IHDR, chrm([0.3127, 0.329, 0.64, 0.33, 0.3, 0.6, 0.15, 0.06])))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(png(IHDR, chrm([0.3127, 0.329, 0.64, 0.33, 0.21, 0.71, 0.15, 0.06])))).toEqual({ animated: false, profile: true });
  });

  test("a GIF is animated only with more than one frame", async () => {
    expect(await pictureFileTraits(gif(1))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(gif(2))).toEqual({ animated: true, profile: false });
  });

  test("a WebP is animated by its VP8X flag, and its ICCP chunk is judged by its primaries", async () => {
    expect(await pictureFileTraits(webp(webpChunk("VP8 ", [0, 0])))).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(webp(webpChunk("VP8X", [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0])))).toEqual({ animated: true, profile: false });
    const vp8x = webpChunk("VP8X", [0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await pictureFileTraits(webp(vp8x, webpChunk("ICCP", icc("RGB ", "ClayRGB-elle-V4-srgbtrc.icc", ADOBE_RGB))))).toEqual({ animated: false, profile: true });
    expect(await pictureFileTraits(webp(vp8x, webpChunk("ICCP", icc("RGB ", "Some sRGB", SRGB))))).toEqual({ animated: false, profile: false });
  });

  test("a JPEG's ICC_PROFILE segment is judged by its primaries", async () => {
    expect(await pictureFileTraits(jpeg())).toEqual({ animated: false, profile: false });
    expect(await pictureFileTraits(jpeg(icc("RGB ", "Display P3", DISPLAY_P3)))).toEqual({ animated: false, profile: true });
    expect(await pictureFileTraits(jpeg(icc("RGB ", "sRGB built-in", SRGB)))).toEqual({ animated: false, profile: false });
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

describe("the browser picture loader (#2629)", () => {
  const documentWith = (fetch: (src: string) => Promise<unknown>) => {
    const fetched: string[] = [];
    class FakeImage {
      decoding = "";
      src = "";
      naturalWidth = 40;
      naturalHeight = 30;
      decode() {
        return Promise.resolve();
      }
    }
    const view = {
      Image: FakeImage,
      fetch: (src: string) => {
        fetched.push(src);
        return fetch(src);
      },
    };
    return { doc: { defaultView: view } as unknown as Document, fetched };
  };

  test("a file that decodes but whose bytes cannot be fetched is marked unread", async () => {
    const { doc, fetched } = documentWith(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await browserPictureLoader("https://elsewhere.example/lids.png", doc)).toMatchObject({ width: 40, height: 30, unread: true });
    expect(fetched).toEqual(["https://elsewhere.example/lids.png"]);
  });

  test("a non-OK answer is unread too", async () => {
    const { doc } = documentWith(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect(await browserPictureLoader("/lids.png", doc)).toMatchObject({ unread: true });
  });

  test("fetched bytes are read for their traits", async () => {
    const apng = png(IHDR, pngChunk("acTL", new Array(8).fill(0)));
    const { doc } = documentWith(async () => ({ ok: true, arrayBuffer: async () => apng.slice().buffer }));
    const bitmap = await browserPictureLoader("/blink.png", doc);
    expect(bitmap).toMatchObject({ animated: true, profile: false });
    expect(bitmap?.unread).toBeUndefined();
  });

  test("a data URL is read without a fetch", async () => {
    const apng = png(IHDR, pngChunk("acTL", new Array(8).fill(0)));
    const { doc, fetched } = documentWith(() => Promise.reject(new Error("no fetch expected")));
    const bitmap = await browserPictureLoader(`data:image/png;base64,${btoa(String.fromCharCode(...apng))}`, doc);
    expect(bitmap).toMatchObject({ animated: true });
    expect(fetched).toEqual([]);
  });
});
