import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";
const SHOP = "file:///local/shop.sd";

function debugGame(files: Record<string, string>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(files).map(([uri, text]) => ({
      uri,
      type: "script",
      name: uri.slice(uri.lastIndexOf("/") + 1, -3),
      ext: "sd",
      text,
      version: 1,
      languageId: "sparkdown",
    })) as never,
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
  game.setBreakpoints([{ file: MAIN, line: 4 }]);
  game.start();
  for (let i = 0; i < 12 && hits.length === 0; i += 1) {
    game.continue();
  }
  expect(hits.length).toBeGreaterThan(0);
  return game;
}

const names = (variables: { name: string }[]) => variables.map((v) => v.name);

describe("the Variables view's story and builtin values", () => {
  it("lists only the values the project's scripts declare as the story's, and the engine's own apart", () => {
    const game = debugGame({
      [MAIN]: [
        "store gold = 1",
        "store mood = \"calm\"",
        "",
        "scene start",
        "  You have {gold} gold.",
        "  done",
        "end",
        "",
      ].join("\n"),
      [SHOP]: ["store price = 3", ""].join("\n"),
    });
    expect(names(game.getVarVariables()).sort()).toEqual(["gold", "mood", "price"]);
    const builtins = names(game.getBuiltinVariables());
    expect(builtins).toEqual(expect.arrayContaining(["config", "game"]));
    expect(builtins).not.toEqual(expect.arrayContaining(["gold"]));
  });
});
