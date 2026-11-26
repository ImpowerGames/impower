import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";
import AudioManager from "../app/managers/AudioManager";
import {
  concat,
  monoHead,
  mux,
  oggPage,
  TONE,
  TONE_FRAMES,
  TONE_HEAD,
  TONE_PACKETS,
  TONE_PRE_SKIP,
  TONE_TAGS,
} from "./oggOpusFixture";

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

  test("ignores the tail of a packet cut off at the start of a joined stream", async () => {
    const [first, ...rest] = TONE_PACKETS as [Uint8Array, ...Uint8Array[]];
    expect(first.length).toBeGreaterThan(255);
    const finalGranule = TONE_FRAMES + TONE_PRE_SKIP;
    const joined = (withTail: boolean) =>
      concat([
        oggPage([TONE_HEAD], 0, 2, 0x2265, 0),
        oggPage([TONE_TAGS], 0, 0, 0x2265, 1),
        ...rest.map((packet, i) => {
          const last = i === rest.length - 1;
          const tail = withTail && i === 0;
          return oggPage(
            tail ? [first.subarray(255), packet] : [packet],
            last ? finalGranule : (i + 2) * 960,
            last ? 4 : tail ? 1 : 0,
            0x2265,
            i + 2,
          );
        }),
      ]);
    const cropped = (await load(makeContext(opusUnsupported), joined(false))) as StandInBuffer;
    const withTail = (await load(makeContext(opusUnsupported), joined(true))) as StandInBuffer;
    expect(cropped.length).toBe(finalGranule - 960 - TONE_PRE_SKIP);
    expect(withTail.length).toBe(cropped.length);
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
