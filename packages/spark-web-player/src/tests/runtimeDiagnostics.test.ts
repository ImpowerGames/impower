import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./worker/playerHarness";

const CONTINUES_WARNING =
  "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

const SOURCE = [
  "store x = 0",
  "scene start",
  "  A",
  "  & x = 1",
  "  .. B",
  "  Pick a path.",
  "  choose",
  "    * Left path",
  "      & x = 2",
  "      .. Left.",
  "    * Right path",
  "      You went right.",
  "  end",
  "  Done here.",
  "end",
  "",
].join("\n");

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));

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

describe("runtime diagnostics", () => {
  it("include a warning the route replay raised, and not one raised only on a branch the search abandoned", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Done here.") },
    });
    try {
      await h.compile();
      await h.select(lineOf(".. Left."));
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
        [lineOf(".. Left."), 2, CONTINUES_WARNING, "runtime"],
      ]);
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
    const text = ["scene start", "  A", '  {error("first")} B', "  C", "  D", "end", ""].join("\n");
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text }],
      startFrom: { file: MAIN_URI, line: 4 },
    });
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(4);
      await settle(20);
      expect(lastReported(h.toEditor)).toEqual([[2, 1, "first", "runtime"]]);
    } finally {
      console.error = error;
      h.dispose();
    }
  }, 120_000);

  it("of PLAY include an error the story raises while it plays", async () => {
    const text = ["scene start", "  A", "  B", '  {error("boom")} C', "  D", "end", ""].join("\n");
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text }],
      startFrom: { file: MAIN_URI, line: 1 },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(1);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      for (let i = 0; i < 5 && !lastReported(h.toEditor).length; i++) {
        h.playing()?.continue();
        await settle(10);
      }
      expect(lastReported(h.toEditor)).toEqual([[3, 1, "boom", "runtime"]]);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("of the program an edit during PLAY compiled replace PLAY's at STOP", async () => {
    const h = await createPlayerHarness({
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
      const done = lineOf("Done here.");
      await h.edit([
        {
          range: { start: { line: done, character: 2 }, end: { line: done, character: 6 } },
          text: "Over",
        },
      ]);
      await h.compile();
      h.workspace.selections.length = 0;
      await h.controller.stopGame("quit");
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
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Pick a path.") },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    const raisedAt = {
      uri: MAIN_URI,
      range: { start: { line: 11, character: 0 }, end: { line: 11, character: 21 } },
    };
    try {
      await h.compile();
      await h.select(lineOf("Pick a path."));
      await settle(20);
      const reports = () =>
        h.toEditor.filter((m) => m.method === "sparkdown/runtimeDiagnostics");
      const previewed = reports().length;
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      expect(reports().length).toBe(previewed + 1);
      expect(lastReported(h.toEditor)).toEqual([
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
      ]);
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
      await h.select(raisedAt.range.start.line);
      await settle(20);
      const played = [
        [lineOf(".. B"), 2, CONTINUES_WARNING, "runtime"],
        [raisedAt.range.start.line, 1, "boom", "runtime"],
      ];
      expect(lastReported(h.toEditor)).toEqual(played);
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

  it("of a newer PLAY leave out what the PLAY it replaced sent before it went", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Done here.") },
    });
    try {
      await h.compile();
      await h.select(lineOf("Done here."));
      await settle(20);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      const channelOfA = (h.link as any)._channel.name as string;

      let asked = false;
      let resume!: () => void;
      const resumed = new Promise<void>((resolve) => (resume = resolve));
      h.controller.ensureAudioContext = async () => {
        asked = true;
        await resumed;
      };
      const starting = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !asked; i++) await settle(2);
      expect(asked).toBe(true);

      new BroadcastChannel(channelOfA).postMessage({
        ...GameEncounteredRuntimeErrorMessage.type.notification({
          type: ErrorType.Warning,
          message: "a warning PLAY A sent",
          location: {
            uri: MAIN_URI,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          },
          state: "running",
        } as any),
        epoch: 1,
      });
      await settle(20);
      resume();
      expect(await starting).toBe(true);
      await settle(20);

      const reportsOfA = h.toEditor.filter(
        (m) =>
          m.method === "sparkdown/runtimeDiagnostics" &&
          JSON.stringify(m.params).includes("a warning PLAY A sent"),
      );
      expect(reportsOfA).toEqual([]);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});
