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
    const narrativeStart = narrative.begin!.slice(0, -2);
    expect(narrative.begin!.endsWith("))")).toBe(true);
    expect(luau.begin!.startsWith(`${narrativeStart}|`)).toBe(true);
    expect(luau.begin!.endsWith("))")).toBe(true);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
  });

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
