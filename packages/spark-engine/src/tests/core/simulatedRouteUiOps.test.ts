// A route replay runs every beat between the top of the scene and the target
// in one synchronous turn. Nothing displays those beats, so the UI operations
// they would produce must not be buffered: a game that connects after the
// replay displays exactly what a fresh game loaded from the replay's
// checkpoint displays, and a connected game reports nothing for the search.

import { describe, expect, test } from "vitest";
import {
  createHarness,
  flushMicrotasks,
  flattenMessages,
  MAIN_URI,
  normalizeMessages,
} from "../ui/harness/uiTestHarness";

// Dialogue, so each replayed beat would start the typewriter.
const BEATS = Array.from(
  { length: 40 },
  (_, i) => `  HERO:\n  Line number ${i}.\n`,
);

const SOURCE = `-> start

scene start
${BEATS.join("\n")}
  The target line.
end
`;

const TARGET_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("The target line."),
);

function bufferedOps(game: any): number {
  return (game.module.ui as any)._uiBatch.length;
}

describe("a simulated route buffers no UI operation", { timeout: 30_000 }, () => {
  test("the replay of a long scene leaves nothing in the UI buffer", () => {
    const h = createHarness(SOURCE, 0, { connect: false });
    const game: any = h.game;
    const before = bufferedOps(game);
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    expect(bufferedOps(game)).toBe(before);
  });

  test("a connect in the same turn sends what a fresh game loaded from the checkpoint sends", async () => {
    const routed = createHarness(SOURCE, 0, { connect: false });
    const game: any = routed.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    const checkpoint = game.save() as string;
    game.endSimulation();
    await routed.reconnect();
    await flushMicrotasks(10);

    const fresh = createHarness(SOURCE, 0, { connect: false });
    fresh.game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    fresh.game.load(checkpoint);
    await fresh.reconnect();
    await flushMicrotasks(10);

    expect(routed.messages.length).toBeGreaterThan(0);
    expect(normalizeMessages(routed.messages)).toEqual(
      normalizeMessages(fresh.messages),
    );

    // And the preview that follows displays the same beat the same way,
    // stopping no sound the replay never played.
    routed.reset();
    fresh.reset();
    await routed.preview(TARGET_LINE);
    await fresh.preview(TARGET_LINE);
    await flushMicrotasks(10);
    expect(
      flattenMessages(routed.messages).some((m) => m.method === "ui/write-text"),
    ).toBe(true);
    expect(normalizeMessages(routed.messages)).toEqual(
      normalizeMessages(fresh.messages),
    );
  });

  test("a connected game sends nothing for a route search", async () => {
    const h = createHarness(SOURCE, 0);
    await h.ready;
    h.reset();
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    await flushMicrotasks(10);
    expect(flattenMessages(h.messages).map((m) => m.method)).toEqual([]);
  });

  test("a game marked as previewing saves the checkpoint an unmarked game saves", () => {
    const search = (mark: boolean) => {
      const h = createHarness(SOURCE, 0, {
        connect: false,
        beforeConnect: (g) => {
          (g.context.system as any).previewing = undefined;
        },
      });
      const game: any = h.game;
      if (mark) {
        game.markPreviewing("start");
      }
      game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
      game.simulate();
      expect(game.context.system.previewing).toBe(mark ? "start" : undefined);
      // The module state; the story's random seed differs between any two
      // games.
      return JSON.parse(game.save() as string).modules;
    };
    const marked = search(true);
    expect(marked.ui.style.continue_indicator).toBeDefined();
    expect(marked).toEqual(search(false));
  });

  test("a game built without a preview point previews as a game built with one", async () => {
    const h = createHarness(SOURCE, 0, {
      connect: false,
      beforeConnect: (g) => {
        (g as any)._state = "initial";
      },
    });
    await h.reconnect();
    expect(h.game.state).toBe("initial");
    await h.preview(TARGET_LINE);
    expect(h.game.state).toBe("previewing");
  });

  test("ending the simulation clears the flag the replay set", () => {
    const h = createHarness(SOURCE, 0, { connect: false });
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.context.system.simulating).toBeTruthy();
    game.endSimulation();
    expect(game.context.system.simulating).toBeUndefined();
    expect(game.simulation).toBe("success");
  });
});
