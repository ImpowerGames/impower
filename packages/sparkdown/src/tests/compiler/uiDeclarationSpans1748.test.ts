import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

const URI = "file://proj/main.sd";

const script = (text: string): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [script(text)] });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const SOURCE = [
  "store visits = 0",
  "const limit = 3",
  "define hero as character with",
  '  name = "Hero"',
  "end",
  "function bump(n)",
  "  return n + 1",
  "end",
  "define accent as color with value = \"#13171f\" end",
  "define --[[palette]] muted as color with value = \"#333c4e\" end",
  "define ui as config with",
  '  root_text_size = "112.5%"',
  "end",
  "define --[[ sizes ]] --[[ more ]] ui_too as config with",
  '  root_text_size = "100%"',
  "end",
  "style card {",
  "  background_color = black",
  "}",
  "theme dusk {",
  "  color = #112233",
  "}",
  "animation pulse {",
  "  keyframes {",
  '    { scale = "1" }',
  '    { scale = "1.1" }',
  "  }",
  "}",
  "screen menu {",
  "}",
  "layout main {",
  "  box",
  "}",
  "component divider_line {",
  "  box.line",
  "}",
  "scene start",
  "  Hello.",
  "end",
  "",
].join("\n");

const lineOf = (text: string) => SOURCE.split("\n").indexOf(text);

describe("the spans the compiler records for top-level UI declarations", () => {
  const program = compile(SOURCE);
  const spans = program.uiSpans?.[URI] ?? [];
  const holds = (line: number) => spans.some(([first, last]) => first <= line && line <= last);

  it.each([
    ["a define as color", "define accent as color with value = \"#13171f\" end", 0],
    ["a define as color with a comment before its name", "define --[[palette]] muted as color with value = \"#333c4e\" end", 0],
    ["a define as config", "define ui as config with", 2],
    ["a define as config with comments before its name", "define --[[ sizes ]] --[[ more ]] ui_too as config with", 2],
    ["a style", "style card {", 2],
    ["a theme", "theme dusk {", 2],
    ["an animation", "animation pulse {", 5],
    ["a screen", "screen menu {", 1],
    ["a layout", "layout main {", 2],
    ["a component", "component divider_line {", 2],
  ] as const)("records %s from its header through its last line", (_name, header, length) => {
    const first = lineOf(header);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(spans).toContainEqual([first, first + length]);
  });

  it.each([
    ["a store", "store visits = 0"],
    ["a const", "const limit = 3"],
    ["a define of another type", "define hero as character with"],
    ["a function's header", "function bump(n)"],
    ["a function's body", "  return n + 1"],
    ["a scene's line", "  Hello."],
  ] as const)("does not cover %s", (_name, text) => {
    const line = lineOf(text);
    expect(line).toBeGreaterThanOrEqual(0);
    expect(holds(line)).toBe(false);
  });
});
