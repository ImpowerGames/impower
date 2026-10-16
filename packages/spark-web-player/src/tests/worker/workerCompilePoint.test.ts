// The player's workspace answers the selection an edit leaves itself, so the
// worker hears of that point only from the edit's compile (#1881). A compile
// the worker makes without a point of its own, as a selection after a
// suggestion recompiles the real documents (`SparkdownCompiler.selectDocument`),
// routes to the point compiles route to; that has to be the edit's.
import { describe, expect, it } from "vitest";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The line the selection was on.

  HERO:
    The line the edit left the author on.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

describe("the point the worker's compiles route to", () => {
  it("moves with a compile sent to route elsewhere", async () => {
    const before = { file: MAIN_URI, line: lineOf("The line the selection was on.") };
    const after = { file: MAIN_URI, line: lineOf("The line the edit left the author on.") };
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: before,
    });
    try {
      const compiler = h.workerState.compilerState.compiler;
      expect(compiler.config.startFrom).toEqual(before);
      await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: after,
      });
      expect(compiler.config.startFrom).toEqual(after);
      // A compile sent without a point routes there.
      const result = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
      });
      expect(result.program.startFrom).toEqual(after);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
