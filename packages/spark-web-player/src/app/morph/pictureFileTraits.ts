export interface PictureFileTraits {
  animated: boolean;
  profile: boolean;
  unread?: true;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array | undefined>;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + length)));

const u32be = (bytes: Uint8Array, at: number) =>
  at + 4 <= bytes.length ? ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0 : 0;

const u32le = (bytes: Uint8Array, at: number) =>
  at + 4 <= bytes.length ? (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0 : 0;

const SRGB_PRIMARIES_D50: Record<string, readonly [number, number, number]> = {
  rXYZ: [0.4361, 0.2225, 0.0139],
  gXYZ: [0.3851, 0.7169, 0.0971],
  bXYZ: [0.1431, 0.0606, 0.7141],
};

const SRGB_CHROMATICITIES = [0.3127, 0.329, 0.64, 0.33, 0.3, 0.6, 0.15, 0.06];

const PRIMARY_TOLERANCE = 0.01;

const s15Fixed16 = (bytes: Uint8Array, at: number) => (u32be(bytes, at) | 0) / 65536;

function iccXYZ(profile: Uint8Array, signature: string): [number, number, number] | undefined {
  const count = u32be(profile, 128);
  for (let i = 0; i < count && 132 + i * 12 + 12 <= profile.length; i++) {
    const entry = 132 + i * 12;
    if (ascii(profile, entry, 4) !== signature) continue;
    const at = u32be(profile, entry + 4);
    if (ascii(profile, at, 4) !== "XYZ " || at + 20 > profile.length) return undefined;
    return [s15Fixed16(profile, at + 8), s15Fixed16(profile, at + 12), s15Fixed16(profile, at + 16)];
  }
  return undefined;
}

export function iccWiderThanSRGB(profile: Uint8Array): boolean {
  const space = ascii(profile, 16, 4);
  if (space === "GRAY") return false;
  if (space !== "RGB ") return true;
  return Object.entries(SRGB_PRIMARIES_D50).some(([signature, expected]) => {
    const primary = iccXYZ(profile, signature);
    return !primary || primary.some((value, k) => Math.abs(value - expected[k]!) > PRIMARY_TOLERANCE);
  });
}

const chromaticitiesWiderThanSRGB = (data: Uint8Array) =>
  data.length < 32 || SRGB_CHROMATICITIES.some((expected, k) => Math.abs(u32be(data, k * 4) / 100000 - expected) > PRIMARY_TOLERANCE);

async function pngTraits(bytes: Uint8Array, inflate: Inflate | undefined): Promise<PictureFileTraits> {
  let animated = false;
  let srgb = false;
  let icc: Uint8Array | undefined | null = null;
  let chromaticities: Uint8Array | undefined;
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = u32be(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "acTL") animated = true;
    if (type === "sRGB") srgb = true;
    if (type === "cHRM") chromaticities = data;
    if (type === "iCCP") {
      const nul = data.indexOf(0);
      icc = nul >= 0 && inflate ? await inflate(data.subarray(nul + 2)) : undefined;
    }
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + length;
  }
  if (srgb) return { animated, profile: false };
  if (icc === undefined) return { animated, profile: false, unread: true };
  if (icc) return { animated, profile: iccWiderThanSRGB(icc) };
  return { animated, profile: chromaticities ? chromaticitiesWiderThanSRGB(chromaticities) : false };
}

function gifTraits(bytes: Uint8Array): PictureFileTraits {
  let at = 13;
  const flags = bytes[10] ?? 0;
  if (flags & 0x80) at += 3 * (1 << ((flags & 7) + 1));
  const skipBlocks = () => {
    while (at < bytes.length) {
      const size = bytes[at]!;
      at += 1 + size;
      if (size === 0) return;
    }
  };
  let frames = 0;
  while (at < bytes.length) {
    const marker = bytes[at]!;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      at += 2;
      skipBlocks();
      continue;
    }
    if (marker !== 0x2c) break;
    frames += 1;
    if (frames > 1) return { animated: true, profile: false };
    const local = bytes[at + 9] ?? 0;
    at += 10;
    if (local & 0x80) at += 3 * (1 << ((local & 7) + 1));
    at += 1;
    skipBlocks();
  }
  return { animated: false, profile: false };
}

