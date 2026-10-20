// The Luau reassignment (`LuauReassignment`) and the narrative one
// (`LuauSparkdownReassignment`) must recognise the same statements and read
// the same values, or a reassignment would mean one thing in a function body
// and another in a scene. They differ only where #1147 made them differ: the
// Luau rule continues its target and value lists past a comma that ends its
// line (`LuauCommaLineBreak`), so it also begins at a target list that ends
// its line with a comma, and ends where the next line starts a statement;
// and where #1906 made them differ: the Luau rule reads an `=` that ends
// its line with `LuauAssignmentOperation`, which continues to the value on
// a later line, and the narrative rule with
// `LuauSparkdownAssignmentOperation`, which ends at its line; and where
// #1907 made them differ: the narrative rule's values are the bounded
// family's, which end at the line but for a bracket. The runtime cases in
// `TrailingCommaReassignment.test.ts` check the values themselves.

import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

type Patterns = { include: string }[];
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<
  string,
  { patterns?: Patterns; begin?: string; beginCaptures?: unknown; end?: string }
>;

describe("the two reassignment rules", () => {
  const luau = repository["LuauReassignment"]!;
  const narrative = repository["LuauSparkdownReassignment"]!;

  test("share their begin and captures, except the Luau rule's target list that ends its line", () => {
    // `({{WS}}*)(TARGETS)(?={{WS}}*(?:OPERATOR))` and
    // `({{WS}}*)(TARGETS)(?={{WS}}*(?:OPERATOR|,{{WS}}*(?:$|--)))`.
    const narrativeStart = narrative.begin!.slice(0, -2);
    expect(narrative.begin!.endsWith("))")).toBe(true);
    expect(luau.begin!.startsWith(`${narrativeStart}|`)).toBe(true);
    expect(luau.begin!.endsWith("))")).toBe(true);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
  });

  // The narrative rule reads its values with the bounded family's
  // counterparts, which end at the line (#1907).
  test("share their content, except the Luau rule's comma line break and assignment operation and the bounded values", () => {
    const bounded = (p: { include: string }) => {
      const twin = `LuauSparkdownExplicit${p.include.slice("#Luau".length)}`;
      return repository[twin] ? { include: `#${twin}` } : p;
    };
    expect(
      luau.patterns!
        .filter((p) => p.include !== "#LuauCommaLineBreak")
        .map((p) => p.include === "#LuauAssignmentOperation" ? { include: "#LuauSparkdownAssignmentOperation" } : bounded(p)),
    ).toEqual(narrative.patterns);
    expect(luau.patterns!.map((p) => p.include)).toContain("#LuauCommaLineBreak");
    expect(luau.patterns!.map((p) => p.include)).toContain("#LuauAssignmentOperation");
  });

  test("share their end, except the Luau rule's line-start statement end", () => {
    expect(luau.end!.startsWith(`${narrative.end!}|(?<=^`)).toBe(true);
  });
});

// A statement the Luau rule's line-start end misses is read as a value, since
// the reassignment reads values with `LuauExpression`. Its list is built on
// the declaration's stops and the statement line starts, so a keyword added
// to either reaches it too.
describe("LUAU_LIST_LINE_START_STATEMENT", () => {
  const variables = GRAMMAR_DEFINITION.variables as unknown as Record<string, string>;

  test("includes what ends a declaration and what begins a statement line", () => {
    const list = variables["LUAU_LIST_LINE_START_STATEMENT"]!;
    expect(list).toContain("{{LUAU_DECLARATION_STOP}}");
    expect(list).toContain("{{LUAU_STATEMENT_LINE_START}}");
  });

  test("reaches the Luau reassignment's end with the statements #1147's review found missing", () => {
    const end = repository["LuauReassignment"]!.end!;
    for (const token of ["goto", "continue", "elseif", "define", "style", "[:][:]"]) {
      expect(end).toContain(token);
    }
  });
});
