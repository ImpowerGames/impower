import { describe, expect, it } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import type { ScriptLocation } from "../../game/core/types/ScriptLocation";
import { beatDrawing, type Delivery } from "../../game/core/utils/beatDrawing";

const line = (
  text: string,
  extra: Partial<Instructions> = {},
  speaker = "HERO",
  source: ScriptLocation = [0, 7, 4, 7, 20],
  pace = 0.03,
  style?: Record<string, string>,
): Instructions =>
  ({
    kind: "dialogue",
    speaker: { name: speaker, parenthetical: "" },
    source,
    text: {
      character_name: [{ text: speaker }],
      dialogue: [
        { text: text.slice(0, 4), after: 0, over: pace, ...(style ? { style } : {}) },
        { text: text.slice(4), after: pace * 4, over: pace, ...(style ? { style } : {}) },
      ],
    },
    audio: { typewriter: [{ control: "play", after: 0 }] },
    end: 1,
    ...extra,
  }) as Instructions;

const portrait = (pose: string): Partial<Instructions> => ({
  image: { portrait: [{ control: "show", assets: [pose] }] },
});

const music = { audio: { music: [{ control: "start", assets: ["rain"] }] } } as Partial<Instructions>;
const voice = { audio: { voice: [{ control: "play", assets: ["bell"] }] } } as Partial<Instructions>;
const sound = { audio: { sound: [{ control: "play", assets: ["door"] }] } } as Partial<Instructions>;
const load = { load: [{ name: "chapter" }] } as Partial<Instructions>;
const cutscene = { cutscene: [{ name: "intro" }] } as Partial<Instructions>;

type Row = {
  name: string;
  beat: Instructions;
  delivery: Delivery;
  onScreen: Instructions | undefined;
  atOnce: boolean;
  kept?: (keyof Instructions)[];
  audio?: string[];
};

const shownBeat = line("The second line.");

const rows: Row[] = [
  { name: "plain text, unchanged", beat: line("The second line."), delivery: "redelivery", onScreen: shownBeat, atOnce: true, audio: [] },
  { name: "text with a portrait", beat: line("The second line.", portrait("smile")), delivery: "redelivery", onScreen: line("The second line.", portrait("smile")), atOnce: true, kept: ["image"] },
  { name: "text with music", beat: line("The second line.", music), delivery: "redelivery", onScreen: line("The second line.", music), atOnce: true, audio: ["music"] },
  { name: "text with a voice line, left for the audio module to skip",beat: line("The second line.", voice), delivery: "redelivery", onScreen: line("The second line.", voice), atOnce: true, audio: ["voice"] },
  { name: "text with a sound, left for the audio module to skip",beat: line("The second line.", sound), delivery: "redelivery", onScreen: line("The second line.", sound), atOnce: true, audio: ["sound"] },
  { name: "text with a load, which still runs", beat: line("The second line.", load), delivery: "redelivery", onScreen: line("The second line.", load), atOnce: true, kept: ["load"] },
  { name: "text with a cutscene, which still runs", beat: line("The second line.", cutscene), delivery: "redelivery", onScreen: line("The second line.", cutscene), atOnce: true, kept: ["cutscene"] },
  { name: "a line moved down by an insertion above", beat: line("The second line.", {}, "HERO", [0, 8, 4, 8, 20]), delivery: "redelivery", onScreen: shownBeat, atOnce: true },
  { name: "the same line with a changed portrait", beat: line("The second line.", portrait("frown")), delivery: "redelivery", onScreen: line("The second line.", portrait("smile")), atOnce: true, kept: ["image"] },
  { name: "the same words with a slower typewriter", beat: line("The second line.", {}, "HERO", [0, 7, 4, 7, 20], 0.06), delivery: "redelivery", onScreen: shownBeat, atOnce: true },
  {
    name: "the same words grouped into other events, as a zero pace groups them",
    beat: {
      ...line("The second line."),
      text: {
        character_name: [{ text: "HERO" }],
        dialogue: [{ text: "The second line.", after: 0, over: 0 }],
      },
    } as Instructions,
    delivery: "redelivery",
    onScreen: shownBeat,
    atOnce: true,
  },
  {
    name: "the same styled words without the empty event a bare wait leaves",
    beat: line("The second line.", {}, "HERO", [0, 7, 4, 7, 20], 0.03, { font_style: "italic" }),
    delivery: "redelivery",
    onScreen: (() => {
      const shown = line("The second line.", {}, "HERO", [0, 7, 4, 7, 20], 0.03, { font_style: "italic" });
      const [first, rest] = shown.text!["dialogue"]!;
      shown.text!["dialogue"] = [first!, { text: "", after: 0.2 }, rest!];
      return shown;
    })(),
    atOnce: true,
  },
  { name: "the same words in a new style", beat: line("The second line.", {}, "HERO", [0, 7, 4, 7, 20], 0.03, { font_style: "italic" }), delivery: "redelivery", onScreen: shownBeat, atOnce: false },
  { name: "a line edited by one character", beat: line("The second line!"), delivery: "redelivery", onScreen: shownBeat, atOnce: false },
  { name: "the same text from a different speaker", beat: line("The second line.", {}, "VILLAIN"), delivery: "redelivery", onScreen: shownBeat, atOnce: false },
  { name: "a redelivery with nothing on screen", beat: line("The second line."), delivery: "redelivery", onScreen: undefined, atOnce: false },
  { name: "a landing on the line on screen, unchanged", beat: line("The second line."), delivery: "landing", onScreen: shownBeat, atOnce: false },
];

const wordsOf = (beat: Instructions) =>
  Object.values(beat.text ?? {}).map((events) => events.map((e) => [e.text, e.style]));

describe("a delivered beat is drawn typed, or with its text complete at once (#2031)", () => {
  it.each(rows)("$name", ({ beat, delivery, onScreen, atOnce, kept, audio }) => {
    const drawn = beatDrawing(beat, delivery, onScreen);
    expect(drawn.extended).toBeUndefined();
    expect(wordsOf(drawn)).toEqual(wordsOf(beat));
    if (!atOnce) {
      expect(drawn).toBe(beat);
      return;
    }
    const events = Object.values(drawn.text ?? {}).flat();
    expect(events.every((e) => e.after === 0 && e.over === 0)).toBe(true);
    expect(drawn.end).toBe(0);
    expect(drawn.redelivered).toBe(true);
    expect(Object.keys(drawn.audio ?? {})).toEqual(audio ?? []);
    for (const key of kept ?? []) {
      expect(drawn[key]).toEqual(beat[key]);
    }
  });
});
