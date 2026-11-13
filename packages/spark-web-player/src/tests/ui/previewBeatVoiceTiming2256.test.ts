import { afterEach, expect, test, vi } from "vitest";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import AudioManager from "../../app/managers/AudioManager";
import { AssetCache } from "../../app/assets/AssetCache";
import { AudioClock } from "../../app/AudioClock";
import { silentVoice, voiceSpans } from "../../../../spark-engine/src/game/core/classes/presenters/voice";
import { compileUI, createHarness, flattenMessages, flushMicrotasks, MAIN_URI } from "../../../../spark-engine/src/tests/ui/harness/uiTestHarness";

afterEach(() => vi.useRealTimers());

const VOICES = `define mia as character with
  name = "MIA"
end
define long as audio with
  src = "long.wav"
end
define short as audio with
  src = "short.wav"
end
define tail as audio with
  src = "tail.wav"
end
`;
const LENGTHS: Record<string, number> = { "audio.long": 10, "audio.short": 1, "audio.tail": 1 };

class Param {
  value = 1;
  cancelScheduledValues() {}
  setTargetAtTime() {}
  setValueAtTime() {}
}

const realPlayers = () => {
  const heard: { from: number; to?: number }[] = [];
  const context: any = {
    state: "running",
    get currentTime() { return Date.now() / 1000; },
    destination: {},
    createGain: () => ({ gain: new Param(), connect() {}, disconnect() {} }),
    createBufferSource: () => {
      let naturalEnd: ReturnType<typeof setTimeout> | undefined;
      const listeners: (() => void)[] = [];
      const source: any = {
        detune: new Param(),
        playbackRate: new Param(),
        addEventListener: (_: string, listener: () => void) => listeners.push(listener),
        removeEventListener() {},
        connect() {},
        disconnect() {},
        start(when: number) {
          naturalEnd = setTimeout(() => {
            for (const listener of listeners.splice(0)) listener();
          }, (when + source.buffer.duration - context.currentTime) * 1000);
        },
        stop() { if (naturalEnd !== undefined) clearTimeout(naturalEnd); },
      };
      return source;
    },
  };
  const page = new AudioManager({ overlay: document.createElement("div"), audioContext: context, audioClock: { toContextTime: (time: number) => time }, emit: () => {} } as any) as any;
  const channel = new Map<string, AudioPlayer>();
  for (const [key, duration] of Object.entries(LENGTHS)) {
    const player = new AudioPlayer({ duration } as AudioBuffer, context);
    const start = player.start.bind(player);
    player.start = (...args: Parameters<AudioPlayer["start"]>) => {
      const instance = start(...args);
      const record: { from: number; to?: number } = { from: instance.startedAt! };
      heard.push(record);
      void instance.ended.then(() => { record.to = context.currentTime; });
      return instance;
    };
    channel.set(key, player);
  }
  page._audioChannels.set("voice", channel);
  return { page, heard };
};

const inMs = (spans: number[][]) => spans.map((span) => span.map((time) => Math.round(time * 1000)));

const silentAndHeard = async (line: string) => {
  const h = createHarness(`${VOICES}scene start\n  MIA: ${line} Hi.\nend\n`);
  await h.ready;
  expect(h.errors).toEqual([]);
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat()!;
  expect(beat.audio?.["voice"]?.length).toBeGreaterThan(1);
  h.game.markPreviewing(1);
  const silent = voiceSpans(silentVoice(h.game, beat)!, (clip) => LENGTHS[clip.key]);
  h.reset();
  const id = h.game.module.audio.schedule("voice", beat.audio!["voice"]!);
  await flushMicrotasks(20);
  h.game.module.audio.trigger(id, 0);
  await flushMicrotasks(10);
  const request = flattenMessages(h.messages).find((message) => message.method === "audio/update" && message.params.channel === "voice");
  h.game.destroy();
  expect(request).toBeDefined();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const live = realPlayers();
  const played = live.page.updateAudioPlayers(request.params);
  await vi.advanceTimersByTimeAsync(20000);
  await played;
  vi.useRealTimers();
  const heard = live.heard.filter((record) => record.to! > record.from).map((record) => [record.from, record.to!]);
  return { silent: inMs(silent), heard: inMs(heard) };
};

test.each([
  ["a played clip replacing a longer one, then a queue", "((play voice long)) ((play voice short after 1)) ((queue voice tail))", [[0, 1016], [1000, 2000], [2000, 3000]]],
  ["a stop that fades, then a queue", "((play voice long)) ((stop voice long after 1 over 1)) ((queue voice tail))", [[0, 2000], [2000, 3000]]],
  ["a clip stopped before it starts, then a queue", "((play voice long after 5)) ((stop voice long after 1 over 1)) ((queue voice tail))", [[2000, 3000]]],
  ["a stop with the player's default fade, then a queue", "((play voice long)) ((stop voice long after 1)) ((queue voice tail))", [[0, 1016], [1016, 2016]]],
  ["a second stop with a longer fade, then a queue", "((play voice long)) ((stop voice long after 1 over 2)) ((stop voice long after 2 over 4)) ((queue voice tail))", [[0, 6000], [6000, 7000]]],
])("#2256: a silent voice gets the spans the real audio players play: %s", async (_name, line, expected) => {
  const { silent, heard } = await silentAndHeard(line);
  expect(heard).toEqual(expected);
  expect(silent).toEqual(heard);
});

