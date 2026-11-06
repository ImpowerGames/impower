import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../tests/harness/compileProgram";
import { Game } from "./Game";

const STORY = [
  "scene start",
  "  First beat.",
  "  choose",
  "    + [Run]",
  "      Ran.",
  "    + [Hide]",
  "      Hid.",
  "  end",
  "end",
  "",
].join("\n");

const awaited = () => {
  const program = compileProgram(STORY);
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const waits: Record<string, unknown>[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    const { method, params } = message as unknown as { method: string; params: Record<string, unknown> };
    if (method === "game/awaitingInteraction") waits.push(params);
  });
  return { game, waits };
};

describe("waiting for the reader", () => {
  it("says whether the wait is on a choice", () => {
    const { game, waits } = awaited();
    game.start();
    expect(waits.at(-1)?.["choices"]).toBe(false);
    for (let i = 0; i < 4 && waits.at(-1)?.["choices"] !== true; i++) {
      game.continue();
    }
    expect(waits.at(-1)?.["choices"]).toBe(true);
  });
});
