import { afterEach, describe, expect, it } from "vitest";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";
import { createStandInAudio, type StandInAudio } from "./standInAudio";
import { stubMedia } from "../ui/mediaStubs";

const SOURCE = `define mia as character with
  name = "MIA"
end

define theme as audio with
  src = "https://example.com/theme.mp3"
end

define storm as audio with
  src = "https://example.com/storm.mp3"
end

define mia_hello as audio with
  src = "https://example.com/mia_hello.wav"
end

scene start
  ((play music theme))
  MIA: First line.
  MIA: Second line.
  MIA:
    ((play voice mia_hello))
    Hello there, how are you today?
  ((play music storm))
  MIA: Fourth line.
end
`;

const FIRST = 18;
const SECOND = 19;
const VOICED = 22;
const FOURTH = 24;

const THEME = "audio.theme";
const STORM = "audio.storm";
const VOICE = "audio.mia_hello";

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

async function previewAt(line: number, audio: StandInAudio) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
    audio,
  });
  harness = h;
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(line);
  await settle(40);
  return h;
}

const setPlayAudio = async (h: Harness, enabled: boolean) => {
  await h.controller.handleSetPlayAudio({
    jsonrpc: "2.0",
    id: 1,
    method: "preview/setPlayAudio",
    params: { enabled },
  });
  await settle(40);
};

const select = async (h: Harness, line: number) => {
  await h.select(line);
  await settle(40);
};

const playing = (h: Harness) => !!h.controller.getGameState().beat?.playing;

async function playBeat(h: Harness) {
  await h.controller.playBeat();
  await settle(40);
  expect(playing(h)).toBe(true);
  for (let elapsed = 0; elapsed < 8000 && playing(h); elapsed += 100) {
    await h.tick(100);
    await settle(5);
  }
  expect(playing(h)).toBe(false);
  await settle(40);
}

const oneShots = (audio: StandInAudio) =>
  audio.sources.filter((s) => !s.key.startsWith("audio.theme") && !s.key.startsWith("audio.storm"));

const blips = (audio: StandInAudio) =>
  audio.sources.filter((s) => s.key.startsWith("synth."));

const recordSpeech = (h: Harness) => {
  const morphs = MorphPlayback.for(h.overlay);
  const calls: (readonly (readonly [number, number])[])[] = [];
  const speak = morphs.speak.bind(morphs);
  morphs.speak = (character, spans) => {
    calls.push(spans.map(([start, end]) => [start, end] as const));
    speak(character, spans);
  };
  return calls;
};

const followsClip = (spans: readonly (readonly [number, number])[]) =>
  spans.some(([start, end]) => end - start > 1e6);

