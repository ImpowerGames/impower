import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";

const TONE = new Uint8Array(readFileSync(join(__dirname, "fixtures", "tone-opus.ogg")));
const TONE_FRAMES = 48000;
const TONE_PRE_SKIP = 312;
const MAX_STEP_SAMPLES = 1 << 18;

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

const [TONE_HEAD, TONE_TAGS, ...TONE_PACKETS] = readPackets(TONE) as [
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

const mux = (packets: Uint8Array[], { serial = 0x2815, head = TONE_HEAD } = {}) => {
  const finalGranule = (packets.length / TONE_PACKETS.length) * TONE_FRAMES + TONE_PRE_SKIP;
  const pages = [oggPage([head], 0, 2, serial, 0), oggPage([TONE_TAGS], 0, 0, serial, 1)];
  packets.forEach((packet, i) => {
    const last = i === packets.length - 1;
    pages.push(oggPage([packet], last ? finalGranule : (i + 1) * 960, last ? 4 : 0, serial, pages.length));
  });
  return concat(pages);
};

const monoHead = () => {
  const head = TONE_HEAD.slice();
  head[9] = 1;
  return head;
};

const gainHead = (gain: number) => {
  const head = TONE_HEAD.slice();
  new DataView(head.buffer).setInt16(16, gain, true);
  return head;
};

interface Copy {
  channel: number;
  start: number;
  length: number;
  step: number;
}

const clock = { step: 0, copies: [] as Copy[] };

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
  copyToChannel(source: Float32Array, channel: number, start = 0) {
    clock.copies.push({ channel, start, length: source.length, step: clock.step });
    this.channels[channel]!.set(source, start);
  }
}

const load = async (bytes: Uint8Array) => {
  const { default: AudioManager } = await import("../app/managers/AudioManager");
  vi.stubGlobal("fetch", async () => new Response(bytes.slice()));
  const context = {
    sampleRate: 48000,
    createBuffer: (channels: number, length: number, sampleRate: number) =>
      new StandInBuffer(channels, length, sampleRate),
    decodeAudioData: () =>
      Promise.reject(new DOMException("Unable to decode audio data", "EncodingError")),
  };
  const app: any = { audioContext: context, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  return (await new AudioManager(app).decodeAudioBuffer({ key: "clip", src: "clip" } as any)) as unknown as StandInBuffer;
};

const fingerprint = (buffer: StandInBuffer) => ({
  sampleRate: buffer.sampleRate,
  length: buffer.length,
  channels: buffer.channels.map((channel) =>
    createHash("sha256").update(new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength)).digest("hex"),
  ),
});

beforeEach(() => {
  clock.step = 0;
  clock.copies = [];
  vi.stubGlobal("scheduler", {
    yield: async () => {
      clock.step++;
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Opus fallback's copy into the AudioBuffer (#2815)", () => {
  test("produces the same samples as before for mono, stereo, chained and gained clips", async () => {
    const fingerprints = {
      mono: fingerprint(await load(mux(TONE_PACKETS, { head: monoHead() }))),
      stereo: fingerprint(await load(TONE)),
      chained: fingerprint(
        await load(concat([mux(TONE_PACKETS, { serial: 1, head: monoHead() }), mux(TONE_PACKETS, { serial: 2 })])),
      ),
      gained: fingerprint(await load(mux(TONE_PACKETS, { head: gainHead(-6 * 256) }))),
    };
    expect(fingerprints).toEqual({
      mono: {
        sampleRate: 48000,
        length: 48000,
        channels: ["ec809db2d0acd43e73aacdd13821200f27b13762c31068dae9880c832ccc2b1a"],
      },
      stereo: {
        sampleRate: 48000,
        length: 48000,
        channels: [
          "c08d9e8277c97100d742b8b59c6349e3febacb0d8c72974aa4dc6631fd28ac4c",
          "59e5dc8b6361f310bcdbc2ede0b9d943870ccab39c6e29d72eca6ef4d967251a",
        ],
      },
      chained: {
        sampleRate: 48000,
        length: 96000,
        channels: [
          "21297dde9db59b035b19052ba5d5d3deebdc170395183a0e2663525668d542bd",
          "898acc31a3e770a6723abfee1909de3090d0f05139d04fc8982ccd8305115474",
        ],
      },
      gained: {
        sampleRate: 48000,
        length: 48000,
        channels: [
          "bb323bc73ef313c32c90a4647fa80adb7c6c597ff83a4ced36b80dd5b1d740ba",
          "884f2b9a25f6c0c5d9be8b3b010c8dee914a64732c999f8b2ddfafd1bb7252af",
        ],
      },
    });
  });

  test.each([
    ["scheduler.yield", () => undefined],
    [
      "a message task where scheduler.yield is missing",
      () => {
        vi.stubGlobal("scheduler", undefined);
        vi.stubGlobal(
          "MessageChannel",
          class {
            port1 = { onmessage: null as null | (() => void), close: () => undefined };
            port2 = {
              postMessage: () =>
                setImmediate(() => {
                  clock.step++;
                  this.port1.onmessage?.();
                }),
            };
          },
        );
      },
    ],
  ])("copies a three-minute stereo clip in bounded steps across tasks, yielding with %s", async (_, yielding) => {
    yielding();
    const minutes = Array.from({ length: 180 }, () => TONE_PACKETS).flat();
    const buffer = await load(mux(minutes));
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(180 * TONE_FRAMES);
    const perStep = new Map<number, number>();
    for (const copy of clock.copies) {
      perStep.set(copy.step, (perStep.get(copy.step) ?? 0) + copy.length);
    }
    expect(Math.max(...perStep.values())).toBeLessThanOrEqual(MAX_STEP_SAMPLES);
    expect(perStep.size).toBeGreaterThanOrEqual(Math.ceil((2 * buffer.length) / MAX_STEP_SAMPLES));
    for (let channel = 0; channel < 2; channel++) {
      const covered = clock.copies
        .filter((copy) => copy.channel === channel)
        .sort((a, b) => a.start - b.start)
        .reduce((end, copy) => (copy.start === end ? end + copy.length : -1), 0);
      expect(covered).toBe(buffer.length);
    }
  }, 60_000);
});
