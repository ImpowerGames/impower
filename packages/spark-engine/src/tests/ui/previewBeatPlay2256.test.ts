import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { silentVoice, voiceSpans } from "../../game/core/classes/presenters/voice";
import { BEAT_LEAD_MS } from "../../game/core/utils/sharedClock";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
  type UIHarness,
} from "./harness/uiTestHarness";

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const pointerDown = {
  jsonrpc: "2.0",
  method: "event",
  params: { type: "pointerdown", button: 0 },
} as any;

const SOURCE = `define mia as character with
  name = "MIA"
end

define mia_hello as audio with
  src = "https://example.com/mia_hello.wav"
end

scene start
  MIA: First line.
  MIA: Hello <wait:1> there.
  MIA:
    ((play voice mia_hello))
    Hello again.
  choose
    Which way?
    + Left
      Gone left.
    + Right
      Gone right.
  end
end
`;

const WAITING_LINE = 10;
const VOICED_LINE = 13;
const CHOICE_LINE = 15;

const PLAYED = "game/playedBeat";

async function harness(): Promise<UIHarness> {
  const h = createHarness(SOURCE);
  await h.ready;
  return h;
}

async function play(h: UIHarness, line: number) {
  h.reset();
  const shown = await h.game.preview(MAIN_URI, line, undefined, undefined, {
    playId: 7,
  });
  await flushMicrotasks(10);
  return shown;
}

async function stillOf(line: number) {
  const h = await harness();
  await h.preview(line);
  await flushMicrotasks(10);
  return JSON.parse(JSON.stringify(h.game.module.ui.state));
}

async function waitingBeat() {
  const h = await harness();
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  for (let beats = 0; beats < 4; beats += 1) {
    const beat = h.nextBeat();
    const shown = Object.values(beat?.text ?? {})
      .flat()
      .map((event) => event?.text ?? "")
      .join("");
    if (shown.includes("there")) {
      return beat!;
    }
  }
  throw new Error("the waiting beat was never reached");
}

const uiState = (h: UIHarness) =>
  JSON.parse(JSON.stringify(h.game.module.ui.state));

const played = (h: UIHarness) =>
  h.messages.filter((m) => m?.method === PLAYED);

const textWrites = (h: UIHarness) =>
  flattenMessages(h.messages).filter((m) => m?.method === "ui/write-text");

const speech = (h: UIHarness) =>
  flattenMessages(h.messages).filter((m) => m?.method === "morph/speech");

async function advance(h: UIHarness, ms: number, step = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    h.game.update(tick(Math.min(step, ms - elapsed)));
    await flushMicrotasks(5);
  }
}

