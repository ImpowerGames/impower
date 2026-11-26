import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TONE = new Uint8Array(readFileSync(join(__dirname, "fixtures", "tone-opus.ogg")));
export const TONE_FRAMES = 48000;
export const TONE_PRE_SKIP = 312;

export const concat = (parts: Uint8Array[]) => {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
};

const readPackets = (bytes: Uint8Array) => {
  const packets: Uint8Array[] = [];
  let partial: Uint8Array[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const segments = bytes[offset + 26]!;
    let body = offset + 27 + segments;
    for (let i = 0; i < segments; i++) {
      const length = bytes[offset + 27 + i]!;
      partial.push(bytes.subarray(body, body + length));
      body += length;
      if (length < 255) {
        packets.push(concat(partial));
        partial = [];
      }
    }
    offset = body;
  }
  return packets;
};

export const [TONE_HEAD, TONE_TAGS, ...TONE_PACKETS] = readPackets(TONE) as [
  Uint8Array,
  Uint8Array,
  ...Uint8Array[],
];

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let r = i << 24;
  for (let j = 0; j < 8; j++) {
    r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  }
  return r >>> 0;
});

export const oggPage = (
  packets: Uint8Array[],
  granule: number,
  flags: number,
  serial: number,
  sequence: number,
) => {
  const lacing = packets.flatMap((packet) => [
    ...Array<number>(Math.floor(packet.length / 255)).fill(255),
    packet.length % 255,
  ]);
  const page = concat([new Uint8Array(27 + lacing.length), ...packets]);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[5] = flags;
  view.setBigInt64(6, BigInt(granule), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  let crc = 0;
  for (const byte of page) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  }
  view.setUint32(22, crc, true);
  return page;
};

export const mux = (
  packets: Uint8Array[],
  {
    granuleOffset = 0,
    serial = 0x2265,
    head = TONE_HEAD,
    finalGranule = TONE_FRAMES + TONE_PRE_SKIP,
  } = {},
) => {
  const pages = [oggPage([head], 0, 2, serial, 0), oggPage([TONE_TAGS], 0, 0, serial, 1)];
  packets.forEach((packet, i) => {
    const last = i === packets.length - 1;
    const granule = granuleOffset + (last ? finalGranule : (i + 1) * 960);
    pages.push(oggPage([packet], granule, last ? 4 : 0, serial, pages.length));
  });
  return concat(pages);
};

export const monoHead = () => {
  const head = TONE_HEAD.slice();
  head[9] = 1;
  return head;
};
