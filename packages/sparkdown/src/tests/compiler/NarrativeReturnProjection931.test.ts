import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";
import { checkerTextUnits, normalizeNarrativeReturnScopes, rawIslandSyntaxErrors, textDocumentPosition } from "./luauCheckerText";
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
    const projectedErrors = official.errors;
    const islandErrors = rawIslandSyntaxErrors(unit);
    const nativeErrors = [...projectedErrors, ...islandErrors.map(error => ({ message: error.message, location: {
      begin: { line: error.range.start.line, column: error.range.start.character },
      end: { line: error.range.end.line, column: error.range.end.character },
    } }))];
    const ours = [converted.prelude, ...converted.flows][i]!;
    const actual = printOfficialAst(ours.root, checkerView(text, extracted.anyName));
    corrupt?.(actual);
    const expected = official.errors.length ? official.root : normalizeNarrativeReturnScopes(official.root, unit);
    return { unit, official: { ...official, errors: nativeErrors }, projectedErrors, islandErrors, ours, actual, expected };
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
  for (const { official, islandErrors, ours, actual, expected } of units) {
    expect(islandErrors).toEqual([]);
    expect(official.errors.map((e) => e.message)).toEqual([]);
    expect(ours.errors.map((e) => e.message)).toEqual([]);
    expect(withoutLocations(actual)).toEqual(withoutLocations(expected));
  }
  for (const { mapped, actual } of locationPairs(text)) expect(actual).toEqual(mapped);
}

describe("independent narrative-return oracle projection", () => {
  for (const context of ["file", "scene", "branch"]) {
    test.each(["& return 5 f()", "& return 5; f()", "& return 5 end", "& return 5 else", "& return 5 until true", "& do return 5 f() end", "& return 5 --[[ comment ]] f()"])(`never hides a malformed same-line ${context} island: %s`, (line) => {
      const body = `${line}\nProse.\n& f()\n`;
      const text = context === "file" ? body : `${context} a\n${body}end\n`;
      const units = readings(text);
      expect(units.some((result) => result.official.errors.length > 0)).toBe(true);
      expect(units.some((result) => result.ours.errors.length > 0)).toBe(true);
      for (const result of units) expect(result.official.errors.length > 0).toBe(result.ours.errors.length > 0);
    });
  }
  test("an invalid follower keeps its written Unicode-adjusted token range", () => {
    const text = 'scene a\n  & return "é😀"; f()\n  Prose.\nend\n';
    const [result] = readings(text).filter((result) => result.unit.kind === "flow");
    expect(result!.official.errors.length).toBeGreaterThan(0);
    const error = result!.official.errors[0]!;
    expect(textDocumentPosition(result!.unit, error.location.begin)).toEqual({ line: 1, character: 18 });
    expect(textDocumentPosition(result!.unit, error.location.end)).toEqual({ line: 1, character: 19 });
  });
  test("keeps a legitimate written do closer and its real AST", () => {
    agrees("scene a\n  & do return 5 end\n  Prose.\n  & f()\nend\n", 0);
  });
  test("keeps a direct written repeat/until closer and following statement", () => {
    agrees("& repeat return 5 until true\nProse.\n& f()\n", 0);
  });
  test("raw written-island syntax cannot borrow a later independent until condition", () => {
    const source = "& repeat return 5 until\nProse.\n& f()\n";
    const result = readings(source)[0]!;
    expect(result.unit.rawIslands).toHaveLength(1);
    expect(result.projectedErrors).toEqual([]);
    expect(result.islandErrors).toEqual([{ message: "Expected identifier when parsing expression, got <eof>", range: {
      start: { line: 0, character: 23 }, end: { line: 0, character: 23 },
    } }]);
    expect(result.ours.errors.length).toBeGreaterThan(0);
    agrees("& repeat return 5 until true\nProse.\n& f()\n", 0);
  });
  test("bounded divert expressions retain the checker's complete structural view", () => {
    // The primary official location oracle accounts for the existing _G()
    // substitution's shorter synthetic spans in bounded-expression-family.sd.
    // This helper's strict location pairs remain reserved for written Luau.
    for (const { official, islandErrors, ours, actual, expected } of readings("& local target = -> place\nscene place\nProse.\nend\n")) {
      expect(islandErrors).toEqual([]);
      expect(official.errors).toEqual([]);
      expect(ours.errors).toEqual([]);
      expect(withoutLocations(actual)).toEqual(withoutLocations(expected));
    }
  });
  test("a genuine same-line function closer does not locate EOF in following story", () => {
    agrees("function f() return 5 end After.\nLater prose.\n", 0);
  });
  test.each([
    "--[[ a\nb ]]",
    "--[=[ é😀\nb ]=]",
    "; --[[ é😀\nb ]]",
  ])("keeps the complete multiline comment before a synthetic closer: %s", (comment) => {
    agrees(`& return 5 ${comment}\nProse.\n& f()\n`, 1);
  });
  test.each([
    "& repeat return 5",
    '& repeat return "until true"',
    "& repeat return 5 -- until true",
    "& repeat return 5 --[[ until true ]]",
    "& repeat return 5 until",
    "& return 5 --[[ unfinished\n",
    "& return 5 --[=[ unfinished\n",
    "& return 5 --[[ é😀\nb ]] f()",
    "& return 5; --[=[ é😀\nb ]=] f()",
  ])("does not turn comment/quoted closers or invalid suffixes into a valid unit: %s", (island) => {
    const units = readings(`${island}\nProse.\n& f()\n`);
    expect(units.some((result) => result.official.errors.length > 0)).toBe(true);
    expect(units.some((result) => result.ours.errors.length > 0)).toBe(true);
    for (const result of units) expect(result.official.errors.length > 0).toBe(result.ours.errors.length > 0);
  });
  test.each([
    "if true then return 5 end",
    "if false then return 1 elseif true then return 5 else return 2 end",
    "if true then if true then return 5 end end",
    "for i = 1, 2 do return i end",
    "while true do return 5 end",
    "repeat return 5 until true",
    "if (true) then & return 5; end",
    "if false then & return 1 elseif (true) then & return 5 else & return 2 end",
    "for i = 1, 2 do & return i end",
    "while (true) do & return 5 end",
    "repeat & return 5 until true",
  ])("keeps written nested island blocks and locations: %s", (body) => {
    agrees(`scene a\n  & do ${body} end\n  return to the village\n  & f()\nend\n`, 0);
  });
  test.each(["return 5 f()", "return 5; f()", "return: 5"])("never masks an invalid nested marked return: %s", (returned) => {
    const units = readings(`scene a\n  & do if true then & ${returned} end end\n  return to the village\nend\n`);
    expect(units.some((result) => result.official.errors.length > 0)).toBe(true);
    expect(units.some((result) => result.ours.errors.length > 0)).toBe(true);
    for (const result of units) expect(result.official.errors.length > 0).toBe(result.ours.errors.length > 0);
  });
  test.each(["& return 5;", "& return 5; -- comment", "& return 5; --[=[ comment ]=] -- comment", "& return 1, 2 --[[ comment ]]", "& do return 5 end -- comment", "& do do return 5 end end"])("preserves valid same-line delimiters and comments: %s", (line) => {
    agrees(`scene a\n  ${line}\n  Prose.\n  & f()\nend\n`, line.includes("do return") || line.includes("do do") ? 0 : 1);
  });
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
