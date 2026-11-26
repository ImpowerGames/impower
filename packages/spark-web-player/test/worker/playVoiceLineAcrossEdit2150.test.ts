import { afterEach, describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";
import { createStandInAudio, type StandInAudio } from "./standInAudio";

const SOURCE = `define mia as character with
  name = "MIA"
end

define mia_hello as audio with
  src = "https://example.com/mia_hello.wav"
end

scene start
  MIA:
    ((play voice mia_hello))
    Hello there, how are you today?
  MIA: The next line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const VOICED = lineOf("Hello there, how are you today?");
const NEXT = lineOf("The next line.");
const VOICE = "audio.mia_hello";

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

async function playingVoicedLine(audio: StandInAudio) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: VOICED },
    manualClock: true,
    audio,
  });
  harness = h;
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(VOICED);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 60);
  await settle(20);
  return h;
}

const replace = (line: number, from: string, to: string) => {
  const character = SOURCE.split("\n")[line]!.indexOf(from);
  return [
    {
      range: {
        start: { line, character },
        end: { line, character: character + from.length },
      },
      text: to,
    },
  ];
};

describe("a voice line playing during PLAY keeps sounding through an edit (#2150)", () => {
  it("keeps the same clip playing from where it was, and plays its remainder out once", async () => {
    const audio = createStandInAudio({ timed: true });
    const h = await playingVoicedLine(audio);

    const before = audio.sourcesOf(VOICE);
    expect(before).toHaveLength(1);
    const voice = before[0]!;
    expect(voice.heardAt(audio.currentTime)).toBe(true);
    const startedAt = voice.startedAt;
    const offset = voice.offset ?? 0;
    const editedAt = audio.currentTime;

    await h.edit(replace(NEXT, "The next line.", "The next line, edited."));
    await h.compile();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await settle(40);
    await h.tick(1000 / 60, 30);
    await settle(20);

    const after = audio.sourcesOf(VOICE);
    expect({
      playing: h.controller.playing,
      voiceSources: after.length,
      sameSource: after[0] === voice,
      startedAt: voice.startedAt,
      offset: voice.offset ?? 0,
      heard: voice.heardAt(audio.currentTime),
    }).toEqual({
      playing: true,
      voiceSources: 1,
      sameSource: true,
      startedAt,
      offset,
      heard: true,
    });
    expect(audio.currentTime).toBeGreaterThan(editedAt);
    const position = offset + (audio.currentTime - startedAt!);
    expect(position).toBeGreaterThan(editedAt - startedAt!);

    for (let elapsed = 0; elapsed < 5000; elapsed += 100) {
      await h.tick(100);
      await settle(2);
    }
    expect(voice.heardAt(audio.currentTime)).toBe(false);
    expect(audio.sourcesOf(VOICE)).toEqual([voice]);
  }, 120_000);
});