describe("playing the previewed beat once (#2256)", () => {
  test("the played beat runs in time, waits its wait, then rests on the instant still without starting the game", async () => {
    const still = await stillOf(WAITING_LINE);
    const h = await harness();
    const shown = await play(h, WAITING_LINE);
    expect(shown).not.toBeNull();
    expect(h.game.playingBeat).toBe(true);
    const spoken = speech(h);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken[0].params.spans.length).toBeGreaterThan(0);
    expect(spoken[0].params.time).toBeTypeOf("number");
    const timed = textWrites(h).filter((m) => m.params.instant === false);
    expect(timed.length).toBeGreaterThan(0);
    expect(timed.every((m) => typeof m.params.time === "number")).toBe(true);
    const afters = timed.flatMap((m) =>
      m.params.instructions.map((i: { after?: number }) => i.after ?? 0),
    );
    expect(Math.min(...afters)).toBe(0);
    expect(Math.max(...afters)).toBeGreaterThanOrEqual(1);

    const endMS = (await waitingBeat()).end! * 1000;
    expect(endMS).toBeGreaterThan(1000);
    await advance(h, BEAT_LEAD_MS + endMS - 100);
    expect(h.game.playingBeat).toBe(true);
    expect(played(h)).toEqual([]);

    await advance(h, 300);
    expect(h.game.playingBeat).toBe(false);
    expect(played(h)).toEqual([
      expect.objectContaining({ params: { playId: 7 } }),
    ]);
    expect(uiState(h)).toEqual(still);
    expect(h.game.state).toBe("previewing");
    expect(h.game.context.system.previewing).toBe(shown);
    expect(
      h.messages.some((m) =>
        ["game/started", "game/clickedToContinue", "game/autoAdvancedToContinue"].includes(
          m?.method,
        ),
      ),
    ).toBe(false);
  });

  test("a stopped preview that is not asked to play stays a still, as today", async () => {
    const h = await harness();
    await h.preview(WAITING_LINE);
    await flushMicrotasks(10);
    expect(h.game.playingBeat).toBe(false);
    expect(speech(h).every((m) => m.params.spans.length === 0)).toBe(true);
  });

  test("a click while the beat plays finishes it at once on the still", async () => {
    const still = await stillOf(WAITING_LINE);
    const h = await harness();
    await play(h, WAITING_LINE);
    await advance(h, BEAT_LEAD_MS + 200);
    expect(h.game.playingBeat).toBe(true);
    await h.game.onReceive(pointerDown);
    await flushMicrotasks(10);
    expect(h.game.playingBeat).toBe(false);
    expect(played(h)).toHaveLength(1);
    expect(uiState(h)).toEqual(still);
    await h.game.onReceive(pointerDown);
    await advance(h, 4000);
    expect(played(h)).toHaveLength(1);
    expect(uiState(h)).toEqual(still);
    expect(h.game.state).toBe("previewing");
  });

  test("a later preview update cancels the play and shows that update's still", async () => {
    const sameStill = await stillOf(WAITING_LINE);
    const h = await harness();
    await play(h, WAITING_LINE);
    await advance(h, BEAT_LEAD_MS + 200);
    await h.preview(WAITING_LINE);
    await flushMicrotasks(10);
    expect(h.game.playingBeat).toBe(false);
    expect(uiState(h)).toEqual(sameStill);

    const other = await harness();
    await play(other, WAITING_LINE);
    await advance(other, BEAT_LEAD_MS + 200);
    other.game.updateProgram(other.game.program);
    expect(other.game.playingBeat).toBe(false);
    expect(played(other)).toHaveLength(1);
    await advance(other, 4000);
    expect(played(other)).toHaveLength(1);
  });

  test("a choice menu appears at the end and a click on it chooses nothing", async () => {
    const still = await stillOf(CHOICE_LINE);
    const h = await harness();
    await play(h, CHOICE_LINE);
    const choices = h.observedElementIds();
    expect(choices.length).toBeGreaterThan(0);
    await advance(h, 5000);
    expect(h.game.playingBeat).toBe(false);
    for (const id of h.observedElementIds()) {
      h.emitEvent("click", id, { button: 0 });
    }
    await flushMicrotasks(10);
    expect(
      h.messages.some((m) => m?.method === "game/chosePathToContinue"),
    ).toBe(false);
    expect(uiState(h)).toEqual(still);
  });

  test("a voiced line measures its clip, plays silently for the clip's length, then rests on the still", async () => {
    const h = await harness();
    await play(h, VOICED_LINE);
    await advance(h, 100);
    const measured = flattenMessages(h.messages).filter(
      (m) => m?.method === "audio/measure",
    );
    expect(measured).toHaveLength(1);
    expect(measured[0].params.clips).toEqual([
      expect.objectContaining({ src: "https://example.com/mia_hello.wav" }),
    ]);
    const sounded = flattenMessages(h.messages)
      .filter((m) => m?.method === "audio/update")
      .flatMap((m) => m.params?.updates ?? [])
      .filter((update: any) => update.control === "start");
    expect(sounded).toEqual([]);
    const spoken = speech(h).find((m) => m.params.spans.length > 0);
    expect(spoken.params.voiced).toBeUndefined();
    expect(spoken.params.spans).toEqual([[0, 2.5]]);
    await advance(h, BEAT_LEAD_MS + 2300);
    expect(h.game.playingBeat).toBe(true);
    await advance(h, 400);
    expect(h.game.playingBeat).toBe(false);
    const still = speech(h).at(-1).params;
    expect(still.spans).toEqual([]);
    expect(still.voiced).toBeUndefined();
  });

  test("a click finishes a voiced line at once and rests its mouth", async () => {
    const clicked = await harness();
    await play(clicked, VOICED_LINE);
    await advance(clicked, BEAT_LEAD_MS + 100);
    await clicked.game.onReceive(pointerDown);
    await flushMicrotasks(10);
    expect(clicked.game.playingBeat).toBe(false);
    const rest = speech(clicked).at(-1).params;
    expect(rest.spans).toEqual([]);
    expect(rest.voiced).toBeUndefined();
    expect(rest.revealed).toBeUndefined();
  });

  test("a page that never answers the measurement delays the beat only until the bound, then the typed speech plays", async () => {
    const h = await harness();
    const audio = h.game.module.audio as any;
    const emitSettled = audio.emitSettled.bind(audio);
    audio.emitSettled = (msg: any) =>
      msg.method === "audio/measure" ? new Promise(() => {}) : emitSettled(msg);
    await play(h, VOICED_LINE);
    await advance(h, 1000);
    expect(h.game.playingBeat).toBe(true);
    expect(speech(h).some((m) => m.params.spans.length > 0)).toBe(false);
    expect(h.timerDelays()).toContain(5000);
    h.flushTimers();
    await advance(h, 100);
    const typed = speech(h).find((m) => m.params.spans.length > 0);
    expect(typed.params.voiced).toBe(true);
    await advance(h, 4000);
    expect(h.game.playingBeat).toBe(false);
  });

  test("a measurement answered after its play was cancelled only fills the cache the next play uses", async () => {
    const h = await harness();
    const audio = h.game.module.audio as any;
    const emitSettled = audio.emitSettled.bind(audio);
    let answer!: (result: unknown) => void;
    audio.emitSettled = (msg: any) =>
      msg.method === "audio/measure"
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : emitSettled(msg);
    await play(h, VOICED_LINE);
    await advance(h, 100);
    await h.preview(WAITING_LINE);
    await flushMicrotasks(10);
    expect(h.game.playingBeat).toBe(false);
    h.reset();
    answer({ durations: [4] });
    await advance(h, 1000);
    expect(speech(h)).toEqual([]);
    expect(audio.clipLength(audio.resolveLoadParams("voice", ["mia_hello"])[0])).toBe(4);

    const again = await harness();
    const againAudio = again.game.module.audio as any;
    againAudio._clipLengths = audio._clipLengths;
    await play(again, VOICED_LINE);
    await advance(again, 100);
    expect(
      flattenMessages(again.messages).filter((m) => m?.method === "audio/measure"),
    ).toEqual([]);
    expect(speech(again).find((m) => m.params.spans.length > 0).params.spans).toEqual([[0, 4]]);
  });
});