function webpTraits(bytes: Uint8Array): PictureFileTraits {
  const traits: PictureFileTraits = { animated: false, profile: false };
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = u32le(bytes, at + 4);
    const data = bytes.subarray(at + 8, at + 8 + size);
    if (type === "VP8X" && ((data[0] ?? 0) & 0x02)) traits.animated = true;
    if (type === "ANIM" || type === "ANMF") traits.animated = true;
    if (type === "ICCP") traits.profile = iccWiderThanSRGB(data);
    at += 8 + size + (size & 1);
  }
  return traits;
}

function jpegTraits(bytes: Uint8Array): PictureFileTraits {
  const chunks: Uint8Array[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (marker === 0xe2 && ascii(bytes, at + 4, 12) === "ICC_PROFILE\u0000") {
      chunks.push(bytes.subarray(at + 18, at + 2 + length));
    }
    at += 2 + length;
  }
  if (!chunks.length) return { animated: false, profile: false };
  const profile = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    profile.set(chunk, offset);
    offset += chunk.length;
  }
  return { animated: false, profile: iccWiderThanSRGB(profile) };
}

export async function pictureFileTraits(bytes: Uint8Array, inflate?: Inflate): Promise<PictureFileTraits> {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngTraits(bytes, inflate);
  if (ascii(bytes, 0, 4) === "GIF8") return gifTraits(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpTraits(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegTraits(bytes);
  if (ascii(bytes, 4, 4) === "ftyp" && ascii(bytes, 8, 4) === "avis") return { animated: true, profile: false };
  return { animated: false, profile: false };
}

function pngComplete(bytes: Uint8Array): boolean {
  let at = 8;
  let data = false;
  while (at + 12 <= bytes.length) {
    const end = at + 12 + u32be(bytes, at);
    if (end > bytes.length) return false;
    const type = ascii(bytes, at + 4, 4);
    if (type === "IDAT") data = true;
    if (type === "IEND") return data;
    at = end;
  }
  return false;
}

const lastMarker = (bytes: Uint8Array, marker: number) => {
  for (let at = bytes.length - 2; at >= 0; at--) if (bytes[at] === 0xff && bytes[at + 1] === marker) return at;
  return -1;
};

export function pictureFileComplete(bytes: Uint8Array): boolean {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngComplete(bytes);
  if (ascii(bytes, 0, 4) === "GIF8") return bytes[bytes.length - 1] === 0x3b;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return 8 + u32le(bytes, 4) <= bytes.length;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const scan = lastMarker(bytes, 0xda);
    return scan >= 0 && lastMarker(bytes, 0xd9) > scan;
  }
  return true;
}

function percentDecodedBytes(text: string): Uint8Array {
  const out: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < text.length; i++) {
    const escaped = text[i] === "%" ? /^[0-9a-f]{2}$/i.exec(text.slice(i + 1, i + 3)) : null;
    if (escaped) {
      out.push(Number.parseInt(escaped[0], 16));
      i += 2;
      continue;
    }
    const code = text.codePointAt(i)!;
    if (code < 0x80) out.push(code);
    else {
      const char = String.fromCodePoint(code);
      out.push(...encoder.encode(char));
      i += char.length - 1;
    }
  }
  return Uint8Array.from(out);
}

export function dataUrlBytes(src: string): Uint8Array | undefined {
  const match = /^data:([^,]*),(.*)$/is.exec(src);
  if (!match) return undefined;
  const payload = percentDecodedBytes(match[2]!);
  if (!/;base64$/i.test(match[1]!)) return payload;
  let text = "";
  for (let at = 0; at < payload.length; at += 0x8000) text += String.fromCharCode(...payload.subarray(at, at + 0x8000));
  try {
    const binary = atob(text.replace(/[\t\n\f\r ]+/g, ""));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export const streamInflate =
  (scope: { DecompressionStream?: typeof DecompressionStream; Response?: typeof Response }): Inflate | undefined => {
    const Decompression = scope.DecompressionStream;
    const Reply = scope.Response;
    if (!Decompression || !Reply) return undefined;
    return async (data) => {
      try {
        const stream = new Reply(data as BodyInit).body!.pipeThrough(new Decompression("deflate"));
        return new Uint8Array(await new Reply(stream).arrayBuffer());
      } catch {
        return undefined;
      }
    };
  };
