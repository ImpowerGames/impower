import { afterEach, describe, expect, it } from "vitest";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";
import { createStandInAudio, type StandInAudio } from "./standInAudio";

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
