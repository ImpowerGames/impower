import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "./Game";

const compile = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

const createGame = () =>
  new Game({
    program: compile("A beat.\n"),
  } as never);

describe("Game debugging", () => {
  it("turns the flag on", () => {
    const game = createGame();
    game.startDebugging();
    expect(game.context.system.debugging).toBe(true);
  });

  it("turns the flag back off", () => {
    const game = createGame();
    game.startDebugging();
    game.stopDebugging();
    expect(game.context.system.debugging).toBe(false);
  });
});
