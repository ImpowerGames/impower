import type { SyntaxNode } from "@lezer/common";
import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "../program/programHarness";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

const repository = GRAMMAR_DEFINITION.repository as Record<string, { begin?: string; match?: string }>;

function nodesNamed(source: string, name: string): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  parseSource(source).iterate({
    enter(ref) {
      if (ref.name === name) found.push(ref.node);
    },
  });
  return found;
}

function ancestorNames(node: SyntaxNode): string[] {
  const names: string[] = [];
  for (let n = node.parent; n; n = n.parent) names.push(n.name);
  return names;
}

describe("a header's block comments belong to its keyword's begin", () => {
  test.each([
    ["define", "LuauDefine", "define --[[ c ]] Person with\n  name = \"a\"\nend\n", "Person"],
    ["style", "LuauStyle", "style --[[ note ]] banner {\n  color = red\n}\n", "banner"],
    ["animation", "LuauAnimation", "animation --[=[ c ]=] fade {\n  keyframes {\n    from { opacity = 0 }\n  }\n}\n", "fade"],
    ["theme", "LuauTheme", "theme --[[ a]b ]] t {\n  colors { primary = red }\n}\n", "t"],
    ["morph", "LuauMorph", "morph --[[ c ]] --[[ d ]] m {\n  method = bend\n}\n", "m"],
    ["layout", "LuauLayout", "layout --[[ note ]] hud {\n  text \"hi\"\n}\n", "hud"],
    ["screen", "LuauScreen", "screen --[[ c ]] hud {\n}\n", "hud"],
    ["component", "LuauComponent", "component --[[ note ]] card {\n  text \"card\"\n}\n", "card"],
  ])("%s reads its name after the comment, which its begin holds", (_, rule, source, name) => {
    const comments = nodesNamed(source, "LuauBlockComment");
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) expect(ancestorNames(comment)).toContain(`${rule}_begin`);
    const names = nodesNamed(source, "LuauDefineName").map((node) => source.slice(node.from, node.to));
    expect(names).toEqual([name]);
  });

  test("a type function reads its name after the comment, which its begin holds", () => {
    const source = "export type function --[[ c ]] Keys<T>(t) return t end\n";
    const [comment] = nodesNamed(source, "LuauBlockComment");
    expect(ancestorNames(comment!)).toContain("LuauFunctionTypeDeclaration_begin");
    expect(nodesNamed(source, "LuauTypeFunctionName").map((node) => source.slice(node.from, node.to))).toEqual(["Keys"]);
  });

  test.each([
    ["a close of another level inside it", "style --[====[a]=====] hidden ]====] banner {\n  color = red\n}\n", "--[====[a]=====] hidden ]====] ", "banner"],
    ["a close of its level's prefix inside it", "style --[=[a]]=] --[====[b]====] two {\n  color = red\n}\n", "--[=[a]]=] ", "two"],
  ])("a comment with %s ends at its own level's close, and the name after it reads", (_, source, comment, name) => {
    const comments = nodesNamed(source, "LuauBlockComment");
    expect(source.slice(comments[0]!.from, comments[0]!.to)).toBe(comment);
    expect(nodesNamed(source, "LuauDefineName").map((node) => source.slice(node.from, node.to))).toEqual([name]);
    expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_");
  });

  test.each([
    "LuauDefineNameAndInheritance",
    "LuauStyleNameAndInheritance",
    "LuauAnimationThemeNameAndInheritance",
    "LuauScreenNameHeader",
    "LuauLayoutNameAndInheritance",
    "LuauComponentNameAndInheritance",
    "LuauTypeFunctionName",
  ])("%s opens only where its parent's begin ended", (rule) => {
    const pattern = repository[rule]!.begin ?? repository[rule]!.match!;
    expect(pattern.startsWith("\\G(")).toBe(true);
    expect(pattern).not.toContain("(?<=");
  });
});

describe("a ternary's clause `elseif` opens the scope its condition begins in", () => {
  test.each(["LuauTernaryExpressionCondition", "LuauSparkdownExplicitTernaryExpressionCondition"])(
    "%s opens only where its parent's begin ended",
    (rule) => {
      const begin = repository[rule]!.begin!;
      expect(begin.startsWith("\\G(")).toBe(true);
      expect(begin).not.toContain("(?<=");
    },
  );

  test.each([
    ["Luau code", "function f(c, n)\n  return if c then 1 elseif n then 2 elseif not n then 3 else 4\nend\n", "LuauTernaryElseifClause", "LuauTernaryExpressionCondition"],
    ["a store's value", "store c = true\nstore n = 1\nstore v = if c then 1 elseif n then 2 elseif not n then 3 else 4\n", "LuauSparkdownExplicitTernaryElseifClause", "LuauSparkdownExplicitTernaryExpressionCondition"],
  ])("each clause in %s holds its condition", (_, source, clause, condition) => {
    const clauses = nodesNamed(source, clause);
    expect(clauses.map((node) => source.slice(node.from, node.to).trim())).toEqual(["elseif n", "elseif not n"]);
    for (const node of clauses) {
      expect(nodesNamed(source, condition).filter((c) => c.from >= node.from && c.to <= node.to)).toHaveLength(1);
    }
  });

  test.each([
    ["true", "false", "big"],
    ["false", "true", "medium"],
    ["false", "false", "small"],
  ])("a story brace shows the clause's value when the conditions are %s and %s", (x, y, text) => {
    const { program } = compileScript(
      `store x = ${x}\nstore y = ${y}\nscene start\n  The value is {if x then "big" elseif y then "medium" else "small"}.\nend\n`,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((beat) => beat.text)).toEqual([`The value is ${text}.\n`]);
  });

  test("a store's value with clauses compiles without errors", () => {
    const { program } = compileScript(
      "store a = true\nstore b = false\nstore s = if a then 1 elseif b then 2 elseif not b then 3 else 4\nscene start\n  {s}\nend\n",
    );
    expect(errorsOf(program)).toEqual([]);
  });

  test("a clause without a condition reports the missing value where Luau reads it", () => {
    const { program } = compileScript("store a = true\nstore t = if a then 1 elseif then 2 else 3\nscene start\n  {t}\nend\n");
    expect(errorsOf(program)).toEqual([[1, "Expected identifier when parsing expression"]]);
  });
});
