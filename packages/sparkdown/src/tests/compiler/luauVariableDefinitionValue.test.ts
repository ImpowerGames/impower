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

const STATEMENT_MARK_STOP = "|(?=(?:[^\\S\\n\\r])*[&])";
const CLOSERS = "[,;)\\]}])";
const NARRATIVE_CLOSERS = "[,;)\\]}&])";

const bounded = (p: { include: string }) => {
  const twin = `LuauSparkdownExplicit${p.include.slice("#Luau".length)}`;
  return repository[twin] ? { include: `#${twin}` } : p;
};

describe("the two declaration rules", () => {
  test("share their begin but for the modifier's shape and the comments after it, their captures but for the comment, and their end but for the comment's and the narrative one's stop before an `&`", () => {
    const luau = repository["LuauVariableDefinition"]!;
    const narrative = repository["LuauSparkdownVariableDefinition"]!;
    const ws = "((?:[^\\S\\n\\r])*)";
    expect(luau.begin!.startsWith(`${ws}((?:local\\b|(?:(?:(?:store|const)\\b)(?:(?=`)).toBe(true);
    expect(luau.begin!.endsWith(`)${ws}`)).toBe(true);
    expect(narrative.begin!.startsWith(`${ws}(\\b(?:store|local|const)\\b)\\b${ws.slice(0, -1)}`)).toBe(true);
    expect(narrative.begin!.endsWith(")*)")).toBe(true);
    const captures = (rule: typeof luau) => rule.beginCaptures as Record<string, { patterns: Patterns }>;
    expect({ ...captures(narrative), 3: { ...captures(narrative)[3], patterns: captures(narrative)[3]!.patterns.slice(1) } }).toEqual(
      captures(luau),
    );
    expect(captures(narrative)[3]!.patterns[0]).toEqual({ include: "#LuauComment" });
    expect(narrative.end!.endsWith(STATEMENT_MARK_STOP)).toBe(true);
    expect(luau.end!).not.toContain(STATEMENT_MARK_STOP);
    expect(luau.end!.startsWith(`${narrative.end!.slice(0, -STATEMENT_MARK_STOP.length)}|(?<=`)).toBe(true);
  });
});

describe("the narrative assignment rules", () => {
  test("a narrative name assignment is the Luau one but for its operation, its end at a later line's first token and its stop before an `&`", () => {
    const luau = repository["LuauVariableAssignment"]!;
    const narrative = repository["LuauSparkdownVariableAssignment"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(
      luau.patterns!.map((p) => p.include === "#LuauAssignmentOperation" ? { include: "#LuauSparkdownAssignmentOperation" } : bounded(p)),
    ).toEqual(narrative.patterns);
    expect(narrative.end!).toContain(NARRATIVE_CLOSERS);
    const narrativeEnd = narrative.end!.replace(NARRATIVE_CLOSERS, CLOSERS);
    const afterComment = narrativeEnd.lastIndexOf("|(?<=\\]=*\\])");
    expect(afterComment).toBeGreaterThan(0);
    expect(luau.end!.startsWith(`${narrativeEnd.slice(0, afterComment)}|(?<=^`)).toBe(true);
  });

  test("a narrative assignment operation is the Luau one without the line break and its ends, and with a stop before an `&`", () => {
    const luau = repository["LuauAssignmentOperation"]!;
    const narrative = repository["LuauSparkdownAssignmentOperation"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(luau.patterns!.filter((p) => p.include !== "#LuauAssignmentLineBreak").map(bounded)).toEqual(narrative.patterns);
    expect(luau.patterns!.map((p) => p.include)).toContain("#LuauAssignmentLineBreak");
    const lineEnds = "(?=$|^|";
    const at = narrative.end!.indexOf(lineEnds);
    expect(at).toBeGreaterThan(0);
    expect(luau.end!.startsWith(`${narrative.end!.slice(0, at)}(?=^|`)).toBe(true);
    expect(narrative.end!.indexOf(NARRATIVE_CLOSERS, at)).toBeGreaterThan(at);
    expect(luau.end!).toContain(CLOSERS);
    const groupEnd = narrative.end!.indexOf(NARRATIVE_CLOSERS, at) + NARRATIVE_CLOSERS.length;
    expect(luau.end!.endsWith(narrative.end!.slice(groupEnd))).toBe(true);
  });
});
