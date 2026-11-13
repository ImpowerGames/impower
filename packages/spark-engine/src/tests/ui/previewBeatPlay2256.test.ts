import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
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

  test("a voiced line plays until the clip the page measured has ended, then rests on the still", async () => {
    const ended = await harness();
    await play(ended, VOICED_LINE);
    await advance(ended, 5000);
    expect(ended.game.playingBeat).toBe(true);
    ended.game.connection.receive({
      jsonrpc: "2.0",
      method: "morph/speechMeasured",
      params: { end: 6 },
    } as any);
    await advance(ended, 6000 - 5000 - 200);
    expect(ended.game.playingBeat).toBe(true);
    await advance(ended, BEAT_LEAD_MS + 1000);
    expect(ended.game.playingBeat).toBe(false);
    const still = speech(ended).at(-1).params;
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

  test("a voiced line plays silently and tells the page the clip it would have heard", async () => {
    const h = await harness();
    await play(h, VOICED_LINE);
    const audio = flattenMessages(h.messages).filter(
      (m) => m?.method === "audio/update",
    );
    expect(audio).toEqual([]);
    const voiced = speech(h).find((m) => m.params.voiced);
    expect(voiced).toBeTruthy();
    expect(voiced.params.clips).toEqual([
      expect.objectContaining({
        after: 0,
        load: expect.objectContaining({
          src: "https://example.com/mia_hello.wav",
        }),
      }),
    ]);
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
