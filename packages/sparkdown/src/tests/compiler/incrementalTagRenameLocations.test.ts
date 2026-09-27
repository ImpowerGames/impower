// A tag line added above a carried tag line renumbers the carried tag's
// container (`id-0` becomes `id-1`). The path-location table of the
// incremental compile names the renumbered container, as a cold compile's does
// (#978).
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const SCENES = Array.from(
  { length: 6 },
  (_, i) => `scene s${i}\n  Line ${i}.\nend\n`,
).join("\n");

const SCRIPT = `-> s0\n\n${SCENES}\nscene last\n  # mood happy\n  Last line.\nend\n`;

function configured(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return c;
}

const tagPaths = (program: any): string[] =>
  (program.pathLocations?.paths ?? []).filter((path: string) => path.includes(".id-"));

function insertAndCompare(before: string, insertLine: number, inserted: string, after: string) {
  const incr = configured(before);
  incr.compile({ textDocument: { uri: URI } });
  const at = { line: insertLine, character: 0 };
  incr.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: at, end: at }, text: inserted }],
  });
  const incremental = incr.compile({ textDocument: { uri: URI } }).program;
  const cold = configured(after).compile({ textDocument: { uri: URI } }).program;
  expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  expect(tagPaths(incremental)).toEqual(tagPaths(cold));
  expect(tagPaths(cold)).toContain("last.0.id-1.0");
}

describe("path locations after a synthetic tag container rename (#978)", () => {
  it("names the carried tag's renumbered container when a tag line is added at the top", () => {
    insertAndCompare(SCRIPT, 0, "# opening\n", "# opening\n" + SCRIPT);
  });

  it("names the carried tag's renumbered container when a tag line is added to the first scene", () => {
    const line = SCRIPT.split("\n").indexOf("  Line 0.");
    const inserted = "  # opening\n";
    const lines = SCRIPT.split("\n");
    lines.splice(line, 0, inserted.slice(0, -1));
    insertAndCompare(SCRIPT, line, inserted, lines.join("\n"));
  });

  it("names the carried tag's renumbered container when a top-level tag line is added after the last scene", () => {
    const line = SCRIPT.split("\n").length - 1;
    insertAndCompare(SCRIPT, line, "# closing\n", SCRIPT + "# closing\n");
  });
});
