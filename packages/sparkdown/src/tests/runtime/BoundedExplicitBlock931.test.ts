import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { parseSource } from "../compiler/grammarSnapshot";
import { compareEnginesFull, treeScopeStackAt } from "../compiler/scopeEquality";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function diagnostics(text: string) {
  const uri = "inmemory:///bounded.sd";
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return Object.values(compiler.compile({ textDocument: { uri } }).program.diagnostics ?? {}).flat();
}
const messageOf = (d: { message: unknown }) => typeof d.message === "string" ? d.message : String((d.message as { value?: string })?.value);
const missing = (label: string, closer = "end") => `This ${label} is missing its closing \`${closer}\` keyword on this \`&\` line. The following line remains story text.`;

describe("bounded explicit blocks report missing closers without taking later story lines", () => {
  test.each([
    ["do local n = 1", ["`do` block"]],
    ["do if true then", ["`do` block", "`if` block"]],
    ["do if false then else", ["`do` block", "`if` block"]],
    ["do while false do", ["`do` block", "`while` loop"]],
    ["do for i = 1, 2 do", ["`do` block", "`for` loop"]],
    ["do for _, n in ipairs({1}) do", ["`do` block", "`for` loop"]],
    ["do repeat", ["`do` block", "`repeat` loop"]],
    ["do for i = 1, 2 do while false do end", ["`do` block", "`for` loop"]],
  ] as const)("%s", async (body, labels) => {
    const source = `& ${body}\nreturn to the village\n`;
    const errors = diagnostics(source).filter((d) => d.severity === 1);
    expect(errors.map(messageOf).sort()).toEqual(labels.map((label) => missing(label, label === "`repeat` loop" ? "until" : "end")).sort());
    for (const error of errors) {
      const label = labels.find((label) => messageOf(error) === missing(label, label === "`repeat` loop" ? "until" : "end"))!;
      const keyword = label.split("`")[1]!;
      expect(error.range).toEqual({ start: { line: 0, character: 2 + body.indexOf(keyword) }, end: { line: 0, character: 2 + body.length } });
    }
    expect(treeScopeStackAt(parseSource(source), source.indexOf("return to"))).toContain("string.display.text.chunk.sd");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });

  test.each(["end", "until true", "\nend"])("a later story %s cannot repair the missing island closer", (tail) => {
    const errors = diagnostics(`& do local n = 1\nreturn to the village\n${tail}\n`).filter((d) => messageOf(d).includes("missing its closing"));
    expect(errors.map(messageOf)).toEqual([missing("`do` block")]);
  });

  test.each(["", "return to the village\n"])("a later until cannot repair a bounded repeat: %s", (between) => {
    expect(diagnostics(`& do repeat\n${between}until true\n`).map(messageOf)).toContain(missing("`repeat` loop", "until"));
  });
});

describe("nested markers remain inside their bounded conditional", () => {
  test.each([
    ["if false then & x = 1 end", 0],
    ["if true then & x = 1 end", 1],
    ["if false then & x = 1 else & x = 2 end", 2],
    ["do & x = 3 end", 3],
    ["if false then & x = 1 elseif true then & x = 4 else & x = 2 end", 4],
    ["repeat & x += 1 until x == 2", 2],
    ["for i = 1, 2 do & x += i end", 3],
    ["while x < 2 do & x += 1 end", 2],
  ] as const)("%s", async (body, value) => {
    const source = `store x = 0\n& do ${body} end\nreturn to the village\nValue {x}.\ndone\n`;
    const tree = parseSource(source);
    expect(tree.toString()).not.toContain("ERROR_INCOMPLETE");
    const nestedMarker = source.indexOf("& x");
    let node = tree.resolveInner(nestedMarker + 2, 1);
    const parents: string[] = [];
    while (node.parent) { parents.push(node.name); node = node.parent; }
    expect(parents).toContain("LuauSparkdownExplicitDoBlock");
    if (body.startsWith("if")) expect(parents).toContain("LuauSparkdownExplicitIfBlock");
    if (body.startsWith("while") || body.startsWith("for")) expect(parents).toContain("LuauSparkdownExplicitLoop");
    if (body.startsWith("repeat")) expect(parents).toContain("LuauSparkdownExplicitRepeatLoop");
    // Fail on lost ownership before executing: on the broken base a marked
    // increment can escape its loop and leave an infinite empty loop behind.
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(`return to the village\nValue ${value}.\n`);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
});

describe("unfinished bounded headers yield scene and branch ownership", () => {
  test.each(["scene", "branch", "scene\n    + 1"])("a function parenthetical preserves the identifier %s", async (expression) => {
    const source = `Value {f(4, 5)}.\nfunction f(scene, branch)\n  return (\n    ${expression}\n  )\nend\n`;
    // These names are reserved by Sparkdown's argument validator, but their
    // parenthesized Luau token ownership must not turn into a story header.
    expect(diagnostics(source).map(messageOf).filter((m) => m.includes("missing its closing") || m.includes("Branches are only"))).toEqual([]);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each([
    ["sceneValue\n    + branchValue", "9"],
    ["(sceneValue + branchValue)", "9"],
    ['"scene Next"', "scene Next"],
    ["-- scene Next\n    sceneValue", "4"],
    ["[[scene Next\nbranch Next]]", "scene Next\nbranch Next"],
  ])("a function parenthetical preserves protected content %s", async (expression, value) => {
    const source = `Value {f(4, 5)}.\nfunction f(sceneValue, branchValue)\n  return (\n    ${expression}\n  )\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(`Value ${value}.\n`);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each(["", "& "])("a real function's %sreturn preserves its multiline parenthetical", async (marker) => {
    const source = `Value {f()}.\nfunction f()\n  ${marker}return (\n    5\n  )\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  for (const header of ["if (", "while (", "if ((", "while (("]) test.each(["scene Next", "branch Next"])(`${header} before %s`, async (beat) => {
    const source = `& do ${header}\n${beat}\nAfter.\nend\n`;
    const tree = parseSource(source);
    const cursor = tree.cursor();
    const beats: string[] = [];
    do { if ((cursor.name === "Scene" || cursor.name === "Branch") && cursor.from === source.indexOf(beat)) beats.push(cursor.name); } while (cursor.next());
    expect(beats).toEqual([beat.startsWith("scene") ? "Scene" : "Branch"]);
    expect(treeScopeStackAt(tree, source.indexOf("After"))).toContain("string.display.text.chunk.sd");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each(["if (", "while ("])("unfinished %s preserves the next ordinary prose line", async (header) => {
    const source = `& do ${header}\nreturn to the village\n`;
    expect(treeScopeStackAt(parseSource(source), source.indexOf("return to"))).toContain("string.display.text.chunk.sd");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
});

describe("specific do routing precedes the bounded loop condition", () => {
  test.each(["while do", "for do"])("%s keeps do as the loop body", async (header) => {
    const source = `& do ${header} end end\nAfter.\n`;
    const tree = parseSource(source);
    const cursor = tree.cursor();
    const doBlocks: number[] = [];
    do { if (cursor.name === "LuauSparkdownExplicitDoBlock") doBlocks.push(cursor.from); } while (cursor.next());
    expect(doBlocks).toHaveLength(2);
    expect(treeScopeStackAt(tree, source.indexOf("After"))).toContain("string.display.text.chunk.sd");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
});
