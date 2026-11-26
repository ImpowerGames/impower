import { describe, expect, test } from "vitest";
import type { Instructions } from "../../src/game/core/types/Instructions";
import { describeShownBeat } from "../../src/game/core/utils/describeShownBeat";

const beat = (text: Record<string, string>, extra: Partial<Instructions> = {}): Instructions =>
  ({
    ...extra,
    text: Object.fromEntries(
      Object.entries(text).map(([target, written]) => [target, [{ text: written }]]),
    ),
  }) as Instructions;

describe("a shown beat names what it writes into a layout", () => {
  test("a beat that only writes a target names that target and its value", () => {
    expect(describeShownBeat(beat({ clock: "12:00" }))).toEqual({
      kind: null,
      words: "",
      write: { target: "clock", value: "12:00" },
    });
  });

  test("a beat that writes two targets names only the first", () => {
    expect(describeShownBeat(beat({ clock: "12:00", score: "5" })).write).toEqual({
      target: "clock",
      value: "12:00",
    });
  });

  test("a target written with nothing is skipped for the next one", () => {
    expect(describeShownBeat(beat({ clock: "  ", score: "5" })).write).toEqual({
      target: "score",
      value: "5",
    });
  });

  test("a beat with story words does not name the targets it also writes", () => {
    const described = describeShownBeat(beat({ action: "Rain falls.", clock: "12:00" }, { kind: "action" }));
    expect(described).toEqual({ kind: "action", words: "Rain falls." });
  });

  test("a menu does not name the targets it also writes", () => {
    const described = describeShownBeat(beat({ clock: "12:00" }, { options: ["Go"] }));
    expect(described.write).toBeUndefined();
  });

  test("a speaker's name alone is not a write", () => {
    expect(describeShownBeat(beat({ character_name: "ALICE" })).write).toBeUndefined();
  });
});
