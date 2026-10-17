// `LuauVariableDefinitionValue` is `LuauExpression` without the statements
// it reaches through `LuauExpressionDeclarations`, without the direct return statement
// and without bare keywords, so a Luau
// declaration whose comma ends its line cannot take the next line's `end`,
// `until` or `return` as a value. An expression form added to
// `LuauExpression` must be added there too, or it stops working as a later
// value in a declaration list. The runtime cases in
// `TrailingCommaValueList.test.ts` check the values themselves.

import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

type Patterns = { include: string }[];
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<
  string,
  { patterns?: Patterns; begin?: string; beginCaptures?: unknown; end?: string }
>;

describe("LuauVariableDefinitionValue", () => {
  test("excludes return statements, substitutes functions for declarations and `...` for keywords", () => {
    const expressions = repository["LuauExpression"]!.patterns!;
    expect(expressions).toContainEqual({ include: "#LuauReturnStatement" });
    const expected = expressions.filter((p) => p.include !== "#LuauReturnStatement").map((p) =>
      p.include === "#LuauExpressionDeclarations"
        ? { include: "#LuauFunctionDefinition" }
        : p.include === "#LuauKeyword"
          ? { include: "#LuauUnitKeywords" }
          : p,
    );
    expect(repository["LuauVariableDefinitionValue"]!.patterns).toEqual(expected);
    expect(repository["LuauVariableDefinitionValue"]!.patterns).not.toContainEqual({ include: "#LuauReturnStatement" });
  });
});

// The Luau and narrative declaration rules differ only in their content.
describe("the two declaration rules", () => {
  test("share their begin, captures and end", () => {
    const luau = repository["LuauVariableDefinition"]!;
    const narrative = repository["LuauSparkdownVariableDefinition"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(narrative.end).toBe(luau.end);
  });
});

// A narrative declaration or reassignment ends at its line, so its `=` is
// read by its own rules (#1906): `LuauSparkdownVariableAssignment` and
// `LuauSparkdownAssignmentOperation` are the Luau ones without the line
// break that carries an `=` ending its line to a value on a later line
// (`LuauAssignmentLineBreak`), and without the ends that line break needs.
describe("the narrative assignment rules", () => {
  test("a narrative name assignment is the Luau one but for its operation and its end at a later line's first token", () => {
    const luau = repository["LuauVariableAssignment"]!;
    const narrative = repository["LuauSparkdownVariableAssignment"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(
      luau.patterns!.map((p) => p.include === "#LuauAssignmentOperation" ? { include: "#LuauSparkdownAssignmentOperation" } : p),
    ).toEqual(narrative.patterns);
    expect(luau.end!.startsWith(`${narrative.end!}|(?<=^`)).toBe(true);
  });

  test("a narrative assignment operation is the Luau one without the line break and its ends", () => {
    const luau = repository["LuauAssignmentOperation"]!;
    const narrative = repository["LuauSparkdownAssignmentOperation"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(luau.patterns!.filter((p) => p.include !== "#LuauAssignmentLineBreak")).toEqual(narrative.patterns);
    expect(luau.patterns!.map((p) => p.include)).toContain("#LuauAssignmentLineBreak");
    // The narrative operation ends at a line end; the Luau one ends there
    // only past its `=`, and at a later line's first token.
    const lineEnds = "(?=$|^|";
    const at = narrative.end!.indexOf(lineEnds);
    expect(at).toBeGreaterThan(0);
    expect(luau.end!.startsWith(`${narrative.end!.slice(0, at)}(?=^|`)).toBe(true);
    const closers = "[,;)\\]}])";
    const groupEnd = narrative.end!.indexOf(closers, at) + closers.length;
    expect(luau.end!.endsWith(narrative.end!.slice(groupEnd))).toBe(true);
  });
});
