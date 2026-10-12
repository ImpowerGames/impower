import { describe, expect, test } from "vitest";
import GRAMMAR from "../../../language/sparkdown.language-grammar.json";
import { parseSource } from "../compiler/grammarSnapshot";
import { compareEnginesFull, treeScopeStackAt } from "../compiler/scopeEquality";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseOfficialTree } from "../compiler/officialAstTestUtils";

// Independent grammar inventory: do not use the compiler's alias whitelist
// to decide which rules the source grammar must bound.
const repository = GRAMMAR.repository as Record<string, Record<string, unknown>>;
const pairs = Object.keys(repository).flatMap(name => {
  const original = name === "LuauSparkdownExplicitStoryVariableDefinition" ? "LuauSparkdownVariableDefinition"
    : name.startsWith("LuauSparkdownExplicit") ? "Luau" + name.slice("LuauSparkdownExplicit".length)
    : name.startsWith("SparkdownExplicit") ? name.slice("SparkdownExplicit".length) : undefined;
  const controls = ["LuauDoBlock", "LuauIfBlock", "LuauElseifBlock", "LuauElseBlock", "LuauRepeatLoop", "LuauBlockBody"];
  return original && repository[original] && !controls.includes(original) ? [[original, name] as const] : [];
});
function includes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === "include" && typeof child === "string" && child.startsWith("#")
    ? [child.slice(1)] : includes(child));
}
function captureScopes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(captureScopes);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id").map(([key, child]) => [key,
    key === "include" && typeof child === "string"
      ? child.replace(/^#LuauSparkdownExplicit/, "#Luau").replace(/^#SparkdownExplicit/, "#")
      : captureScopes(child)]));
}

