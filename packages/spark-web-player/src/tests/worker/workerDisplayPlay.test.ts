// PLAY runs the program the preview shows, which is the last one that compiled
// and ran (#682): the page holds its summary, and the worker builds PLAY's
// game from the same program written out whole. A later edit that does not
// compile leaves both where they were.
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The line PLAY starts from.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("The line PLAY starts from."));

describe("after PLAY and STOP", () => {
  it("the preview shows the line again, labels included", async () => {
    const after = async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: LINE },
      });
      try {
        await h.compile();
        await h.select(LINE);
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle();
        // STOP waits a frame between its steps; this page has no frames.
        const win = h.overlay.ownerDocument.defaultView as any;
        win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
        await h.controller.stopGame("quit");
        // The editor selects where the game stopped, as STOP asks it to.
        await h.select(LINE);
        await settle(40);
        return {
          game: h.controller._workerGame != null,
          dom: h.snapshotDOM(),
          executed: h.refs.executedLabel.textContent,
          location: h.refs.locationItems.textContent,
        };
      } finally {
        h.dispose();
      }
    };
    const on = await after();
    expect(on.game).toBe(true);
    expect(JSON.stringify(on.dom)).toContain("The line PLAY starts from.");
    expect(on.executed).toBe(`main : ${LINE + 1}`);
  }, 120_000);
});

describe("the program PLAY runs", () => {
  it("PLAY runs the last program that compiled when a later edit does not", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: LINE },
    });
    try {
      const good = await h.compile();
      expect(good.program.summary).toBe(true);
      await h.select(LINE);
      const goodId = programIdentity(good.program);

      // The author edits, and the compile of the edit fails inside the
      // compiler: it answers, but with nothing that runs.
      const first = SOURCE.split("\n").findIndex((l) => l.includes("The first line."));
      await h.edit([
        {
          range: { start: { line: first, character: 4 }, end: { line: first, character: 19 } },
          text: "The first line, edited.",
        },
      ]);
      const compiler = h.workerState.compilerState.compiler as any;
      const parseIncrementally = compiler.parseIncrementally;
      compiler.parseIncrementally = () => {
        compiler.parseIncrementally = parseIncrementally;
        throw new Error("A compile that fails partway");
      };
      const realError = console.error;
      console.error = () => {};
      try {
        await h.compile();
      } finally {
        console.error = realError;
      }
      expect(h.controller._canonicalInvalid).toBe(true);
      expect(programIdentity(h.controller._program)).toBe(goodId);

      const played = h.recordPlays();
      const started = await h.controller.startGameAndApp();
      await settle();
      expect(started).toBe(true);
      expect(played).toHaveLength(1);
      expect(programIdentity(played[0])).toBe(goodId);
      expect(played[0].summary).toBeUndefined();
      expect(played[0].compiled ?? played[0].compiledBuffer).toBeTruthy();
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("PLAY runs the program the page holds when a newer compile is ahead of it", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: LINE },
    });
    try {
      const held = await h.compile();
      await h.select(LINE);
      const heldId = programIdentity(held.program);

      // A suggestion is on screen, so the preview last displayed is not
      // the real program.
      const first = SOURCE.split("\n").findIndex((l) => l.includes("The first line."));
      await h.suggest(
        [
          {
            range: { start: { line: first, character: 4 }, end: { line: first, character: 19 } },
            text: "The first line, suggested.",
          },
        ],
        first,
      );

      // The author edits, and PLAY is pressed while the compile of the
      // edit is still ahead of it in the worker.
      await h.edit([
        {
          range: { start: { line: first, character: 4 }, end: { line: first, character: 19 } },
          text: "The first line, edited.",
        },
      ]);
      const played = h.recordPlays();
      const compiled = h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: LINE },
      });
      const started = h.controller.startGameAndApp();
      await compiled;
      expect(await started).toBe(true);
      await settle();

      // The game that runs is the program the page held when PLAY was
      // pressed.
      expect(played).toHaveLength(1);
      expect(programIdentity(played[0])).toBe(heldId);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
