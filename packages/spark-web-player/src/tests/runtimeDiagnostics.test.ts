// #816 — the player reports each run's runtime errors and warnings to the
// editor, which shows them as diagnostics. A preview's run includes what the
// route replayed to the author's line raised; the branches a route search
// tried and abandoned raise nothing the author sees.
//
// Both switch positions (#680) are covered: with the switch off the worker
// replays the route and the page's own game shows the beat; with it on the
// worker does both.
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./worker/playerHarness";

const CONTINUES_WARNING =
  "This line begins with `..`, but the line before it had already ended.";

// Line 3 raises a warning on every route through the scene. Line 8 raises one
// only on the left branch, which a route to the right branch searches first
// and abandons.
const SOURCE = [
  "store x = 0",
  "A",
  "& x = 1",
  ".. B",
  "Pick a path.",
  "choose",
  "  * Left path",
  "    & x = 2",
  "    .. Left.",
  "  * Right path",
  "    You went right.",
  "end",
  "Done here.",
  "",
].join("\n");

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));

/** The diagnostics the editor was last sent for the main script, as
 *  [line, severity, message, source]. */
const lastReported = (toEditor: any[]) => {
  const reports = toEditor.filter((m) => m.method === "sparkdown/runtimeDiagnostics");
  const last = reports.at(-1);
  return (last?.params.diagnostics[MAIN_URI] ?? []).map((d: any) => [
    d.range.start.line,
    d.severity,
    d.message,
    d.source,
  ]);
};

describe.each([false, true])("runtime diagnostics (worker displays: %s)", (workerDisplays) => {
  it("include a warning the route replay raised, and not one raised only on a branch the search abandoned", async () => {
    const h = await createPlayerHarness({
      workerDisplays,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Done here.") },
    });
    try {
      await h.compile();
      // The left branch does raise its warning when a route takes it.
      await h.select(lineOf(".. Left."));
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
        [lineOf(".. Left."), 2, CONTINUES_WARNING, "runtime"],
      ]);
      // A route to the right branch searches the left one and abandons it.
      await h.select(lineOf("You went right."));
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("include an error that keeps the route from reaching the line", async () => {
    // The error ends the story on its line, so no route reaches the lines
    // after it; the error is what the author has to fix.
    const text = ["A", '{error("first")} B', "C", "D", ""].join("\n");
    const h = await createPlayerHarness({
      workerDisplays,
      files: [{ uri: MAIN_URI, text }],
      startFrom: { file: MAIN_URI, line: 3 },
    });
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(3);
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([[1, 1, "first", "runtime"]]);
    } finally {
      console.error = error;
      h.dispose();
    }
  }, 120_000);

  it("of PLAY include an error the story raises while it plays", async () => {
    const text = ["A", "B", '{error("boom")} C', "D", ""].join("\n");
    const h = await createPlayerHarness({
      workerDisplays,
      files: [{ uri: MAIN_URI, text }],
      startFrom: { file: MAIN_URI, line: 0 },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(0);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      for (let i = 0; i < 5 && !lastReported(h.toEditor).length; i++) {
        h.playing()?.continue();
        await settle(10);
      }
      expect(lastReported(h.toEditor)).toEqual([[2, 1, "boom", "runtime"]]);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("of the program an edit during PLAY compiled replace PLAY's at STOP", async () => {
    const h = await createPlayerHarness({
      workerDisplays,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Pick a path.") },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    try {
      await h.compile();
      await h.select(lineOf("Pick a path."));
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      // An edit below compiles while PLAY runs; STOP comes before the
      // restart that edit schedules.
      const done = lineOf("Done here.");
      await h.edit([
        {
          range: { start: { line: done, character: 0 }, end: { line: done, character: 4 } },
          text: "Over",
        },
      ]);
      await h.compile();
      h.workspace.selections.length = 0;
      await h.controller.stopGame("quit");
      // The editor selects the line STOP names, as STOP asks it to.
      const stoppedAt = h.workspace.selections.at(-1)?.selectedRange.start.line;
      expect(stoppedAt).toBeTypeOf("number");
      await h.select(stoppedAt);
      await settle(20);
      const reports = h.toEditor.filter((m) => m.method === "sparkdown/runtimeDiagnostics");
      expect(reports.at(-1)?.params.program.scripts[MAIN_URI]).toBe(h.version());
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
      ]);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("of PLAY include what its route raised and what it raises, and stay after STOP until the author moves", async () => {
    const h = await createPlayerHarness({
      workerDisplays,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Pick a path.") },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    // STOP waits a frame between its steps; this page has no frames.
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    const raisedAt = {
      uri: MAIN_URI,
      range: { start: { line: 10, character: 0 }, end: { line: 10, character: 19 } },
    };
    try {
      await h.compile();
      await h.select(lineOf("Pick a path."));
      await settle(20);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
      ]);
      // An error PLAY raises joins its run, and stops it.
      await h.playing()!.connection.emit(
        GameEncounteredRuntimeErrorMessage.type.notification({
          type: ErrorType.Error,
          message: "boom",
          location: raisedAt,
          state: "running",
        } as any),
      );
      for (let i = 0; i < 100 && !h.toEditor.some((m) => m.method === "game/exited"); i++) {
        await settle(2);
      }
      // The editor selects the line the error names, as STOP asks it to.
      await h.select(raisedAt.range.start.line);
      await settle(20);
      const played = [
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
        [raisedAt.range.start.line, 1, "boom", "runtime"],
      ];
      expect(lastReported(h.toEditor)).toEqual(played);
      // Moving to another line previews there, which replaces PLAY's run.
      await h.select(lineOf("Pick a path."));
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
      ]);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});
