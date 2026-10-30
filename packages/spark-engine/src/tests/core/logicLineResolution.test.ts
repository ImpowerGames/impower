import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

const ASSIGN = `store x = 0
scene start
  A
  & x = 1
  x is {x}.
end
`;

const RAISE = `scene start
  A
  & error("boom")
  C
end
`;

describe("logic line resolution (#824)", () => {
  test("PLAY from a logic line starts on that line and runs it", async () => {
    const harness = createHarness(ASSIGN, 3);
    await harness.ready;
    const game: any = harness.game;
    expect(game.setStartFrom({ file: MAIN_URI, line: 3 })).toEqual({
      file: MAIN_URI,
      line: 3,
    });
    game.start();
    game.continue();
    expect(game._story.variablesState["x"]).toBe(1);
  });

  test("a preview of a logic line shows the beat it leads to, with its effect", async () => {
    const simulator = createHarness(ASSIGN, 0, { connect: false });
    const simulated: any = simulator.game;
    simulated.setStartFrom({ file: MAIN_URI, line: 3 });
    simulated.simulate();
    expect(simulated.simulation).toBe("success");
    const checkpoint = simulated.save();

    const player = createHarness(ASSIGN, 3, { loadCheckpoint: checkpoint });
    await player.ready;
    player.reset();
    const path = await player.preview(3);
    expect(path).toBeTruthy();
    expect(writtenText(player)).toContain("x is 1.");
  });

  test("an error raised by a logic line is reported on that line", async () => {
    const harness = createHarness(RAISE, 1);
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
    expect(errors[0].location.range.start.line).toBe(2);
  });
});
