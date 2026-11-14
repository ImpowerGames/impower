import { expect, test } from "vitest";
import AudioManager from "../../app/managers/AudioManager";
import { AssetCache } from "../../app/assets/AssetCache";
import { AudioClock } from "../../app/AudioClock";
import { flushMicrotasks } from "../../../../spark-engine/src/tests/ui/harness/uiTestHarness";

const voiceItem = (src: string) => ({ kind: "audio" as const, params: { channel: "voice", key: "audio.line", src } });
const decodedBuffer = (length: number) => ({ length, duration: length / 100, numberOfChannels: 1 }) as AudioBuffer;
const deferredCache = (maxConcurrent = 3) => {
  const pending = new Map<string, (buffer: AudioBuffer) => void>();
  const decoded: string[] = [];
  const cache = new AssetCache({
    createImage: () => { throw new Error("unexpected image"); },
    decodeAudio: (params) => {
      decoded.push(params.src!);
      return new Promise((resolve) => pending.set(params.src!, resolve));
    },
  }, { maxConcurrent, expressSlots: 0 });
  return { cache, decoded, finish: (src: string, length: number) => pending.get(src)!(decodedBuffer(length)) };
};

test("#2256: a source change while the old source loads fails its waiters and keeps only the new decode", async () => {
  const d = deferredCache();
  const old = d.cache.request([voiceItem("old.wav")], 0, "old");
  const changed = d.cache.request([voiceItem("new.wav")], 0, "new");
  expect(await old).toEqual({ loaded: [], failed: ["audio.line"], pinned: [] });
  expect(d.cache.inFlightCount).toBe(2);
  d.finish("old.wav", 200);
  await flushMicrotasks(10);
  expect(d.cache.inFlightCount).toBe(1);
  expect(d.cache.bytes).toBe(0);
  d.finish("new.wav", 500);
  expect(await changed).toEqual({ loaded: ["audio.line"], failed: [], pinned: ["audio.line"] });
  expect(d.cache.inFlightCount).toBe(0);
  expect(d.cache.bytes).toBe(2000);
  expect(d.cache.pinsOf("audio.line")).toEqual(["new"]);
  expect(d.cache.getAudio("audio.line", "old.wav")).toBeUndefined();
  d.cache.release(["old"], true);
  expect(d.cache.getAudio("audio.line", "new.wav")?.length).toBe(500);
  d.cache.dispose();
});

test("#2256: a source change while the old source is queued never decodes the old source", async () => {
  const d = deferredCache(1);
  const blocker = d.cache.request([{ kind: "audio", params: { channel: "voice", key: "audio.block", src: "block.wav" } }], 0, "block");
  const old = d.cache.request([voiceItem("old.wav")], 0, "old");
  const changed = d.cache.request([voiceItem("new.wav")], 0, "new");
  expect(await old).toEqual({ loaded: [], failed: ["audio.line"], pinned: [] });
  expect(d.cache.queuedCount).toBe(1);
  d.finish("block.wav", 100);
  await blocker;
  await flushMicrotasks(10);
  expect(d.decoded).toEqual(["block.wav", "new.wav"]);
  d.finish("new.wav", 500);
  await changed;
  expect(d.cache.inFlightCount).toBe(0);
  expect(d.cache.queuedCount).toBe(0);
  expect(d.cache.bytes).toBe(2400);
  d.cache.dispose();
});

test("#2256: a source change of a resident pinned clip drops the old pin and bytes only", async () => {
  const d = deferredCache();
  const old = d.cache.request([voiceItem("old.wav")], 0, "old");
  d.finish("old.wav", 200);
  await old;
  expect(d.cache.bytes).toBe(800);
  const changed = d.cache.request([voiceItem("new.wav")], 0, "new");
  expect(d.cache.bytes).toBe(0);
  d.finish("new.wav", 500);
  await changed;
  d.cache.release(["old"], true);
  expect(d.cache.bytes).toBe(2000);
  expect(d.cache.pinsOf("audio.line")).toEqual(["new"]);
  d.cache.dispose();
});

test("#2256: a clip whose source changed is decoded from the new source", async () => {
  const decoded: string[] = [];
  const cache = new AssetCache({
    createImage: () => { throw new Error("unexpected image"); },
    decodeAudio: async (params) => {
      decoded.push(params.src!);
      return { duration: params.src === "old.wav" ? 2 : 5, length: 1000, numberOfChannels: 1 } as AudioBuffer;
    },
  });
  const page = new AudioManager({ overlay: document.createElement("div"), assets: { cache }, audioClock: new AudioClock(0, () => 0), emit: () => {} } as any) as any;
  const bufferOf = async (src: string) => (await page.getAudioBuffer({ channel: "voice", key: "audio.line", src })).duration;
  expect(await bufferOf("old.wav")).toBe(2);
  expect(await bufferOf("old.wav")).toBe(2);
  expect(await bufferOf("new.wav")).toBe(5);
  expect(decoded).toEqual(["old.wav", "new.wav"]);
  cache.dispose();
});
