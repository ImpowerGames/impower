// The Luau reassignment (`LuauReassignment`) and the narrative one
// (`LuauSparkdownReassignment`) must recognise the same statements and read
// the same values, or a reassignment would mean one thing in a function body
// and another in a scene. They differ only where #1147 made them differ: the
// Luau rule continues its value list past a comma that ends its line
// (`LuauCommaLineBreak`), and so also ends where the next line starts a
// statement. The runtime cases in `TrailingCommaReassignment.test.ts` check
// the values themselves.

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

  test("share their begin and captures", () => {
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
  });

  test("share their content, except the Luau rule's comma line break", () => {
    expect(
      luau.patterns!.filter((p) => p.include !== "#LuauCommaLineBreak"),
    ).toEqual(narrative.patterns);
    expect(luau.patterns!.map((p) => p.include)).toContain("#LuauCommaLineBreak");
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