test("#2256: a replayed beat sends the faded spans and plays until the queued clip ends", async () => {
  const source = `${VOICES}scene start\n  MIA: ((play voice long)) ((stop voice long after 1 over 1)) ((queue voice tail)) Hi.\nend\n`;
  const h = createHarness(source);
  await h.ready;
  expect(h.errors).toEqual([]);
  const audio = h.game.module.audio as any;
  const emit = audio.emitSettled.bind(audio);
  audio.emitSettled = (message: any) => message.method === "audio/measure"
    ? Promise.resolve({ durations: message.params.clips.map((clip: any) => LENGTHS[clip.key]) })
    : emit(message);
  const line = source.split("\n").findIndex((text) => text.includes("MIA:"));
  await h.game.preview(MAIN_URI, line, undefined, undefined, { playId: 88 });
  await flushMicrotasks(20);
  h.game.update({ deltaMS: 100 } as any);
  await flushMicrotasks(20);
  const spoken = flattenMessages(h.messages).find((message) => message.method === "morph/speech" && message.params.spans.length);
  for (let time = 0; time < 2500; time += 100) {
    h.game.update({ deltaMS: 100 } as any);
    await flushMicrotasks(3);
  }
  const playingAt2500 = h.game.playingBeat;
  h.game.destroy();
  expect(spoken?.params.spans).toEqual([[0, 2], [2, 3]]);
  expect(playingAt2500).toBe(true);
});

test("#2256: planning a silent voice leaves the audio module and the instructions as they were", async () => {
  const h = createHarness(`${VOICES}scene start\n  MIA: ((play voice long loop)) ((queue voice tail)) ((stop voice long after 1 over 1)) Hi.\nend\n`);
  await h.ready;
  expect(h.errors).toEqual([]);
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat()!;
  const audio = h.game.module.audio as any;
  audio.schedule("music", [{ control: "start", assets: ["long"], loop: true }]);
  audio.schedule("voice", [{ control: "start", assets: ["tail"], loop: true }]);
  await flushMicrotasks(20);
  const snapshot = () => JSON.stringify([audio._state, [...audio._channelsCurrentlyPlaying].map(([channel, playing]: any) => [channel, [...playing]]), [...audio._audible], [...audio._sounding], [...audio._clipLengths], audio._clipLengthsVersion]);
  const before = snapshot();
  const sequence = beat.audio!["voice"]!;
  const input = JSON.stringify(sequence);
  expect(audio.planVoice(sequence).updates.length).toBeGreaterThan(0);
  h.game.destroy();
  expect(JSON.stringify(sequence)).toBe(input);
  expect(snapshot()).toBe(before);
});

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

test("#2256: measuring a voice clip whose source changed decodes the new source", async () => {
  const decoded: string[] = [];
  const cache = new AssetCache({
    createImage: () => { throw new Error("unexpected image"); },
    decodeAudio: async (params) => {
      decoded.push(params.src!);
      return { duration: params.src === "old.wav" ? 2 : 5, length: 1000, numberOfChannels: 1 } as AudioBuffer;
    },
  });
  const app: any = { overlay: document.createElement("div"), assets: { cache }, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  const page = new AudioManager(app);
  const measure = async (src: string) => (await page.onReceiveRequest({ jsonrpc: "2.0", id: 1, method: "audio/measure", params: { clips: [{ channel: "voice", key: "audio.line", src }] } } as any) as any).result.durations;
  expect(await measure("old.wav")).toEqual([2]);
  const changed = await measure("new.wav");
  expect(changed).toEqual([5]);
  cache.dispose();
});

test("#2256: after a script edit changes a voice source, the replayed mouth follows the new clip", async () => {
  const source = (src: string) => `define mia as character with
  name = "MIA"
end
define mia_hello as audio with
  src = "${src}"
end
scene start
  MIA: ((play voice mia_hello)) Hi.
end
`;
  const decoded: string[] = [];
  const cache = new AssetCache({
    createImage: () => { throw new Error("unexpected image"); },
    decodeAudio: async (params) => {
      decoded.push(params.src!);
      return { duration: params.src === "old.wav" ? 2 : 5, length: 1000, numberOfChannels: 1 } as AudioBuffer;
    },
  });
  const page = new AudioManager({ overlay: document.createElement("div"), assets: { cache }, audioClock: new AudioClock(0, () => 0), emit: () => {} } as any);
  const h = createHarness(source("old.wav"));
  await h.ready;
  expect(h.errors).toEqual([]);
  const audio = h.game.module.audio as any;
  const emit = audio.emitSettled.bind(audio);
  audio.emitSettled = async (message: any) => message.method === "audio/measure"
    ? (await page.onReceiveRequest(message) as any).result
    : emit(message);
  const replay = async (playId: number) => {
    h.reset();
    await h.game.preview(MAIN_URI, 7, undefined, undefined, { playId });
    await flushMicrotasks(30);
    h.game.update({ deltaMS: 100 } as any);
    await flushMicrotasks(20);
    return flattenMessages(h.messages).find((message) => message.method === "morph/speech" && message.params.spans.length)?.params.spans;
  };
  expect(await replay(1)).toEqual([[0, 2]]);
  const updated = compileUI(source("new.wav"));
  expect(updated.errors).toEqual([]);
  h.game.updateProgram(updated.program);
  expect(audio.clipLength(audio.resolveLoadParams("voice", ["mia_hello"])[0])).toBeUndefined();
  await h.reconnect();
  const spans = await replay(2);
  const clip = audio.resolveLoadParams("voice", ["mia_hello"])[0];
  h.game.destroy();
  cache.dispose();
  expect(clip.src).toBe("new.wav");
  expect(spans).toEqual([[0, 5]]);
});
