import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// The target of `[[show/hide/animate X ...]]` is an ELEMENT in the mounted UI
// tree: the engine looks it up with `UIModule.findElements`, which walks the
// tree for a child of that name. It is not a `define`d struct, so resolving it
// as one reports every working command as a missing "layer" — including
// `backdrop` and `portrait`, which the builtin `layout main` declares.

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

const MAIN = "file://proj/main.sd";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

/** Just the "Cannot find layer named `x`" complaints, by name. */
const missingLayers = (program: any): string[] =>
  Object.values(program.diagnostics ?? {})
    .flatMap((list) => list as any[])
    .map((d) => /Cannot find layer named `([^`]+)`/.exec(message(d)))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => m[1]!);

const scene = (body: string) =>
  ["define BG as image with", '  src = "https://example.com/bg.png"', "end", "", "= scene", "", body, ""].join("\n");

describe("layer reference validity", () => {
  it("accepts the elements the builtin layout declares", () => {
    const program = compile(
      scene("  [[show backdrop BG]]\n  [[show portrait BG]]\n  [[hide backdrop]]"),
    );
    expect(missingLayers(program)).toEqual([]);
  });

  it("accepts an element the author declares in their own layout", () => {
    const program = compile(
      [
        "layout main with",
        "  stage:",
        "    weather_overlay:",
        "end",
        "",
        scene("  [[show weather_overlay BG]]"),
      ].join("\n"),
    );
    expect(missingLayers(program)).toEqual([]);
  });

  it("accepts an instance suffix, which the engine strips before matching", () => {
    const program = compile(scene("  [[show portrait#1 BG]]"));
    expect(missingLayers(program)).toEqual([]);
  });

  it("still reports a name no layout declares", () => {
    const program = compile(scene("  [[show backdropp BG]]"));
    expect(missingLayers(program)).toEqual(["backdropp"]);
  });
});
