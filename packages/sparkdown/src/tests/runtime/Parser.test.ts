// Ported from inkjs `src/tests/specs/ink/Parser.spec.ts`.
//
// Every test in inkjs's Parser spec is either a unit test against the
// hand-rolled `StringParser` class (replaced by textmate-grammar-tree in
// sparkdown) or against ink's character-range identifier syntax (replaced
// by sparkdown's `LUAU_IDENTIFIER` rule, which already accepts Unicode
// via `\p{L}` but uses different declaration keywords). Everything in
// this file is therefore closed by design.

import { describe, test } from "vitest";

describe.skip("Parser — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  // inkjs `StringParser.Interleave` unit tests — replaced by
  // textmate-grammar-tree, no equivalent class.
  test("StringParser.Interleave A", () => {});
  test("StringParser.Interleave ABAB", () => {});
  test("StringParser.Interleave ABA optional", () => {});
  test("StringParser.Interleave ABA optional 2", () => {});
  test("StringParser.Interleave B", () => {});

  // Unicode-identifier tests — sparkdown's `LUAU_IDENTIFIER` already
  // accepts Unicode via `\p{L}`, but the inkjs fixtures use `VAR`/
  // `CONST` declarations with ink-specific character-range pragmas
  // that don't have a clean sparkdown rewrite.
  test("character-range identifier in const (ASCII prefix)", () => {});
  test("character-range identifier in const (ASCII suffix)", () => {});
  test("character-range identifier in variable (ASCII prefix)", () => {});
  test("character-range identifier in variable (ASCII suffix)", () => {});
  test("character-range identifier in divert (ASCII prefix)", () => {});
  test("character-range identifier in divert (ASCII suffix)", () => {});
});
