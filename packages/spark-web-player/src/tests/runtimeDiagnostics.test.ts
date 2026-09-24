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
