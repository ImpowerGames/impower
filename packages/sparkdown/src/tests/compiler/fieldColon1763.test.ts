// I-1763 — a field written `name: value` in a `define`, `style`, `layout`,
// `animation`, `theme` or `morph` body is reported once, on its colon, in
// the wording of Luau's parser for the `=` it expected, and the body keeps
// the field: the line reads as the property it means.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { ProgramStory } from "../../program/ProgramStory";
import { compileSource } from "./compileSnapshot";

const URI = "file:///main.sd";
const FIELD_COLON = "Expected '=' when parsing field, got ':'";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

interface Found {
  message: string;
  line: number;
  text: string;
}

function diagnosticsOf(text: string): Found[] {
  const lines = text.split("\n");
  return (compile(text).diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      line: start.line,
      text: start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character),
    };
  });
}

const colon = (line: number) => ({ message: FIELD_COLON, line, text: ":" });

describe("a field written with `:`", () => {
  test.each([
    ["the root of a `morph`", "morph m with\n  method: bend\n  keyframes {\n    from { eyes { state = open } }\n    to { eyes { state = closed } }\n  }\nend\n", [1]],
    ["a `morph`'s nested block", "morph m with\n  method = bend\n  timing {\n    duration: 3\n  }\n  keyframes {\n    from { eyes { state: open } }\n    to { eyes { state = closed } }\n  }\nend\n", [3, 6]],
    ["an `animation`", "animation after with\n  duration: 2\n  timing {\n    delay: 1\n  }\nend\n", [1, 3]],
    ["a `theme`", "theme base with\n  primary: red\n  colors {\n    secondary: blue\n  }\nend\n", [1, 3]],
    ["a `style`", "style panel with\n  width: 100%\nend\n", [1]],
    ["a `layout`", "layout main with\n  column {\n    image: black\n    text \"a\"\n  }\nend\n", [2]],
    ["a `define`", "define config with\n  speed: 2\n  name : \"x\"\nend\n", [1, 2]],
    ["a `define` keyed by reserved words, modifiers and brackets", "define config with\n  if : 3\n  repeat: 3\n  local : 3\n  store: \"s\"\n  [\"speed\"] : { 1 }\nend\n", [1, 2, 3, 4, 5]],
  ])("in %s is reported on its colon alone", (_, text, lines) => {
    expect(diagnosticsOf(text)).toEqual(lines.map(colon));
  });

  test("a header written `key:` is reported on its colon in the same words", () => {
    expect(diagnosticsOf("theme base with\n  colors: {\n    primary = red\n  }\nend\n")).toEqual([colon(1)]);
  });

  test("the morph from the ticket keeps its keyframes and its `method`", () => {
    const text = "morph m with\n  method: bend\n  keyframes {\n    from { eyes { state = open } }\n    to { eyes { state = closed } }\n  }\nend\n";
    const struct = compileSource(text).find((e) => e.block?.context?.["morph"]?.["m"])?.block?.context?.["morph"]?.["m"] as any;
    expect(struct.method).toBe("bend");
    expect(struct.keyframes).toHaveLength(2);
  });

  test("a `define` keeps the field", () => {
    const program = compile("define box with\n  speed: 2\nend\n\n-> start\nscene start\n  S {box.speed}\n  fin\n\nend\n");
    const story = new ProgramStory(program.chunks!);
    const errors: string[] = [];
    story.onError = (message: string) => errors.push(message);
    expect(story.ContinueMaximally()).toBe("S 2\n");
    expect(errors).toEqual([]);
  });

  test.each(["local", "store", "if"])("a `define` keeps a field keyed `%s`", (key) => {
    const program = compile(`define box with\n  ${key} : 3\nend\n\n-> start\nscene start\n  S {box["${key}"]}\n  fin\n\nend\n`);
    const story = new ProgramStory(program.chunks!);
    const errors: string[] = [];
    story.onError = (message: string) => errors.push(message);
    expect(story.ContinueMaximally()).toBe("S 3\n");
    expect(errors).toEqual([]);
  });

  test("a `define` value's own errors are Luau's, as after an `=`", () => {
    const written = (op: string) => `define config with\n  speed ${op} 1 +\n  ok = 1\nend\n`;
    const withEquals = diagnosticsOf(written("="));
    expect(withEquals.length).toBeGreaterThan(0);
    const withColon = diagnosticsOf(written(":"));
    expect(withColon).toEqual(expect.arrayContaining([...withEquals, colon(1)]));
    expect(withColon).toHaveLength(withEquals.length + 1);
  });

  test("in a Luau table is Luau's method access, reported as Luau reports it", () => {
    const found = diagnosticsOf("define config with\n  inner = { speed: 2 }\nend\n");
    expect(found.filter((d) => d.message === FIELD_COLON)).toEqual([]);
    expect(found).toContainEqual({ message: "Expected identifier when parsing method name, got '2'", line: 1, text: "2" });
  });

  test.each([
    ["a method call in a `define`", "define config with\n  speed: go()\nend\n"],
    ["a method call with a comment before its arguments in a `define`", "define config with\n  speed: go --[[ note ]] ()\nend\n"],
    ["a method call with type arguments in a `define`", "define config with\n  speed: go<<number>>()\nend\n"],
    ["a method call with a long string argument in a `define`", "define config with\n  speed: go [[text]]\nend\n"],
    ["a method call with a comment before its name in a `define`", "define config with\n  speed: --[[ note ]] go()\nend\n"],
    ["a method call with its arguments on the next line in a `define`", "define config with\n  speed: go\n    ()\nend\n"],
    ["a method call with a level-four comment before its arguments in a `define`", "define config with\n  speed: go --[====[ note ]====] ()\nend\n"],
    ["a method call on a modifier-named receiver in a `define`", "define config with\n  store: go(1)\n  const: go \"s\"\n  read: go { 1 }\nend\n"],
    ["a name after the colon in a `define`, left to Luau's reading", "define items with\n  first = 2\nend\n\ndefine config with\n  typo: items[\"first\"]\n  other: bend\nend\n"],
    ["a label with a colon in a `morph`", "morph m with\n  method = bend\n  keyframes {\n    from { eyes { state = open } }\n    to { eyes { state = closed } }\n  }\n  clips {\n    {\n      between { eyelash-left:eyes }\n      targets { pupil-left }\n    }\n  }\nend\n"],
    ["a URL value in a `theme`", "theme t with\n  link = http://example.com\nend\n"],
  ])("%s is no field colon", (_, text) => {
    expect(diagnosticsOf(text).filter((d) => d.message === FIELD_COLON)).toEqual([]);
  });
});
