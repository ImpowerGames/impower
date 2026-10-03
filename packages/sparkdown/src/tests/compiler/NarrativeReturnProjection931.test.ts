import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";
import { checkerTextUnits, normalizeNarrativeReturnScopes, textDocumentPosition } from "./luauCheckerText";
import { checkerView } from "./luauCheckerView";
import { jsonLocation, jsonNodes, parseOfficialTree, withoutLocations } from "./officialAstTestUtils";
import { printOfficialAst } from "./printOfficialAst";
import type { Json } from "./officialLuau";

function readings(text: string, corrupt?: (actual: Json) => void) {
  const tree = parseSource(text);
  const extracted = checkerTextUnits(tree, text);
  const converted = readLuauUnits(tree, text);
  return [extracted.prelude, ...extracted.flows].map((unit, i) => {
    const official = parseOfficialTree(unit.text);
    const ours = [converted.prelude, ...converted.flows][i]!;
    const actual = printOfficialAst(ours.root, checkerView(text, extracted.anyName));
    corrupt?.(actual);
    const expected = official.errors.length ? official.root : normalizeNarrativeReturnScopes(official.root, unit);
    return { unit, official, ours, actual, expected };
  });
}
function locationPairs(text: string, corrupt?: (actual: Json) => void) {
  return readings(text, corrupt).flatMap(({ unit, expected, actual }) => {
    const realNodes = (root: Json) => {
      const nodes = jsonNodes(root);
      if (unit.kind !== "flow") return nodes;
      // The unit root and __flow function are synthesized, with no written
      // tokens to locate. Its parameters and every body statement still
      // participate, including real blocks and nested function definitions.
      const block = root as { [key: string]: Json };
      const flow = (block["body"] as { [key: string]: Json }[])[0]!;
      const fn = flow["func"] as { [key: string]: Json };
      const synthetic = new Set([root, flow, fn, fn["body"]]);
      return nodes.filter((node) => !synthetic.has(node));
    };
    const theirs = realNodes(expected);
    const mine = realNodes(actual);
    expect(mine.map((n) => n["type"])).toEqual(theirs.map((n) => n["type"]));
    return theirs.map((node, i) => {
      const location = jsonLocation(node);
      const mapped = { begin: textDocumentPosition(unit, location.begin), end: textDocumentPosition(unit, location.end) };
      const real = jsonLocation(mine[i]!);
      return { mapped, actual: { begin: { line: real.begin.line, character: real.begin.column }, end: { line: real.end.line, character: real.end.column } } };
    });
  });
}
function agrees(text: string, scopeCount: number) {
  const units = readings(text);
  expect(units.reduce((count, result) => count + (result.unit.returnScopes?.length ?? 0), 0)).toBe(scopeCount);
  for (const { official, ours, actual, expected } of units) {
    expect(official.errors.map((e) => e.message)).toEqual([]);
    expect(ours.errors.map((e) => e.message)).toEqual([]);
    expect(withoutLocations(actual)).toEqual(withoutLocations(expected));
  }
  for (const { mapped, actual } of locationPairs(text)) expect(actual).toEqual(mapped);
}

describe("independent narrative-return oracle projection", () => {
  test("the complete return-before-prose fixture agrees ordinarily", () => {
    agrees(readFileSync(new URL("./__snapshots__/grammar/luau-function/return-before-prose.sd", import.meta.url), "utf8"), 5);
  });
  test.each([
    ["& return 1, 2\nProse.\n& f()\n", 1],
    ["scene a\n  & local x = 5 return x\n  Prose.\n  & local y = x\n  & return y\nend\n", 2],
    ['scene a\n  & f("é😀") return "é😀", 2\n  Prose.\n  & f("after")\nend\n', 1],
    ["scene a\n  if true then\n    & return 5\n    Prose.\n    & f()\n  end\nend\n", 1],
    ["& return 5 -- comment\nProse.\n& f()\n", 1],
    ["scene a\n  & local f = function() return 5 end\n  & return f()\n  Prose.\n  & f()\nend\n", 1],
  ])("keeps values, bindings, following statements and positions: %s", agrees);

  test("a real function's invalid final return remains an official syntax error", () => {
    const [result] = readings("function f()\n  return 5\n  local x = 6\nend\n");
    expect(result!.unit.returnScopes ?? []).toEqual([]);
    expect(result!.official.errors.length).toBeGreaterThan(0);
    expect(result!.ours.errors.length).toBeGreaterThan(0);
  });
  test("malformed narrative return values remain syntax errors", () => {
    const [result] = readings("& return 1,\nProse.\n");
    expect(result!.official.errors.length).toBeGreaterThan(0);
    expect(result!.ours.errors.length).toBeGreaterThan(0);
  });
  test("normalization rejects missing or unexpected synthetic wrapper shapes", () => {
    const [result] = readings("& return 5\nProse.\n");
    expect(() => normalizeNarrativeReturnScopes({ type: "AstStatBlock", body: [] }, result!.unit)).toThrow("wrappers missing");
    const mutated = JSON.parse(JSON.stringify(result!.official.root)) as { body: { body: Json[] }[] };
    mutated.body[0]!.body.push({ type: "AstStatReturn", list: [] });
    expect(() => normalizeNarrativeReturnScopes(mutated as unknown as Json, result!.unit)).toThrow("Unexpected official");
  });
  test("value and following-statement mutations remain detectable", () => {
    for (const value of [5, 6]) {
      const [mutated] = readings("& return 5\nProse.\n& f(6)\n", (actual) => {
        const literal = jsonNodes(actual).find((n) => n["type"] === "AstExprConstantNumber" && n["value"] === value);
        expect(literal == null).toBe(false);
        literal!["value"] = 9;
      });
      expect(withoutLocations(mutated!.actual)).not.toEqual(withoutLocations(mutated!.expected));
    }
  });
  test("return-location mutations remain detectable after insertion mapping", () => {
    const pairs = locationPairs('& f("é😀") return 5\nProse.\n& f()\n', (actual) => {
      const returned = jsonNodes(actual).find((n) => n["type"] === "AstStatReturn");
      expect(returned == null).toBe(false);
      const location = jsonLocation(returned!);
      returned!["location"] = `${location.begin.line},${location.begin.column + 1} - ${location.end.line},${location.end.column + 1}`;
    });
    expect(pairs.some((pair) => JSON.stringify(pair.actual) !== JSON.stringify(pair.mapped))).toBe(true);
  });
});
