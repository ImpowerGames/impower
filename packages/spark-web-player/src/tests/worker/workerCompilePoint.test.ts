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
      const result = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
      });
      expect(result.program.startFrom).toEqual(after);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
