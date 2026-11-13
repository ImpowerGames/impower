import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";
import AudioManager from "../app/managers/AudioManager";

const TONE = readFileSync(join(__dirname, "fixtures", "tone-opus.ogg"));
const TONE_FRAMES = 48000;
const TONE_PRE_SKIP = 312;

const concat = (parts: Uint8Array[]) => {
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

const [TONE_HEAD, TONE_TAGS, ...TONE_PACKETS] = readPackets(new Uint8Array(TONE)) as [
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

const oggPage = (packets: Uint8Array[], granule: number, flags: number, serial: number, sequence: number) => {
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

const mux = (
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

const monoHead = () => {
  const head = TONE_HEAD.slice();
  head[9] = 1;
  return head;
};

const surroundHead = () => {
  const head = concat([TONE_HEAD, new Uint8Array([3, 3, 0, 4, 1, 2, 3, 5])]);
  head[9] = 6;
  head[18] = 1;
  return head;
};

const selfDelimited = (packet: Uint8Array) => {
  const size = packet.length - 1;
  const first = size < 252 ? size : 252 + (size % 4);
  const length = size < 252 ? [size] : [first, (size - first) / 4];
  return concat([packet.subarray(0, 1), new Uint8Array(length), packet.subarray(1)]);
};

const surroundPackets = () =>
  TONE_PACKETS.map((packet) => concat([selfDelimited(packet), selfDelimited(packet), packet]));

class StandInBuffer {
  channels: Float32Array[];
  constructor(
    channels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get numberOfChannels() {
    return this.channels.length;
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  copyToChannel(source: Float32Array, channel: number) {
    this.channels[channel]!.set(source);
  }
}

const makeContext = (decodeAudioData: (bytes: ArrayBuffer) => Promise<unknown>) => ({
  sampleRate: 44100,
  createBuffer: (channels: number, length: number, sampleRate: number) =>
    new StandInBuffer(channels, length, sampleRate),
  decodeAudioData,
});

const opusUnsupported = () =>
  Promise.reject(new DOMException("Unable to decode audio data", "EncodingError"));

const load = (context: unknown, bytes: Uint8Array) => {
  vi.stubGlobal("fetch", async () => new Response(bytes.slice()));
  const app: any = {
    audioContext: context,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  return new AudioManager(app).decodeAudioBuffer({
    key: "tone",
    src: "https://file+.vscode-resource.vscode-cdn.net/tone-opus.ogg",
  } as any) as Promise<unknown>;
};

const crossingsPerSecond = (samples: Float32Array, sampleRate: number) => {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1]! < 0 !== samples[i]! < 0) {
      crossings++;
    }
  }
  return crossings / (samples.length / sampleRate);
};

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an Ogg Opus clip in a webview whose decoder has no Opus (#2265)", () => {
  test("decodes to the clip's audio instead of rejecting", async () => {
    const buffer = (await load(makeContext(opusUnsupported), TONE)) as StandInBuffer;

    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(48000);
    expect(buffer.length).toBe(TONE_FRAMES);
    const [left, right] = buffer.channels.map((c) => c.subarray(4800, 43200));
    expect(rms(left!)).toBeGreaterThan(0.3);
    expect(rms(right!)).toBeGreaterThan(0.3);
    expect(crossingsPerSecond(left!, 48000)).toBeCloseTo(880, -1);
    expect(crossingsPerSecond(right!, 48000)).toBeCloseTo(1320, -1);
  });

  test("keeps the browser's own decode when it succeeds", async () => {
    const native = { native: true };
    const decoded = await load(makeContext(async () => native), TONE);
    expect(decoded).toBe(native);
  });

  test("still rejects a clip that is not Ogg Opus", async () => {
    await expect(
      load(makeContext(opusUnsupported), new TextEncoder().encode("not audio")),
    ).rejects.toThrow("Unable to decode audio data");
  });

  test("trims a cropped stream whose granule positions start past zero", async () => {
    const cropped = mux(TONE_PACKETS, { granuleOffset: 48000 });
    const buffer = (await load(makeContext(opusUnsupported), cropped)) as StandInBuffer;
    expect(buffer.length).toBe(TONE_FRAMES);
  });

  test("plays every link of a chained clip", async () => {
    const chained = concat([mux(TONE_PACKETS, { serial: 1 }), mux(TONE_PACKETS, { serial: 2 })]);
    const buffer = (await load(makeContext(opusUnsupported), chained)) as StandInBuffer;
    expect(buffer.length).toBe(2 * TONE_FRAMES);
    const second = buffer.channels[1]!.subarray(TONE_FRAMES + 4800, TONE_FRAMES + 43200);
    expect(crossingsPerSecond(second, 48000)).toBeCloseTo(1320, -1);
  });

  test("puts surround channels on Web Audio's speakers", async () => {
    const buffer = (await load(
      makeContext(opusUnsupported),
      mux(surroundPackets(), { head: surroundHead() }),
    )) as StandInBuffer;
    expect(buffer.numberOfChannels).toBe(6);
    expect(buffer.length).toBe(TONE_FRAMES);
    const rate = (channel: number) =>
      crossingsPerSecond(buffer.channels[channel]!.subarray(4800, 43200), 48000);
    expect(rate(0)).toBeCloseTo(880, -1);
    expect(rate(1)).toBeCloseTo(1320, -1);
    expect(rate(2)).toBeCloseTo(880, -1);
    expect(rate(3)).toBeCloseTo(1320, -1);
  });

  test("decodes an Opus stream that follows a Skeleton metadata stream", async () => {
    const fishead = concat([new TextEncoder().encode("fishead\0"), new Uint8Array([3, 0, 0, 0])]);
    const withSkeleton = concat([oggPage([fishead], 0, 2, 7, 0), mux(TONE_PACKETS)]);
    const buffer = (await load(makeContext(opusUnsupported), withSkeleton)) as StandInBuffer;
    expect(buffer.length).toBe(TONE_FRAMES);
  });

  test("rejects a clip whose end granule leaves no samples to play", async () => {
    const empty = mux(TONE_PACKETS.slice(0, 1), { finalGranule: TONE_PRE_SKIP });
    await expect(load(makeContext(opusUnsupported), empty)).rejects.toThrow(
      "Unable to decode audio data",
    );
  });

  test("plays a mono link of a surround chain from the centre speaker only", async () => {
    const chained = concat([
      mux(TONE_PACKETS, { serial: 1, head: monoHead() }),
      mux(surroundPackets(), { serial: 2, head: surroundHead() }),
    ]);
    const buffer = (await load(makeContext(opusUnsupported), chained)) as StandInBuffer;
    expect(buffer.numberOfChannels).toBe(6);
    expect(buffer.length).toBe(2 * TONE_FRAMES);
    const monoSection = buffer.channels.map((channel) => rms(channel.subarray(4800, 43200)));
    expect(monoSection[2]).toBeGreaterThan(0.2);
    for (const speaker of [0, 1, 3, 4, 5]) {
      expect(monoSection[speaker]).toBe(0);
    }
  });
});
