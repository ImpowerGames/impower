// #637 — every line origin/main's preview reaches is reached, showing either
// the value the program's own run gives or, where the search that follows the
// program falls back (`planRoute`), the value origin/main's route gives. A
// route that forces a loop's exit at its first test, because the routes that
// run the loop's menus spend the search's levels first, shows origin/main's
// value too: origin/main's route leaves every such loop there.
//
// What origin/main's preview shows for each script (routeReachesCases.ts) is
// a literal, read by running the same scripts on origin/main 8e2ef08ec's
// sources: an oracle that ran this branch's engine could not see a difference
// in the engine itself.

import { describe, expect, test } from "vitest";
import { CASES, compileSrc, preview } from "./routeReachesCases";

/** Whether origin/main's preview reaches each script's line, and the value it
 *  shows there. */
const MAIN: Record<string, { reached: boolean; value: number }> = {
  "a while loop inside a called function": { reached: true, value: 0 },
  "a loop of 600 menus": { reached: true, value: 0 },
  "a loop of 40,000 passes with no beat": { reached: true, value: 0 },
  "a menu that can repeat forever": { reached: true, value: 0 },
  "a long call before the first condition": { reached: true, value: 150000 },
  "a skipped branch before a long loop": { reached: true, value: 0 },
  "a skipped branch beside a loop of heavy calls that never ends": {
    reached: true,
    value: 0,
  },
  "a loop inside a forced branch": { reached: true, value: 0 },
  "a loop that never ends inside a branch after the line's": {
    reached: true,
    value: 0,
  },
  "nested forced branches before a loop that never ends": {
    reached: true,
    value: 0,
  },
  "a loop of 5,000 passes with a branch in it": { reached: true, value: 0 },
  "a loop of 60,000 passes with a branch in it": { reached: true, value: 0 },
  "an assertion that holds on one choice only": { reached: true, value: 1 },
  "a condition that holds on one choice only": { reached: true, value: 1 },
  "an assertion that holds on one pass's choice only": {
    reached: false,
    value: 0,
  },
  "a break inside a loop": { reached: true, value: 0 },
  "a branch around a loop": { reached: true, value: 0 },
  "a loop in a choose block's preamble": { reached: true, value: 0 },
  "menus inside a condition after a loop": { reached: true, value: 0 },
  "eight menus after a loop": { reached: true, value: 0 },
  "twelve menus after a loop": { reached: true, value: 0 },
  "six menus after a skipped branch": { reached: true, value: 0 },
  "a loop of 10 menus before a skipped branch": { reached: true, value: 0 },
  "a loop of 20 menus before a skipped branch": { reached: true, value: 0 },
  "a loop of 40 menus before a skipped branch": { reached: true, value: 0 },
  "a choice with a condition before twelve menus": { reached: true, value: 1 },
};

describe("a preview reaches every line origin/main's preview reaches", () => {
  test("every script has origin/main's outcome", () => {
    expect(CASES.map(([name]) => name).sort()).toEqual(
      Object.keys(MAIN).sort(),
    );
  });

  test.each(CASES)(
    "%s",
    (name, lines, label, store, shows) => {
      const main = MAIN[name]!;
      const head = preview(compileSrc(lines.join("\n")), lines, label, store);
      if (main.reached) {
        expect(head.reached).toBe(true);
      }
      if (head.fellBack) {
        expect(shows).toBe("main");
      }
      expect(head.value).toEqual(shows === "main" ? main.value : shows);
    },
    300_000,
  );
});
