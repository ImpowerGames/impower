export interface PictureFileTraits {
  animated: boolean;
  profile: boolean;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array | undefined>;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + length)));

const u32be = (bytes: Uint8Array, at: number) =>
  at + 4 <= bytes.length ? ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0 : 0;

const u32le = (bytes: Uint8Array, at: number) =>
  at + 4 <= bytes.length ? (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0 : 0;

const SRGB_NAME = /srgb|61966-2/i;

export function iccDescription(profile: Uint8Array): string | undefined {
  const count = u32be(profile, 128);
  for (let i = 0; i < count && 132 + i * 12 + 12 <= profile.length; i++) {
    const entry = 132 + i * 12;
    if (ascii(profile, entry, 4) !== "desc") continue;
    const at = u32be(profile, entry + 4);
    const type = ascii(profile, at, 4);
    if (type === "desc") {
      const length = u32be(profile, at + 8);
      return ascii(profile, at + 12, Math.max(0, length - 1));
    }
    if (type === "mluc") {
      const records = u32be(profile, at + 8);
      if (records === 0) return undefined;
      const length = u32be(profile, at + 20);
      const offset = u32be(profile, at + 24);
      let text = "";
      for (let k = 0; k + 1 < length && at + offset + k + 1 < profile.length; k += 2) {
        text += String.fromCharCode((profile[at + offset + k]! << 8) | profile[at + offset + k + 1]!);
      }
      return text;
    }
    return undefined;
  }
  return undefined;
}

const isOtherProfile = (profile: Uint8Array | undefined): boolean => {
  if (!profile) return false;
  const description = iccDescription(profile);
  return description !== undefined && !SRGB_NAME.test(description);
};

async function pngTraits(bytes: Uint8Array, inflate: Inflate | undefined): Promise<PictureFileTraits> {
  const traits: PictureFileTraits = { animated: false, profile: false };
  let srgb = false;
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = u32be(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "acTL") traits.animated = true;
    if (type === "sRGB") srgb = true;
    if (type === "iCCP" && inflate) {
      const nul = data.indexOf(0);
      if (nul >= 0) traits.profile = isOtherProfile(await inflate(data.subarray(nul + 2)));
    }
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + length;
  }
  return srgb ? { ...traits, profile: false } : traits;
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
    if (type === "ICCP") traits.profile = isOtherProfile(data);
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
  return { animated: false, profile: isOtherProfile(profile) };
}

export async function pictureFileTraits(bytes: Uint8Array, inflate?: Inflate): Promise<PictureFileTraits> {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngTraits(bytes, inflate);
  if (ascii(bytes, 0, 4) === "GIF8") return gifTraits(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpTraits(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegTraits(bytes);
  if (ascii(bytes, 4, 4) === "ftyp" && ascii(bytes, 8, 4) === "avis") return { animated: true, profile: false };
  return { animated: false, profile: false };
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
