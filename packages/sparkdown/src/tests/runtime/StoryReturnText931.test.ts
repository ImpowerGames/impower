import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";
import { compareEnginesFull, treeScopeStackAt } from "../compiler/scopeEquality";

const lines = ["return", "return 5", "return 1, 2", "return to the village", "return!", "return 5; -- still prose"];
const contexts = ["file", "scene", "branch", "conditional", "loop", "choice"] as const;
function sourceFor(context: typeof contexts[number], line: string) {
  const body = `  Before.\n  ${line}\n  After.\n`;
  if (context === "file") return `${body}done\n`;
  if (context === "scene") return `-> a\nscene a\n${body}  done\nend\n`;
  if (context === "branch") return `-> a.b\nscene a\nbranch b\n${body}  done\nend\nend\n`;
  if (context === "conditional") return `if true then\n${body}end\ndone\n`;
  if (context === "loop") return `for i = 1, 1 do\n${body}end\ndone\n`;
  return `choose\n  * [Take]\n${body.split("\n").map((s) => s ? `  ${s}` : s).join("\n")}    done\nend\n`;
}

describe("unmarked return in story scope is ordinary displayed text", () => {
  for (const context of contexts) test.each(lines)(`${context} displays %s and the next line`, (line) => {
    const ctx = makeRuntimeStoryFromSource(sourceFor(context, line));
    expect(ctx.errorMessages).toEqual([]);
    let output = ctx.story.ContinueMaximally();
    if (context === "choice") {
      expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["Take"]);
      ctx.story.ChooseChoiceIndex(0);
      output += ctx.story.ContinueMaximally();
    }
    expect(output).toBe(`Before.\n${line}\nAfter.\n`);
  });

  for (const context of contexts) test.each(lines)(`${context} parses and highlights %s as prose in both engines`, async (line) => {
    const source = sourceFor(context, line);
    const tree = parseSource(source);
    const returnNodes: string[] = [];
    const cursor = tree.cursor();
    do { if (cursor.name.endsWith("ReturnStatement")) returnNodes.push(source.slice(cursor.from, cursor.to)); } while (cursor.next());
    expect(returnNodes).toEqual([]);
    const scopes = treeScopeStackAt(tree, source.indexOf(line));
    expect(scopes).toContain("string.display.text.chunk.sd");
    expect(scopes.some((s) => s.includes("luau"))).toBe(false);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });

  test.each(contexts)("%s still diagnoses explicitly marked return", (context) => {
    const ctx = makeRuntimeStoryFromSource(sourceFor(context, "& return 5"));
    expect(ctx.errorMessages.filter((m) => /Return statements can only/.test(m))).toHaveLength(1);
  });

  test.each(["", "\n", "// between lines\n"])("an unfinished story & do leaves the next line as prose: %s", (between) => {
    const source = `scene a\n  & do\n${between}  return to the village\nend\n`;
    const tree = parseSource(source);
    expect(treeScopeStackAt(tree, source.indexOf("return to"))).toContain("string.display.text.chunk.sd");
  });
  test.each(["do\n    return 5\n  end", "& do\n    return 5\n  end", "& do\n    -- comment\n\n    return 5\n  end"])("a real function keeps its multiline do block: %s", (body) => {
    const ctx = makeRuntimeStoryFromSource(`Value {f()}.\nfunction f()\n  ${body}\nend\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
  test.each(["& do -- comment", "& do --[[ comment ]]", "& do do"])("a story island ends after %s", (island) => {
    const source = `${island}\nreturn to the village\n`;
    expect(treeScopeStackAt(parseSource(source), source.indexOf("return to"))).toContain("string.display.text.chunk.sd");
  });
  test.each(["", "& "])("a %sfunction expression keeps its multiline code body", (mark) => {
    const ctx = makeRuntimeStoryFromSource(`${mark}local f = function()\n  & do\n    return 5\n  end\nend\nValue {f()}.\ndone\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
  test.each(["", "  ", "\t"])("%s indentation leaves a return sentence as prose", (indent) => {
    const ctx = makeRuntimeStoryFromSource(`${indent}return to the village\ndone\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("return to the village\n");
  });
  test.each([
    ["local y = 5 x = y", 5],
    ["local f = function() return 5 end x = f()", 5],
    ["if true then x = 5 end", 5],
    ["if false then x = 1 elseif true then x = 5 else x = 2 end", 5],
    ["if false then x = 1 else x = 5 end", 5],
    ["if true then if true then x = 5 end end", 5],
    ["for i = 1, 2 do x += 1 end", 2],
    ["for _, value in ipairs({2, 3}) do x += value end", 5],
    ["while x < 2 do x += 1 end", 2],
    ["repeat x += 1 until x == 2", 2],
    ["do x = 5 end", 5],
    ["--[[comment]] x = 5", 5],
  ])("a bounded do preserves code effects: %s", async (body, value) => {
    const source = `store x = 0\n& do ${body} end\nreturn to the village\nValue {x}.\ndone\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(`return to the village\nValue ${value}.\n`);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each(["if true then return 5 end", "if false then return 1 elseif true then return 5 else return 2 end"])("a return inside explicit do/if is still code: %s", (body) => {
    const ctx = makeRuntimeStoryFromSource(`& do ${body} end\nreturn to the village\n`);
    expect(ctx.errorMessages.filter((m) => /Return statements can only/.test(m)).length).toBeGreaterThan(0);
  });
  test.each(["if true then", "if true then if true then", "if false then else", "while true do", "for i = 1, 2 do", "for _, value in ipairs({2, 3}) do", "repeat"])("unfinished nested explicit %s leaves the next line as prose", (body) => {
    const source = `& do ${body}\nreturn to the village\n`;
    expect(treeScopeStackAt(parseSource(source), source.indexOf("return to"))).toContain("string.display.text.chunk.sd");
  });
});
