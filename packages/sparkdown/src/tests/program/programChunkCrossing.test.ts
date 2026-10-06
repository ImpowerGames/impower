// Statements whose order an edit swaps in the program's statement list keep
// their chunks (#1496). Turning the text after an earlier `end` into `return `
// moves `function bump(by)` into an earlier body, so it now comes before
// `function twice(n`, which the edit did not touch. The script is a reduction
// of a case from the cumulative fuzz in programChunkIdentity.test.ts.
import { describe, expect, it } from "vitest";
import { MAIN_URI, programCompiler, rootChunks } from "./programHarness";
import { programStatements, uniqueKeys, untouchedChunks } from "./programStatements";

const SCRIPT = [
  "do",
  "  function inner()",
  "do",
  "  function inner()",
  "    return 2end",
  "  end",
  "end",
  "l}nd",
  "end",
  "  function bump(by)",
  "  end",
  "end",
  "do",
  "  function twice(n",
  "Before any return {describe(1)} {twice(2)}.",
  "scene",
  "  local make = function(n) return functio",
  "  + 1return n * 4 end end",
  "l} twice {twice(2)}.",
  "  iflocal  < 0 then",
].join("\n");

describe("statements an edit swaps in the statement list", () => {
  it("keep the chunks of those the edit did not touch", () => {
    const c = programCompiler({ [MAIN_URI]: SCRIPT }, { programChunks: true });
    c.compile();
    const keysBefore = uniqueKeys(programStatements(c.compiler));
    const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
    const range = { start: { line: 7, character: 2 }, end: { line: 8, character: 0 } };
    const insert = "return ";
    const lines = SCRIPT.split("\n");
    const offset = lines.slice(0, 7).join("\n").length + 1 + 2;
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [{ range, text: insert }],
    });
    const { program } = c.compile();
    expect(program.chunks).toBeDefined();
    const held = new Set(rootChunks(program.chunks!));
    const again = untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore).filter(
      (chunk) => held.has(chunk) && !before.has(chunk),
    );
    expect(again.length).toBe(0);
  });
});
