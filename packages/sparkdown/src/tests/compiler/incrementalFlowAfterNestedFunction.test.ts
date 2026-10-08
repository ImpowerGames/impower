// A function is a top-level flow wherever it is declared, and the flow it is
// declared in goes on after it: a scene whose `end` is missing takes the lines
// after the function as its own. An edit to those lines changes the scene, so
// an incremental compile must give the scene the path locations a cold compile
// gives it, not the ones cached from before the edit.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent } from "../programListing";

const URI = "inmemory:///main.sd";

function compiled(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  c.compile({ textDocument: { uri: URI } });
  return c;
}

/** The program of `text` after `insert` at `line`:`character`, by content
 *  (its chunks, their line tables and its flows' lines, in place of the
 *  current engine's path locations), incrementally and cold. */
function pathLocations(text: string, line: number, character: number, insert: string) {
  const lines = text.split("\n");
  const after = [
    ...lines.slice(0, line),
    lines[line]!.slice(0, character) + insert + lines[line]!.slice(character),
    ...lines.slice(line + 1),
  ].join("\n");
  const c = compiled(text);
  c.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: { line, character }, end: { line, character } }, text: insert }],
  });
  const incremental = programContent(c.compile({ textDocument: { uri: URI } }).program.chunks);
  const cold = programContent(compiled(after).compile({ textDocument: { uri: URI } }).program.chunks);
  return { incremental, cold };
}

describe("an edit to a scene's lines after a function declared in it", () => {
  it("drops the loop in the case the compiler fuzz found (#1158)", () => {
    const text = [
      "titl{t.a} Fixture",
      "author: Anonymous",
      "defing with",
      "scene scene_0",
      " in some detail here.",
      "  end",
      "function reckon()",
      "  end",
      "  while t.b < 3 do",
    ].join("\n");
    const { incremental, cold } = pathLocations(text, 8, 15, "end");
    expect(incremental).toEqual(cold);
  });

  // The edit is inside the scene, so the lines it changed account for the
  // scene's new shape, and the compile says its changes are confined, as it
  // does for the same scene without the function.
  it.each([
    ["with a function in the middle", ["  function less(a, b)", "    return a < b", "  end"]],
    ["without one (control)", []],
  ])("keeps the changes of a divert edited %s confined", (_label, fn) => {
    const text = [
      "-> one",
      "",
      "scene one",
      "  A",
      ...fn,
      "  -> two",
      "end",
      "",
      "scene two",
      "  B",
      "end",
      "",
      "scene three",
      "  C",
      "end",
      "",
    ].join("\n");
    const c = new SparkdownCompiler();
    c.configure({
      // `changes.confined` is the current engine's change summary; a program
      // of statement chunks answers with `changes.chunks` (#705's deletion
      // decides this case).
      programChunks: false,
      emitCompiledProgram: true,
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    } as never);
    const startFrom = { file: URI, line: 0 };
    c.compile({ textDocument: { uri: URI }, startFrom } as never);
    const line = text.split("\n").indexOf("  -> two");
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        { range: { start: { line, character: 5 }, end: { line, character: 8 } }, text: "three" },
      ],
    });
    const program = (c.compile({ textDocument: { uri: URI }, startFrom } as never) as any).program;
    expect(program.changes?.confined).toBe(true);
  });
});
