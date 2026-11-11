import { describe, expect, it } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import type { ScriptLocation } from "../../game/core/types/ScriptLocation";
import { beatDrawing, type Delivery } from "../../game/core/utils/beatDrawing";

const line = (text: string, source: ScriptLocation = [0, 7, 4, 7, 20]): Instructions =>
  ({
    kind: "dialogue",
    source,
    text: {
      character_name: [{ text: "HERO" }],
      dialogue: [{ text, after: 0, over: 0.03 }],
    },
    end: 1,
  }) as Instructions;

const shown = line("The second line.");

const cases: [string, Instructions, Delivery, Instructions | undefined, "typed" | "settled"][] = [
  ["a redelivery of the line on screen, unchanged", line("The second line."), "redelivery", shown, "settled"],
  ["a redelivery whose text changed", line("The second line, edited."), "redelivery", shown, "typed"],
  ["a redelivery of another line with the same text", line("The second line.", [0, 10, 4, 10, 20]), "redelivery", shown, "typed"],
  ["a redelivery with nothing on screen", line("The second line."), "redelivery", undefined, "typed"],
  [
    "a redelivery the settled drawing cannot finish",
    { ...line("The second line."), image: { portrait: [{ control: "show" }] } } as unknown as Instructions,
    "redelivery",
    { ...shown, image: { portrait: [{ control: "show" }] } } as unknown as Instructions,
    "typed",
  ],
  ["a landing on the line on screen, unchanged", line("The second line."), "landing", shown, "typed"],
  ["a landing on a changed line", line("The second line, edited."), "landing", shown, "typed"],
];

describe("a delivered beat is typed or settled (#2031)", () => {
  it.each(cases)("%s", (_, beat, delivery, onScreen, drawing) => {
    expect(beatDrawing(beat, delivery, onScreen)).toBe(drawing);
  });
});