describe("Play audio in the stopped preview (#2258)", () => {
  it("plays the looping sound running at the shown beat, keeps the same instance across beats that share it, and changes it when the beat's state differs", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(FIRST, audio);
    expect(audio.sources).toEqual([]);

    await setPlayAudio(h, true);
    expect(audio.sounding()).toEqual([THEME]);
    const [theme] = audio.sourcesOf(THEME);
    expect(theme!.startedAt).toBeTypeOf("number");

    await select(h, SECOND);
    expect(audio.sourcesOf(THEME)).toEqual([theme]);
    expect(theme!.sounding).toBe(true);

    await select(h, VOICED);
    expect(audio.sourcesOf(THEME)).toEqual([theme]);
    expect(audio.sounding()).toEqual([THEME]);

    await select(h, FOURTH);
    expect(theme!.sounding).toBe(false);
    expect(audio.sounding()).toEqual([STORM]);

    await select(h, SECOND);
    expect(audio.sounding()).toEqual([THEME]);
    expect(audio.sourcesOf(STORM).every((s) => !s.sounding)).toBe(true);
  }, 120_000);

  it("sounds a voice clip and typing blips only when the beat is played, with the mouth following the clip, and keeps the music playing through it", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    await select(h, VOICED);
    const [theme] = audio.sourcesOf(THEME);
    expect(theme!.sounding).toBe(true);
    expect(oneShots(audio)).toEqual([]);

    const speech = recordSpeech(h);
    await playBeat(h);
    const voice = audio.sourcesOf(VOICE);
    expect(voice).toHaveLength(1);
    expect(voice[0]!.startedAt).toBeTypeOf("number");
    expect(blips(audio).length).toBeGreaterThan(0);
    expect(speech.some(followsClip)).toBe(true);
    expect(audio.sourcesOf(THEME)).toEqual([theme]);
    expect(theme!.sounding).toBe(true);

    const shots = oneShots(audio).length;
    await select(h, SECOND);
    await select(h, VOICED);
    expect(oneShots(audio)).toHaveLength(shots);
  }, 120_000);

  it("schedules nothing with the preference off, on caret moves and on a played beat", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(FIRST, audio);
    await select(h, SECOND);
    await select(h, VOICED);
    const speech = recordSpeech(h);
    await playBeat(h);
    await select(h, FOURTH);
    expect(audio.sources).toEqual([]);
    expect(speech.length).toBeGreaterThan(0);
    expect(speech.some(followsClip)).toBe(false);
  }, 120_000);

  it("plays a beat silently, with no error and the mouth on the typed text, until the audio context runs, then sound follows from the next preview update and played beat", async () => {
    const audio = createStandInAudio({ running: false });
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    await select(h, VOICED);
    const speech = recordSpeech(h);
    await playBeat(h);
    expect(audio.sources).toEqual([]);
    expect(speech.length).toBeGreaterThan(0);
    expect(speech.some(followsClip)).toBe(false);
    expect(
      h.toEditor.filter((m) => /error/i.test(String(m?.method ?? ""))),
    ).toEqual([]);

    audio.start();
    await settle(40);
    speech.length = 0;
    await playBeat(h);
    expect(audio.sourcesOf(VOICE)).toHaveLength(1);
    expect(speech.some(followsClip)).toBe(true);
    const theme = audio.sourcesOf(THEME);
    expect(theme).toHaveLength(1);
    expect(theme[0]!.sounding).toBe(true);

    await select(h, SECOND);
    expect(audio.sourcesOf(THEME)).toEqual(theme);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);

  it("brings the shown beat's loop back after the audio context runs on a preview update within the same beat", async () => {
    const source = `define theme as audio with
  src = "https://example.com/theme.mp3"
end

scene start
  ((play music theme))
  MIA:
    First sentence in the beat.
    Second sentence in the same beat.
  MIA: Another beat.
end
`;
    const audio = createStandInAudio({ running: false });
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: source }],
      startFrom: { file: MAIN_URI, line: 7 },
      manualClock: true,
      audio,
    });
    harness = h;
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    await h.compile();
    await select(h, 7);
    await setPlayAudio(h, true);
    const game = h.workerState.gameState.game!;
    const beat = game.previewedAddress;
    expect(beat).toBeTypeOf("number");
    expect(audio.sources).toEqual([]);
    audio.start();
    await settle(40);
    const displays = () =>
      h.toPage.filter((m: any) => m.method === "player/displayPreview").length;
    const before = displays();
    await select(h, 8);
    expect(displays()).toBeGreaterThan(before);
    expect(game.previewedAddress).toBe(beat);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);

  it("pauses looping sound while the page is hidden and resumes it when shown", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    const [theme] = audio.sourcesOf(THEME);
    const doc = h.overlay.ownerDocument;
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(doc, "visibilityState", {
        value: state,
        configurable: true,
      });
      h.controller.handleVisibilityChange();
    };
    setVisibility("hidden");
    await settle(5);
    expect(theme!.playbackRate.value).toBe(0);
    expect(theme!.stopped).toBe(false);
    setVisibility("visible");
    await settle(5);
    expect(theme!.playbackRate.value).toBe(1);
    expect(audio.sourcesOf(THEME)).toEqual([theme]);
    expect(theme!.sounding).toBe(true);
  }, 120_000);

  const holdAudioLoads = (audio: StandInAudio) => {
    const attach = audio.attach.bind(audio);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held = { waiting: 0, release: () => release() };
    audio.attach = (app, emit) => {
      const manager = attach(app, emit);
      const load = (manager as any).onLoadAudioPlayer.bind(manager);
      (manager as any).onLoadAudioPlayer = async (params: unknown) => {
        held.waiting += 1;
        await gate;
        return load(params);
      };
      return manager;
    };
    return held;
  };

  it("keeps a loop that finishes loading after Play audio is switched off silent", async () => {
    const audio = createStandInAudio();
    const held = holdAudioLoads(audio);
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    expect(held.waiting).toBeGreaterThan(0);
    await setPlayAudio(h, false);
    held.release();
    await settle(60);
    expect(audio.sounding()).toEqual([]);
    await setPlayAudio(h, true);
    expect(audio.sounding()).toEqual([THEME]);
    expect(audio.sourcesOf(THEME).filter((s) => s.sounding)).toHaveLength(1);
  }, 120_000);

  it("keeps a loop that finishes loading after the page hides silent and paused until the page is shown", async () => {
    const audio = createStandInAudio();
    const held = holdAudioLoads(audio);
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    expect(held.waiting).toBeGreaterThan(0);
    const release = held.release;
    const doc = h.overlay.ownerDocument;
    Object.defineProperty(doc, "visibilityState", { value: "hidden", configurable: true });
    h.controller.handleVisibilityChange();
    release();
    await settle(60);
    const [theme] = audio.sourcesOf(THEME);
    expect(theme!.startedAt).toBeTypeOf("number");
    expect(theme!.playbackRate.value).toBe(0);
    expect(audio.sounding()).toEqual([]);
    Object.defineProperty(doc, "visibilityState", { value: "visible", configurable: true });
    h.controller.handleVisibilityChange();
    await settle(5);
    expect(theme!.playbackRate.value).toBe(1);
    expect(audio.sourcesOf(THEME)).toEqual([theme]);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);

  it("keeps a preview page built while the page is hidden silent and paused until the page is shown", async () => {
    const audio = createStandInAudio();
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
      manualClock: true,
      audio,
    });
    harness = h;
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const doc = h.overlay.ownerDocument;
    Object.defineProperty(doc, "visibilityState", { value: "hidden", configurable: true });
    await setPlayAudio(h, true);
    await h.compile();
    await select(h, FIRST);
    const [theme] = audio.sourcesOf(THEME);
    expect(theme!.startedAt).toBeTypeOf("number");
    expect(theme!.playbackRate.value).toBe(0);
    expect(audio.sounding()).toEqual([]);
    Object.defineProperty(doc, "visibilityState", { value: "visible", configurable: true });
    h.controller.handleVisibilityChange();
    await settle(5);
    expect(theme!.playbackRate.value).toBe(1);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);

  it("stops looping sound when the preference is switched off and plays it again when switched back on", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(FIRST, audio);
    await setPlayAudio(h, true);
    const [theme] = audio.sourcesOf(THEME);
    await setPlayAudio(h, false);
    expect(theme!.sounding).toBe(false);
    expect(audio.sounding()).toEqual([]);
    await select(h, SECOND);
    expect(audio.sounding()).toEqual([]);
    await setPlayAudio(h, true);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);

  it("stops the preview's looping sound when the game starts playing, and plays it again in the preview after the game stops", async () => {
    const audio = createStandInAudio();
    const h = await previewAt(SECOND, audio);
    await setPlayAudio(h, true);
    const [theme] = audio.sourcesOf(THEME);
    expect(theme!.sounding).toBe(true);
    await h.controller.startGameAndApp();
    await settle(40);
    expect(theme!.stopped).toBe(true);

    const before = audio.sources.length;
    await h.controller.stopGame("quit");
    await settle(40);
    await select(h, SECOND);
    const again = audio.sources
      .slice(before)
      .filter((s) => s.key === THEME && s.sounding);
    expect(again).toHaveLength(1);
    expect(audio.sounding()).toEqual([THEME]);
  }, 120_000);
});