describe("measuring the voice of a played beat again (#2256)", () => {
  const measures = (h: UIHarness) =>
    flattenMessages(h.messages).filter((m) => m?.method === "audio/measure");

  test("a program update forgets measured lengths, and an answer asked before it is not kept", async () => {
    const h = await harness();
    const audio = h.game.module.audio as any;
    const emitSettled = audio.emitSettled.bind(audio);
    let answer!: (result: unknown) => void;
    audio.emitSettled = (msg: any) =>
      msg.method === "audio/measure"
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : emitSettled(msg);
    await play(h, VOICED_LINE);
    await advance(h, 100);
    h.game.updateProgram(h.game.program);
    answer({ durations: [4] });
    await flushMicrotasks(10);
    const load = audio.resolveLoadParams("voice", ["mia_hello"])[0];
    expect(audio.clipLength(load)).toBeUndefined();
    audio.emitSettled = emitSettled;
    await h.reconnect();
    h.reset();
    await play(h, VOICED_LINE);
    await advance(h, 100);
    expect(measures(h)).toHaveLength(1);
    expect(audio.clipLength(load)).toBe(2.5);
    h.game.updateProgram(h.game.program);
    expect(audio.clipLength(load)).toBeUndefined();
  });

  test("a clip that could not be measured is asked for again on the next play", async () => {
    const h = await harness();
    const audio = h.game.module.audio as any;
    const emitSettled = audio.emitSettled.bind(audio);
    let failing = true;
    let asked = 0;
    audio.emitSettled = (msg: any) => {
      if (msg.method === "audio/measure") {
        asked += 1;
        if (failing) {
          return Promise.resolve({ durations: [null] });
        }
      }
      return emitSettled(msg);
    };
    await play(h, VOICED_LINE);
    await advance(h, 100);
    expect(asked).toBe(1);
    await h.game.onReceive(pointerDown);
    failing = false;
    h.reset();
    await play(h, VOICED_LINE);
    await advance(h, 100);
    expect(asked).toBe(2);
    expect(speech(h).find((m) => m.params.spans.length > 0).params.spans).toEqual([[0, 2.5]]);
  });
});