describe("closed narrative expression family", () => {
  test("all recursive counterparts keep scopes and never escape to an ordinary expression child", () => {
    expect(pairs).toHaveLength(81);
    const originals = new Set(pairs.map(([original]) => original));
    for (const [original, twin] of pairs) {
      for (const field of ["name", "contentName", "captures", "beginCaptures", "endCaptures"]) expect(captureScopes(repository[twin]![field])).toEqual(captureScopes(repository[original]![field]));
      expect(includes(repository[twin]).filter(name => originals.has(name))).toEqual([]);
      expect(includes(repository[twin]).filter(name => ["Newline", "LuauReturnLineBreak", "LuauCommaLineBreak"].includes(name))).toEqual([]);
      if (repository[twin]!["begin"]) expect(String(repository[twin]!["end"])).toContain("$");
    }
    // Only actual opaque roots and genuine structured/function contexts may
    // stop the closure walk. Helpers named AfterComment are ordinary code.
    const barriers = new Set([
      "LuauComment", "LuauLineComment", "LuauDocLineComment", "LuauBlockComment",
      "LuauTypeTrailingBlockComment", "LuauValueTrailingBlockComment",
      "LuauUncallableValueTrailingBlockComment", "LuauCallableValueTrailingBlockComment",
      "LuauString", "LuauDoubleQuotedString", "LuauSingleQuotedString",
      "LuauMultilineString", "LuauInterpolatedString", "LuauRegexLiteral",
      "LuauFunctionBody", "LuauFunctionDefinition", "LuauFunctionExpression", "LuauFunctionTypeDeclaration",
      "LuauStyle", "LuauLayout", "LuauScreen", "LuauComponent", "LuauAnimation", "LuauTheme", "LuauMorph", "LuauDefine",
    ]);
    const visited = new Set<string>();
    const visit = (name: string) => {
      if (visited.has(name) || barriers.has(name)) return;
      visited.add(name);
      expect(originals.has(name), `ordinary expression escape: ${name}`).toBe(false);
      expect(["Newline", "LuauReturnLineBreak", "LuauCommaLineBreak"].includes(name), `newline escape: ${name}`).toBe(false);
      for (const child of includes(repository[name])) visit(child);
    };
    visit("LuauSparkdownExplicitExpression");
    visit("LuauSparkdownExplicitStoryVariableDefinition");
    visit("LuauSparkdownExplicitReassignment");
    for (const [, twin] of pairs) visit(twin);
  });
  test.each([
    "& local value = math.abs(", "& local value = (5", "& local value = {5",
    "& local value = math[1", "& local value = 5 +", "& local value: (",
    "& do x = f(", "& do x = t[", "& do x = {", "& do x = if f(",
    "& local x: (", "& local x: {", "& do local x: (", "& do x = 5 :: (",
    "& do repeat x = 1 until f(", "& do x = (t[",
    "& do x = if true then", "& do x = if true then 1 else",
    "& do x = 5 +", "& do x = true and", "& do x = 5 <", "& do x = 5 ..", "& do x = #", "& local x:", "& local x: number |", "& do x = 5 ::", "& do local x,",
    "& local x --[[ c ]] :: (",
  ])("unfinished descendant keeps the next prose after %s", async prefix => {
    const source = `${prefix}\nreturn to the village\nAfter.\n`;
    const tree = parseSource(source);
    for (const word of ["return to", "After"]) expect(treeScopeStackAt(tree, source.indexOf(word))).toContain("string.display.text.chunk.sd");
    const uri = "inmemory:///bounded.sd";
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [{ uri, type: "script", name: "bounded", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] } as never);
    const diagnostics = compiler.compile({ textDocument: { uri } } as never).program.diagnostics?.[uri] ?? [];
    expect(diagnostics.some(diagnostic => diagnostic.severity === 1)).toBe(true);
    if (prefix.startsWith("& local value")) {
      const native = parseOfficialTree("  " + prefix.slice(2)).errors[0]!;
      expect(diagnostics.some(diagnostic => diagnostic.code === "SyntaxError" && diagnostic.message === native.message && diagnostic.range.start.line === 0 && diagnostic.range.start.character === prefix.length)).toBe(true);
    }
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each(["file", "scene", "branch"])("missing marked-call value is published at %s boundary", scope => {
    for (const tail of ["", "return to the village\n", "& math.abs(5)\n"]) {
      const prefix = scope === "file" ? "" : scope === "scene" ? "scene a\n" : "scene a\nbranch b\n";
      const closer = scope === "file" ? "" : scope === "scene" ? "end\n" : "end\nend\n";
      const source = `${prefix}& local value = math.abs(\n${tail}${closer}`;
      const uri = "inmemory:///bounded.sd";
      const compiler = new SparkdownCompiler();
      compiler.configure({ files: [{ uri, type: "script", name: "bounded", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] } as never);
      const diagnostics = compiler.compile({ textDocument: { uri } } as never).program.diagnostics?.[uri] ?? [];
      expect(diagnostics.some(diagnostic => diagnostic.code === "SyntaxError" && diagnostic.message === "Expected identifier when parsing expression, got <eof>" && diagnostic.range.start.line === prefix.split("\n").length - 1 && diagnostic.range.start.character === "& local value = math.abs(".length), `${scope}: ${JSON.stringify(tail)}`).toBe(true);
    }
  });
  test.each([
    ["x = math.abs(-5)", 5], ["local t = {5}; x = t[1]", 5],
    ["local t = {n = 5}; x = t.n", 5], ["local n: number = 5; x = n", 5],
    ["x = if false then 1 else 5", 5], ["x = (5 :: number)", 5],
  ])("same-line %s retains effects and engine parity", async (body, value) => {
    const source = `store x = 0\n& do ${body} end\nreturn to the village\nValue {x}.\ndone\n`;
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe(`return to the village\nValue ${value}.\n`);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each([
    "function f(\n  value\n)\n  return value\nend",
    "function f(\n  value: number\n): number\n  return value\nend",
    "function f(value)\n  local identity = function(\n    n\n  )\n    return n\n  end\n  return identity(value)\nend",
  ])("genuine function headers and bodies keep multiline ownership: %s", async definition => {
    const source = `Value {f(5)}.\n${definition}\nreturn to the village\n`;
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("Value 5.\nreturn to the village\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test.each(["[[é😀\nnext]]", "[=[é😀\nnext]=]"])("opaque string %s retains ownership", async value => {
    const source = `store x = ""\n& do x = ${value} end\nreturn to the village\nValue {x}.\ndone\n`;
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("return to the village\nValue é😀\nnext.\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test("a marked anonymous function retains multiline parameters and body", async () => {
    const source = "store x = 0\n& do local identity = function(\n  value\n)\n  return value\nend; x = identity(5) end\nreturn to the village\nValue {x}.\ndone\n";
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("return to the village\nValue 5.\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test("a complete opaque comment retains its closing-line code suffix", async () => {
    const source = "store x = 0\n& do x = 5 --[=[ é😀\ncomment ]=]; x += 1 end\nreturn to the village\nValue {x}.\ndone\n";
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("return to the village\nValue 6.\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
  test("a physically multiline backtick retains its native malformed-string error", () => {
    const source = "store x = \"\"\n& do x = `é😀\nnext` end\nreturn to the village\n";
    expect(makeRuntimeStoryFromSource(source).errorMessages).toContain("Malformed string; did you forget to finish it?");
  });
  test("a marked divert value retains its target and non-Luau category", async () => {
    const source = "store destination = -> place\n& destination = -> place\n-> destination\nscene place\nReached.\nend\n";
    const tree = parseSource(source);
    const cursor = tree.cursor();
    const names: string[] = [];
    do { names.push(cursor.name); } while (cursor.next());
    expect(names).toContain("SparkdownExplicitDivertPath");
    for (const name of ["Tag", "Tags", "Annotation", "DivertPath", "TagContent"]) {
      expect(repository[`SparkdownExplicit${name}`]).toBeDefined();
      expect(`SparkdownExplicit${name}`.startsWith("Luau")).toBe(false);
    }
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("Reached.\n");
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
});
