// A logic line (`& …`) is a place the editor can point at: PLAY from it runs
// it, a preview of it shows the beat it leads to, and an error it raises is
// reported on it (#824).
//
// A host resolves a source line through `program.pathLocations`, which gives a
// logic line the paths of the instructions it compiles to.

import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

const ASSIGN = `store x = 0
A
& x = 1
x is {x}.
`;

const RAISE = `A
& error("boom")
C
`;

describe("logic line resolution (#824)", () => {
  test("PLAY from a logic line starts on that line and runs it", async () => {
    const harness = createHarness(ASSIGN, 2);
    await harness.ready;
    const game: any = harness.game;
    expect(game.setStartFrom({ file: MAIN_URI, line: 2 })).toEqual({
      file: MAIN_URI,
      line: 2,
    });
    game.start();
    game.continue();
    expect(game._story.variablesState["x"]).toBe(1);
  });

  test("a preview of a logic line shows the beat it leads to, with its effect", async () => {
    // Positive control: the logic line's own path must not stop the preview
    // short of the display beat after it.
    const simulator = createHarness(ASSIGN, 0, { connect: false });
    const simulated: any = simulator.game;
    simulated.setStartFrom({ file: MAIN_URI, line: 2 });
    simulated.simulate();
    expect(simulated.simulation).toBe("success");
    const checkpoint = simulated.save();

    const player = createHarness(ASSIGN, 2, { loadCheckpoint: checkpoint });
    await player.ready;
    player.reset();
    const path = await player.preview(2);
    expect(path).toBeTruthy();
    expect(writtenText(player)).toContain("x is 1.");
  });

  test("an error raised by a logic line is reported on that line", async () => {
    const harness = createHarness(RAISE, 0);
    await harness.ready;
    const errors: any[] = [];
    const game: any = harness.game;
    game.connection.emit = ((emit) => (message: any) => {
      if (message?.method === "game/runtimeError") errors.push(message.params);
      return emit(message);
    })(game.connection.emit.bind(game.connection));
    game.start();
    for (let i = 0; i < 5 && errors.length === 0; i++) game.continue();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].location.range.start.line).toBe(1);
  });
});
