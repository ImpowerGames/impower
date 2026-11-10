import { describe, expect, test } from "vitest";
import {
  closeMatch,
  closeMatchData,
  closeMatchDistance,
  closeMatchOf,
  expectedTextOf,
} from "../../compiler/utils/closeMatch";

describe("close match", () => {
  test.each([
    ["alcie", ["alice", "bob"], "alice"],
    ["alcie", ["alice", "alcid"], undefined],
    ["alcie", ["bob", "carol"], undefined],
    ["alcie", [], undefined],
    ["backdrp", ["backdrop", "portrait"], "backdrop"],
    ["backgrnd", ["background"], "background"],
    ["backgrnd", ["background", "backgrounds"], "background"],
    ["backround", ["background", "backgroundx"], undefined],
    ["bob", ["bab", "bub"], undefined],
    ["bob", ["bab"], "bab"],
    ["bo", ["bob"], undefined],
    ["alcie", ["alice", "alice"], "alice"],
    ["alcie", ["$default", "alice"], "alice"],
    ["alcie", ["$alcie"], undefined],
    ["alice", ["alice"], undefined],
    ["Alice", ["alice"], "alice"],
    ["portrait", ["potrait", "portraits"], undefined],
    ["warrior", ["wizard"], undefined],
  ] as const)("%s among %j is %s", (name, candidates, expected) => {
    expect(closeMatch(name, candidates)).toBe(expected);
  });

  test.each([
    ["ab", 0],
    ["abc", 1],
    ["alice", 1],
    ["alicea", 2],
    ["background_music", 2],
  ] as const)("the distance bound for %s is %i", (name, bound) => {
    expect(closeMatchDistance(name)).toBe(bound);
  });

  test("its data names the unresolved name, the match and the text it expects, and reads back", () => {
    const data = closeMatchData("alcie", ["alice"]);
    expect(data).toEqual({
      closeMatch: { name: "alcie", match: "alice" },
      expect: "alcie",
    });
    expect(closeMatchOf(data)).toEqual({ name: "alcie", match: "alice" });
    expect(expectedTextOf(data)).toBe("alcie");
    expect(closeMatchData("alcie", ["bob"])).toBeUndefined();
  });

  test.each([undefined, null, {}, [], { closeMatch: { name: 1 } }, { expect: 2 }])(
    "reads nothing from %j",
    (data) => {
      expect(closeMatchOf(data)).toBeUndefined();
      expect(expectedTextOf(data)).toBeUndefined();
    },
  );
});
