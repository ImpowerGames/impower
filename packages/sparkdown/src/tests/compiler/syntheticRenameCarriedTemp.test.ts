// An incremental compile renumbers the synthetic names (`__forIdx_<n>` and the
// like) of the chunks it re-lowers and carries the already-canonical
// `__synth_<n>` names of the chunks it keeps. A carried synthetic temp
// declaration, such as the one `second()` below keeps for its loop around
// `new spawner()`, is a `VariableAssignment` whose `variableName` is a getter
// over its identifier, so the plain-string half of the rename must leave it to
// the identifier pass. Writing through the getter throws, and the compile
// returns a program with no compiled story.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function configured(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler;
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

const SOURCE = [
  "define spawner with",
  "  rate = 1",
  "end",
  "",
  "function first()",
  "  for i = 1, 3 do",
  "    local made = new spawner()",
  "  end",
  "  return 1",
  "end",
  "",
  "function second()",
  "  for i = 1, 3 do",
  "    local made = new spawner()",
  "  end",
  "  return 1",
  "end",
  "",
  "{first()} and {second()}.",
  "",
].join("\n");

describe("synthetic names carried into an incremental compile", () => {
  it("compiles an edit beside a kept synthetic temp the same as a cold compile", () => {
    const incremental = configured(SOURCE);
    expect(
      incremental.compile({ textDocument: { uri: URI } }).program.compiled,
    ).toBeDefined();

    const anchor = "function first()";
    const offset = SOURCE.indexOf(anchor) + anchor.length;
    const inserted = "\n  local unused = 1";
    const at = posAt(SOURCE, offset);
    incremental.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: inserted }],
    });
    const afterText = SOURCE.slice(0, offset) + inserted + SOURCE.slice(offset);

    const incrementalProgram = incremental.compile({
      textDocument: { uri: URI },
    }).program;
    const coldProgram = configured(afterText).compile({
      textDocument: { uri: URI },
    }).program;

    expect(coldProgram.compiled).toBeDefined();
    expect(JSON.stringify(incrementalProgram.compiled)).toEqual(
      JSON.stringify(coldProgram.compiled),
    );
  });
});
