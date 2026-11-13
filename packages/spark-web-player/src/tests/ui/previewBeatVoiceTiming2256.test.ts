import { expect, test } from "vitest";
import AudioManager from "../../app/managers/AudioManager";
import { AssetCache } from "../../app/assets/AssetCache";
import { AudioClock } from "../../app/AudioClock";
import { silentVoice, voiceSpans } from "../../../../spark-engine/src/game/core/classes/presenters/voice";
import { compileUI, createHarness, flattenMessages, flushMicrotasks, MAIN_URI } from "../../../../spark-engine/src/tests/ui/harness/uiTestHarness";

test("#2256: a silent voice of played, replaced and queued clips gets the spans the game would hear", async () => {
  const h = createHarness(`define mia as character with
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
scene start
  MIA: Hi.
end
`);
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.markPreviewing(1);
  const sequence: any[] = [
    { control: "play", assets: ["long"], after: 0, over: 0 },
    { control: "play", assets: ["short"], after: 1, over: 0 },
    { control: "queue", assets: ["tail"], after: 0, over: 0 },
  ];
  const lengths: Record<string, number> = { "audio.long": 10, "audio.short": 1, "audio.tail": 1 };
  const voice = silentVoice(h.game, { speech: { character: "mia", spans: [] }, audio: { voice: sequence } } as any)!;
  const silent = voiceSpans(voice, (clip) => lengths[clip.key]);
  h.reset();
  const id = h.game.module.audio.schedule("voice", sequence);
  await flushMicrotasks(20);
  expect(h.game.module.audio.isReady(id)).toBe(true);
  h.game.module.audio.trigger(id, 0);
  await flushMicrotasks(20);
  const request = flattenMessages(h.messages).find((message) => message.method === "audio/update" && message.params.channel === "voice");
  expect(request).toBeDefined();

  const context = { currentTime: 0, state: "running" };
  const actual: any[] = [];
  const players = new Map<string, any>();
  for (const [key, length] of Object.entries(lengths)) {
    const instances: any[] = [];
    players.set(key, {
      instances,
      getNextCueTime: (when: number) => when,
      start: (when: number) => {
        let resolve!: () => void;
        const instance = { startedAt: when, end: when + length, ended: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
        instances.push(instance);
        actual.push(instance);
        return instance;
      },
      stop: (when: number) => { for (const instance of instances) instance.end = Math.min(instance.end, when); },
    });
  }
  const app: any = { overlay: document.createElement("div"), audioContext: context, audioClock: { toContextTime: (time: number) => time }, emit: () => {} };
  const page = new AudioManager(app) as any;
  page._audioChannels.set("voice", players);
  const scheduled = page.updateAudioPlayers(request.params);
  expect(actual).toHaveLength(2);
  context.currentTime = 2;
  for (const player of players.values()) {
    for (const instance of [...player.instances]) {
      if (instance.end <= context.currentTime) {
        player.instances.splice(player.instances.indexOf(instance), 1);
        instance.resolve();
      }
    }
  }
  await scheduled;
  const heard = actual.map((instance) => [instance.startedAt, instance.end]);
  expect(heard).toEqual([[0, 1], [1, 2], [2, 3]]);
  expect(silent).toEqual(heard);
  h.game.destroy();
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