const MOVIE_SOURCE = `define intro as video with
  src = "intro.webm"
end

scene start
  [[play intro]]
  After the movie.
end
`;

const MOVIE_BEAT = 5;

describe("a played beat's movie in the stopped preview (#2258, #2327)", () => {
  async function movieAt(audio: StandInAudio) {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: MOVIE_SOURCE }],
      startFrom: { file: MAIN_URI, line: MOVIE_BEAT },
      manualClock: true,
      audio,
    });
    harness = h;
    stubMedia(h.overlay);
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    await h.compile();
    await select(h, MOVIE_BEAT);
    return h;
  }

  async function playMovie(h: Harness) {
    await h.controller.playBeat();
    await settle(40);
    await h.tick(100);
    await settle(40);
    expect(playing(h)).toBe(true);
    const video = h.overlay.querySelector(".cutscene video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.paused).toBe(false);
    return video;
  }

  const setVisibility = (h: Harness, state: "hidden" | "visible") => {
    Object.defineProperty(h.overlay.ownerDocument, "visibilityState", {
      value: state,
      configurable: true,
    });
    h.controller.handleVisibilityChange();
  };

  it("plays silent with Play audio off and is heard with it on", async () => {
    const audio = createStandInAudio();
    const h = await movieAt(audio);
    const silent = await playMovie(h);
    expect(audio.movieSounding(silent)).toBe(false);
    await select(h, MOVIE_BEAT);
    await setPlayAudio(h, true);
    const heard = await playMovie(h);
    expect(audio.movieSounding(heard)).toBe(true);
  }, 120_000);

  it("falls silent, still playing, when Play audio is switched off mid-beat", async () => {
    const audio = createStandInAudio();
    const h = await movieAt(audio);
    await setPlayAudio(h, true);
    const video = await playMovie(h);
    expect(audio.movieSounding(video)).toBe(true);
    await setPlayAudio(h, false);
    expect(video.paused).toBe(false);
    expect(audio.movieSounding(video)).toBe(false);
  }, 120_000);

  it("falls silent, still playing, while the page is hidden, and is heard again when shown", async () => {
    const audio = createStandInAudio();
    const h = await movieAt(audio);
    await setPlayAudio(h, true);
    const video = await playMovie(h);
    setVisibility(h, "hidden");
    await settle(5);
    expect(video.paused).toBe(false);
    expect(audio.movieSounding(video)).toBe(false);
    setVisibility(h, "visible");
    await settle(5);
    expect(playing(h)).toBe(true);
    expect(audio.movieSounding(video)).toBe(true);
  }, 120_000);

  it("stays muted until the audio context runs, then is heard", async () => {
    const audio = createStandInAudio({ running: false });
    const h = await movieAt(audio);
    await setPlayAudio(h, true);
    const video = await playMovie(h);
    expect(video.muted).toBe(true);
    audio.start();
    await settle(20);
    expect(video.muted).toBe(false);
    expect(audio.movieSounding(video)).toBe(true);
  }, 120_000);
});
