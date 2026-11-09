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

const BODYLESS = [
  "scene start",
  "  First.",
  "  choose",
  "    + [Run]",
  "    + [Hide]",
  "  end",
  "  After.",
  "  Later.",
  "end",
  "",
].join("\n");

const awaited = (source = STORY) => {
  const program = compileProgram(source);
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const waits: Record<string, unknown>[] = [];
  const picks: Record<string, unknown>[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    const { method, params } = message as unknown as { method: string; params: Record<string, unknown> };
    if (method === "game/awaitingInteraction") waits.push(params);
    if (method === "game/chosePathToContinue") picks.push(params);
  });
  return { game, waits, picks };
};

const toChoice = (game: Game, waits: Record<string, unknown>[]) => {
  game.start();
  for (let i = 0; i < 4 && waits.at(-1)?.["choices"] !== true; i++) {
    game.continue();
  }
  expect(waits.at(-1)?.["choices"]).toBe(true);
};

const pickedLine = (picks: Record<string, unknown>[]) =>
  (picks.at(-1)?.["option"] as { range: { start: { line: number } } } | undefined)?.range.start.line;

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

  it.each([
    ["the first option with a body", STORY, 0, 3],
    ["the second option with a body", STORY, 1, 5],
    ["the first bodyless option", BODYLESS, 0, 3],
    ["the second bodyless option", BODYLESS, 1, 4],
  ])("reports the line of %s when it is picked", (_name, source, index, line) => {
    const { game, waits, picks } = awaited(source);
    toChoice(game, waits);
    game.chosePathToContinue(index);
    expect(pickedLine(picks)).toBe(line);
  });
});