describe("the voice timeline of a silently played beat (#2256)", () => {
  const VOICES = `define mia as character with
  name = "MIA"
end

define long as audio with
  src = "long.wav"
end

define first as audio with
  src = "first.wav"
end

define second as audio with
  src = "second.wav"
end

define third as audio with
  src = "third.wav"
end

define fourth as audio with
  src = "fourth.wav"
end

scene start
  MIA: Hi.
end
`;
  const lengths: Record<string, number> = {
    long: 10,
    first: 2,
    second: 3,
    third: 1,
    fourth: 4,
  };
  const timelineOf = async (sequence: any[], known: Record<string, number> = lengths) => {
    const h = createHarness(VOICES);
    await h.ready;
    expect(h.errors).toEqual([]);
    h.game.markPreviewing(1);
    const voice = silentVoice(h.game, {
      speech: { character: "mia", spans: [] },
      audio: { voice: sequence },
    } as any);
    expect(voice).toBeDefined();
    return voiceSpans(voice!, (clip) => known[clip.key.split(".").pop()!]);
  };

  test("a played clip replaces the clips before it, and a queue waits for what is left", async () => {
    expect(
      await timelineOf([
        { control: "play", assets: ["long"], after: 0 },
        { control: "play", assets: ["third"], after: 1 },
        { control: "queue", assets: ["third"], after: 0 },
      ]),
    ).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  test("a queued event starts its after when the clips before it end, and its clips start together", async () => {
    expect(
      await timelineOf([
        { control: "play", assets: ["first"], after: 0 },
        { control: "queue", assets: ["second", "third"], after: 1 },
      ]),
    ).toEqual([
      [0, 2],
      [3, 6],
      [3, 4],
    ]);
  });

  test("an event after a queue keeps the time the queue waited until as its origin", async () => {
    expect(
      await timelineOf([
        { control: "start", assets: ["first"], after: 0 },
        { control: "queue", assets: ["third"], after: 1 },
        { control: "start", assets: ["fourth"], after: 0.5 },
      ]),
    ).toEqual([
      [0, 2],
      [3, 4],
      [2.5, 6.5],
    ]);
  });

  test("a clip with no measured length is left out", async () => {
    expect(
      await timelineOf(
        [{ control: "start", assets: ["first", "second"], after: 0.5 }],
        { first: 2 },
      ),
    ).toEqual([[0.5, 2.5]]);
  });
});

describe("a played beat whose pictures or movies need loading (#2256)", () => {
  const PICTURED = `scene start
  [[show portrait bunny]]
  Hello <wait:1> there.
  Next line.
end
`;
  const BUNNY = {
    uri: "inmemory:///bunny.png",
    type: "image",
    name: "bunny",
    ext: "png",
    src: "bunny.png",
  } as any;

  test("a still asked for while the beat waits for its pictures cancels the play", async () => {
    const h = createHarness(PICTURED, 1, { assets: [BUNNY], holdAssets: true });
    await h.ready;
    const played = h.game.preview(MAIN_URI, 1, undefined, undefined, {
      playId: 41,
    });
    await flushMicrotasks(20);
    expect(h.heldAssetLoadCount()).toBeGreaterThan(0);
    const still = h.preview(1);
    h.releaseAssets();
    await Promise.all([played, still]);
    await flushMicrotasks(20);
    expect(h.game.playingBeat).toBe(false);
    expect(
      speech(h).every((m) => m.params.spans.length === 0),
    ).toBe(true);
  });

  const MOVIES = `define intro as video with
  src = "intro.webm"
end

define wave as video with
  src = "wave.webm"
end

scene start
  [[play intro]]
  After.
  [[show portrait wave]]
  Waving.
end
`;

  const cutscenes = (h: UIHarness) =>
    flattenMessages(h.messages).filter((m) => m?.method === "ui/play-cutscene");

  const portraitVideos = (h: UIHarness) =>
    flattenMessages(h.messages)
      .filter((m) => m?.method === "ui/write-image")
      .flatMap((m) => m.params.instructions ?? [])
      .map((instruction: any) => instruction?.content?.video)
      .filter(Boolean);

  test("a played cutscene plays muted, and the still after it shows its first frame", async () => {
    const h = createHarness(MOVIES);
    await h.ready;
    h.reset();
    await h.game.preview(MAIN_URI, 9, undefined, undefined, { playId: 42 });
    await advance(h, BEAT_LEAD_MS + 100);
    const played = cutscenes(h).filter((m) => !m.params.preview);
    expect(played.length).toBeGreaterThan(0);
    expect(played.every((m) => m.params.muted === true)).toBe(true);
    await h.game.onReceive(pointerDown);
    await flushMicrotasks(10);
    expect(h.game.playingBeat).toBe(false);
    expect(cutscenes(h).at(-1)?.params.preview).toBe(true);
  });

  test("a played movie on a layer plays muted, and the still after it shows its first frame", async () => {
    const h = createHarness(MOVIES);
    await h.ready;
    h.reset();
    await h.game.preview(MAIN_URI, 11, undefined, undefined, { playId: 43 });
    await advance(h, BEAT_LEAD_MS + 100);
    const played = portraitVideos(h);
    expect(played.length).toBeGreaterThan(0);
    expect(played.every((video: any) => !video.preview && video.muted)).toBe(true);
    await h.game.onReceive(pointerDown);
    await flushMicrotasks(10);
    expect(portraitVideos(h).at(-1)?.preview).toBe(true);
  });
});

describe("the preview's checkpoint after a played beat (#2256)", () => {
  const latestCheckpoint = (h: UIHarness) => {
    const store = (h.game as any)._checkpoints;
    return { count: store.length, json: JSON.parse(store.at(store.length - 1)) };
  };

  test("a beat that plays to its end or is clicked leaves the same checkpoint the still does", async () => {
    const still = await harness();
    await still.preview(WAITING_LINE);
    await flushMicrotasks(10);
    const expected = latestCheckpoint(still);

    const ended = await harness();
    await play(ended, WAITING_LINE);
    await advance(ended, BEAT_LEAD_MS + 5000);
    expect(ended.game.playingBeat).toBe(false);
    expect(latestCheckpoint(ended)).toEqual(expected);

    const clicked = await harness();
    await play(clicked, WAITING_LINE);
    await advance(clicked, BEAT_LEAD_MS + 200);
    await clicked.game.onReceive(pointerDown);
    await flushMicrotasks(10);
    expect(clicked.game.playingBeat).toBe(false);
    expect(latestCheckpoint(clicked)).toEqual(expected);
  });
});
