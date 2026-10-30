// #1747 — the Variables view at a stop inside a vararg function leaves out the
// local the function binds its `...` to, whose name holds a `$` like every
// other name the compiler generates, and shows an author's local of the old
// generated name, `__varargs__`, as the ordinary local it is.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

function debugGame(text: string) {
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
  return { game, hits };
}

const SOURCE = [
  "store result = 0", //           0
  "", //                           1
  "scene start", //                2
  '  result = f("x", "y")', //     3
  "  done", //                     4
  "end", //                        5
  "function f(...)", //            6
  '  local __varargs__ = "mine"', // 7
  "  local a = ...", //            8
  "  return a", //                 9
  "end", //                        10
  "",
].join("\n");

describe("the Variables view inside a vararg function", () => {
  it("shows an author's __varargs__ and leaves out the vararg slot", () => {
    const { game, hits } = debugGame(SOURCE);
    game.setBreakpoints([{ file: MAIN, line: 9 }]);
    game.start();
    for (let i = 0; i < 8 && hits.length === 0; i += 1) {
      game.continue();
    }
    expect(hits.length).toBeGreaterThan(0);
    const shown = game
      .getTempVariables()
      .map((v: { name: string; value: string }) => `${v.name}=${v.value}`)
      .sort();
    expect(shown).toEqual(['__varargs__="mine"', 'a="x"']);
  });
});
