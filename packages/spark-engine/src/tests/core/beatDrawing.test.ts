import { describe, expect, it } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import type { ScriptLocation } from "../../game/core/types/ScriptLocation";
import { beatDrawing, type Delivery } from "../../game/core/utils/beatDrawing";

const line = (
  text: string,
  extra: Partial<Instructions> = {},
  speaker = "HERO",
  source: ScriptLocation = [0, 7, 4, 7, 20],
): Instructions =>
  ({
    kind: "dialogue",
    speaker: { name: speaker, parenthetical: "" },
    source,
    text: {
      character_name: [{ text: speaker }],
      dialogue: [
        { text: text.slice(0, 4), after: 0, over: 0.03 },
        { text: text.slice(4), after: 0.12, over: 0.03 },
      ],
    },
    audio: { typewriter: [{ control: "play", after: 0 }] },
    end: 1,
    ...extra,
  }) as Instructions;

const portrait = (pose: string): Partial<Instructions> => ({
  image: { portrait: [{ control: "show", assets: [pose] }] },
});

const music = { audio: { music: [{ control: "start", assets: ["rain"] }] } };
const voice = { audio: { voice: [{ control: "play", assets: ["bell"] }] } };
const sound = { audio: { sound: [{ control: "play", assets: ["door"] }] } };
const load = { load: [{ name: "chapter" }] };
const cutscene = { cutscene: [{ name: "intro" }] };

const SHOWN = { character_name: 1, dialogue: 2 };

type Row = {
  name: string;
  beat: Instructions;
  delivery: Delivery;
  onScreen: Instructions | undefined;
  shown: Record<string, number> | undefined;
  kept?: (keyof Instructions)[];
  audio?: string[];
};

const shownBeat = line("The second line.");

const rows: Row[] = [
  { name: "plain text, unchanged", beat: line("The second line."), delivery: "redelivery", onScreen: shownBeat, shown: SHOWN, audio: [] },
  { name: "text with a portrait", beat: line("The second line.", portrait("smile")), delivery: "redelivery", onScreen: line("The second line.", portrait("smile")), shown: SHOWN, kept: ["image"] },
  { name: "text with music", beat: line("The second line.", music as any), delivery: "redelivery", onScreen: line("The second line.", music as any), shown: SHOWN, audio: ["music"] },
  { name: "text with a voice line, which still plays", beat: line("The second line.", voice as any), delivery: "redelivery", onScreen: line("The second line.", voice as any), shown: SHOWN, audio: ["voice"] },
  { name: "text with a sound, which still plays", beat: line("The second line.", sound as any), delivery: "redelivery", onScreen: line("The second line.", sound as any), shown: SHOWN, audio: ["sound"] },
  { name: "text with a load, which still runs", beat: line("The second line.", load as any), delivery: "redelivery", onScreen: line("The second line.", load as any), shown: SHOWN, kept: ["load"] },
  { name: "text with a cutscene, which still runs", beat: line("The second line.", cutscene as any), delivery: "redelivery", onScreen: line("The second line.", cutscene as any), shown: SHOWN, kept: ["cutscene"] },
  { name: "a line moved down by an insertion above", beat: line("The second line.", {}, "HERO", [0, 8, 4, 8, 20]), delivery: "redelivery", onScreen: shownBeat, shown: SHOWN },
  { name: "the same line with a changed portrait", beat: line("The second line.", portrait("frown")), delivery: "redelivery", onScreen: line("The second line.", portrait("smile")), shown: SHOWN, kept: ["image"] },
  { name: "a line edited by one character", beat: line("The second line!"), delivery: "redelivery", onScreen: shownBeat, shown: undefined },
  { name: "the same text from a different speaker", beat: line("The second line.", {}, "VILLAIN"), delivery: "redelivery", onScreen: shownBeat, shown: undefined },
  { name: "a redelivery with nothing on screen", beat: line("The second line."), delivery: "redelivery", onScreen: undefined, shown: undefined },
  { name: "a landing on the line on screen, unchanged", beat: line("The second line."), delivery: "landing", onScreen: shownBeat, shown: undefined },
];

describe("a delivered beat is drawn typed, or with its text already shown (#2031)", () => {
  it.each(rows)("$name", ({ beat, delivery, onScreen, shown, kept, audio }) => {
    const drawn = beatDrawing(beat, delivery, onScreen);
    expect(drawn.extended).toEqual(shown);
    expect(drawn.text).toEqual(beat.text);
    for (const key of kept ?? []) {
      expect(drawn[key]).toEqual(beat[key]);
    }
    if (shown) {
      expect(Object.keys(drawn.audio ?? {})).toEqual(audio ?? []);
    } else {
      expect(drawn).toBe(beat);
    }
  });
});
