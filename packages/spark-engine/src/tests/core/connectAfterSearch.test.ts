import { describe, expect, test } from "vitest";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
  normalizeMessages,
} from "../ui/harness/uiTestHarness";

const SOURCE = `store hp = 100

layout hud {
  text "HP: {hp}"
}


scene start
  HERO:
  The first line.

  & hp = 40

  HERO:
  The second line.

  HERO:
  The target line.
end
`;

const TARGET_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("The target line."),
);

const textWrites = (messages: any[]) =>
  flattenMessages(messages).filter((m) => m.method === "ui/write-text");

describe("a connect after a route search", { timeout: 30_000 }, () => {
  test("leaves the replay flag unset once the search returns", () => {
    const h = createHarness(SOURCE, 0, { connect: false });
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    expect(game.context.system.simulating).toBeUndefined();
  });

  test("marks a search that finds no route as failed", () => {
    const source = `scene start
  First beat.
  -> other
  Nothing ever reaches this line.
end

scene other
  Elsewhere.
end
`;
    const h = createHarness(source, 0, { connect: false });
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: 3 });
    game.simulate();
    expect(game.simulationFailure).toBe("exhausted");
    expect(game.simulation).toBe("fail");
    expect(game.context.system.simulating).toBeUndefined();
  });

  test("emits the restored values and the transient clears a fresh load emits", async () => {
    const routed = createHarness(SOURCE, 0);
    await routed.ready;
    const game: any = routed.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    const checkpoint = game.save() as string;
    routed.reset();
    await routed.reconnect();
    await flushMicrotasks(10);

    const fresh = createHarness(SOURCE, 0, { connect: false });
    fresh.game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    fresh.game.load(checkpoint);
    await fresh.reconnect();
    await flushMicrotasks(10);

    expect(JSON.stringify(routed.messages)).toContain("HP: 40");
    expect(
      textWrites(routed.messages).some(
        (m) => (m.params?.instructions ?? []).length === 0,
      ),
    ).toBe(true);
    expect(normalizeMessages(routed.messages)).toEqual(
      normalizeMessages(fresh.messages),
    );
  });
});
