import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { normalizeProgram } from "./normalizeProgram";
import { parseSource } from "./grammarSnapshot";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

const URI = "file:///main.sd";

function errors(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text,
      version: 1, languageId: "sparkdown" }],
  } as any);
  return (compiler.compile({ textDocument: { uri: URI } }).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1);
}

describe("struct bodies use blocks and ignore indentation", () => {
  test.each(["layout", "style"])("%s rejects colon headers and dash items", (type) => {
    for (const [line, token] of [["title:", ":"], ["- title", "-"]]) {
      const text = `${type} example with\n  ${line}\nend`;
      const found = errors(text);
      expect(found).toHaveLength(1);
      expect(typeof found[0]!.message === "string" ? found[0]!.message : found[0]!.message.value).toBe("Invalid syntax");
      expect(found[0]!.range.start.line).toBe(1);
      const { start, end } = found[0]!.range;
      expect(text.split("\n")[1]!.slice(start.character, end.character)).toBe(token);
    }
  });

  test("each bare word starts an element, including on the same line", () => {
    const source = 'layout example with\n title { stroke text }\n text title "x"\nend';
    expect(errors(source)).toEqual([]);
    const entry = compileSource(source).find((e) => e.block?.sparkle?.layouts?.['example']);
    const layout = entry!.block!.sparkle!.layouts!['example'] as any;
    expect(layout.children.map((e: any) => e.tag)).toEqual(["title", "text", "title"]);
    expect(layout.children[0].children.map((e: any) => e.tag)).toEqual(["stroke", "text"]);
    expect(layout.children[1].classes).toEqual([]);
  });
});

test.each(["none", "uniform", "random"])("builtins struct bodies compile identically with %s indentation", (mode) => {
  const text = readFileSync(new URL("../../compiler/builtins/builtins.sd", import.meta.url), "utf8");
  const tree = parseSource(text);
  const lines = text.split("\n");
  const bodyLines = new Set<number>();
  const types = new Set(["LuauLayout", "LuauComponent", "LuauStyle", "LuauAnimation", "LuauTheme", "LuauMorph", "LuauScreen"]);
  const cursor = tree.cursor();
  do {
    if (!types.has(cursor.name)) continue;
    const first = text.slice(0, cursor.from).split("\n").length - 1;
    const last = text.slice(0, cursor.to).split("\n").length - 1;
    for (let line = first + 1; line < last; line++) bodyLines.add(line);
  } while (cursor.next());
  expect(bodyLines.size).toBeGreaterThan(100);
  let seed = 1234;
  const changed = lines.map((line, i) => {
    if (!bodyLines.has(i)) return line;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const count = mode === "none" ? 0 : mode === "uniform" ? 4 : seed % 13;
    return " ".repeat(count) + line.trimStart();
  }).join("\n");
  const compile = (source: string) => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: false, definitions: { builtins: {} },
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
    } as any);
    return normalizeProgram(compiler.compile({ textDocument: { uri: URI } }).program);
  };
  expect(isDeepStrictEqual(compile(changed), compile(text))).toBe(true);
});
