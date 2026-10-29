import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { PlayMessage } from "../../main/workers/messages/PlayMessage";
import { StopPlayMessage } from "../../main/workers/messages/StopPlayMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

-> start

scene start
  HERO:
    [[show backdrop BG]]
    The first line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");

describe("the program the page names", () => {
  it("is a different one once a file has been replaced", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      const before = await h.compile();
      const beforeId = programIdentity(before.program)!;
      expect(beforeId).toBeTruthy();

      await h.page.sendRequest(AddCompilerFileMessage.type, {
        file: {
          uri: "file:///local/images/bg.png",
          name: "bg",
          ext: "png",
          type: "image",
          src: "https://example.com/bg-2.png",
          version: 2,
        },
      } as any);
      const after = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: FIRST },
      });
      const afterId = programIdentity(after.program)!;

      expect(after.program.scripts).toEqual(before.program.scripts);
      expect(afterId).not.toBe(beforeId);

      const built = await h.link.request(PlayMessage.type, {
        program: beforeId,
        startFrom: { file: MAIN_URI, line: FIRST },
      });
      expect(built.built).toBe(true);
      const played = h.workerState.gameState.running!.program;
      expect(played.filesEpoch).toBe(before.program.filesEpoch);
      expect(played.filesEpoch).not.toBe(after.program.filesEpoch);
      await h.link.request(StopPlayMessage.type, {});
    } finally {
      h.dispose();
    }
  }, 120_000);
});
