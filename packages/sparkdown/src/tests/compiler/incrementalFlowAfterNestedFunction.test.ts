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
});
