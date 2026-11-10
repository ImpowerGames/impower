import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

function pausedGame(text: string, line: number) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: program as SparkProgram,
  } as never);
  const hits: unknown[] = [];
  game.connection.outgoing.addListener("game/hitBreakpoint", (m) => {
    hits.push(m);
  });
  game.setBreakpoints([{ file: MAIN, line }]);
  game.start();
  for (let i = 0; i < 12 && hits.length === 0; i += 1) {
    game.continue();
  }
  expect(hits.length).toBeGreaterThan(0);
  return game;
}

const SOURCE = [
  "store gold = 1",
  "store party = {\"Ada\", \"Lin\"}",
  "store gear = {sword = {damage = 3}}",
  "",
  "scene start",
  "  local bag = {\"rope\"}",
  "  You have {gold} gold.",
  "  done",
  "end",
  "",
].join("\n");

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("the evaluation context a watch reads", () => {
  it("gives the named story table as plain values, nested tables included, so a path into it resolves", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "party"))).toEqual({
      party: { "1": "Ada", "2": "Lin" },
    });
    expect(plain(game.getEvaluationContext(undefined, undefined, "gear"))).toEqual({
      gear: { sword: { damage: 3 } },
    });
  });

  it("gives a local table of the frame by name", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "bag"))).toEqual({
      bag: { "1": "rope" },
    });
  });

  it("gives nothing for a name the frame does not hold, and keeps tables out of the whole context a hover reads", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "silver"))).toEqual({});
    const whole = game.getEvaluationContext();
    expect(whole.gold).toBe(1);
    expect("party" in whole).toBe(false);
    expect("bag" in whole).toBe(false);
  });
});
