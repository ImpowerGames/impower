// Sparkdown and Luau's parser must agree on which Luau inputs have syntax
// errors (#1284, the first check of #1283).
//
// For every Luau fixture, the document is compiled with `SparkdownCompiler`
// and its syntax errors are collected, and the fixture's Luau is parsed with
// the pinned official C++ parser. Where Sparkdown reports
// no syntax error the parser must report none, and where Sparkdown reports one
// the parser must report at least one.
//
// The inputs are found, not listed (`luauFixtures.ts`), so a fixture added
// under either directory is checked without editing this file. The
// conformance files are Luau as written, so the parser reads the patched file
// itself in the function the harness wraps it in, not text taken from
// Sparkdown's tree: a token the tree loses would otherwise vanish from both
// readings and hide the disagreement.
//
// `KNOWN_DISAGREEMENTS` names the inputs on which the two disagree, each with
// its bug or intentional limitation. Bugs must still disagree until their fix
// removes the entry. Integer limitations remain after #1309 closes and require
// Luau to accept the input while Sparkdown reports its unsupported diagnostic.

import { describe, expect, test } from "vitest";
import { KNOWN_DISAGREEMENTS, luauInputs } from "./luauFixtures";
import { readings } from "./luauSyntaxReadings";

const ALL_INPUTS = luauInputs();
const known = new Map(KNOWN_DISAGREEMENTS.map((entry) => [entry.fixture, entry]));

describe("Sparkdown and Luau's parser agree on which Luau inputs have syntax errors", () => {
  test("finds the inputs and lists each known disagreement once, for an input that exists", () => {
    expect(ALL_INPUTS.some((input) => input.name.startsWith("grammar/"))).toBe(true);
    expect(ALL_INPUTS.some((input) => input.name.startsWith("conformance/"))).toBe(true);
    const names = new Set(ALL_INPUTS.map((input) => input.name));
    expect(KNOWN_DISAGREEMENTS.filter((entry) => !names.has(entry.fixture)).map((entry) => entry.fixture)).toEqual([]);
    expect(known.size).toBe(KNOWN_DISAGREEMENTS.length);
  });

  for (const input of ALL_INPUTS) {
    test(input.name, () => {
      const { sparkdown, luau } = readings(input);
      const report = [
        `Sparkdown's syntax errors: ${sparkdown.length ? `\n  ${sparkdown.join("\n  ")}` : "none"}`,
        `Luau's parse errors: ${luau.length ? `\n  ${luau.join("\n  ")}` : "none"}`,
      ].join("\n");
      const agree = sparkdown.length > 0 === luau.length > 0;
      const entry = known.get(input.name);
      if (entry?.limitation) {
        expect(luau, report).toEqual([]);
        expect(sparkdown.some((error) => error.endsWith(entry.limitation!.diagnostic)), report).toBe(true);
        expect(sparkdown.filter((error) => error.endsWith("Malformed number")), report).toEqual([]);
      } else if (entry) {
        expect(
          agree,
          `${input.name} no longer disagrees. Remove its entry (#${entry.issue}) from KNOWN_DISAGREEMENTS in the pull request that fixed it.\n${report}`,
        ).toBe(false);
      } else {
        expect(
          agree,
          `${input.name}: Sparkdown and Luau's parser disagree on whether it has a syntax error. Fix the disagreement, or add an entry naming the open issue that explains it to KNOWN_DISAGREEMENTS.\n${report}`,
        ).toBe(true);
      }
    }, 120_000);
  }
});
