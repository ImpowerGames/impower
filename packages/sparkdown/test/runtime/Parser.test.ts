import { describe, test } from "vitest";

describe.skip("Parser — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("StringParser.Interleave A", () => {});
  test("StringParser.Interleave ABAB", () => {});
  test("StringParser.Interleave ABA optional", () => {});
  test("StringParser.Interleave ABA optional 2", () => {});
  test("StringParser.Interleave B", () => {});

  test("character-range identifier in const (ASCII prefix)", () => {});
  test("character-range identifier in const (ASCII suffix)", () => {});
  test("character-range identifier in variable (ASCII prefix)", () => {});
  test("character-range identifier in variable (ASCII suffix)", () => {});
  test("character-range identifier in divert (ASCII prefix)", () => {});
  test("character-range identifier in divert (ASCII suffix)", () => {});
});
