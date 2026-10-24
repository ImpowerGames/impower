// #637 — the preview replays a route to the line it shows, and a store that a
// loop before that line changes must hold what the loop wrote.
//
// The route search forks at every decision a story reaches, a loop's test
// included. A route that forces a loop's test false the first time it is
// asked reaches the line after the loop in fewer decisions than one that lets
// the loop run, so a search that counts every decision alike replays the
// shorter route and the preview shows the store as it was before the loop.
//
// What must hold: a route follows the verdict the program itself reaches at a
// decision whenever that verdict leads to the target, and forces the opposite
// verdict only when it is the way there.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

function compileSrc(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program);
}

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

/** The value the store `name` holds once the preview's replay has reached
 *  the 1-based `line`, as the preview displays that line with it. */
function previewedStore(
  src: string,
  line: number,
  name: string,
  favoredConditions?: boolean[],
): unknown {
  const game: any = newGame(compileSrc(src));
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate(
    favoredConditions && {
      [game.routeStartOf(game.startAddress)]: { favoredConditions },
    },
  );
  expect(game.simulation).toBe("success");
  return game.story.variablesState[name];
}

describe("a previewed line after a loop shows what the loop wrote", () => {
  test("a while loop inside a called function", () => {
    const src = [
      "store total = 0",
      "",
      "scene s0",
      "  & g()",
      "  Loop total {total}.",
      "end",
      "",
      "function g()",
      "  local n = 0",
      "  while n < 2 do",
      "    n = n + 1",
      "    total = total + n",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 5, "total")).toBe(3);
  }, 120_000);

  test("a for loop inside a called function", () => {
    const src = [
      "store total = 0",
      "",
      "scene s0",
      "  & g()",
      "  Loop total {total}.",
      "end",
      "",
      "function g()",
      "  for i = 1, 2 do",
      "    total += i",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 5, "total")).toBe(3);
  }, 120_000);

  test("a for loop written in the scene", () => {
    const src = [
      "store total = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  for i = 1, 3 do",
      "    total += i",
      "  end",
      "  The loop counted {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 9, "total")).toBe(6);
  }, 120_000);

  test("a favored verdict from an earlier route does not end a loop early", () => {
    // The editor favors the verdicts the last route through the scene took,
    // matched by their order. After the loop's bound is raised from 2 to 3,
    // those verdicts end the loop one pass short.
    const src = [
      "store total = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  for i = 1, 3 do",
      "    total += i",
      "  end",
      "  The loop counted {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 9, "total", [true, true, false])).toBe(6);
  }, 120_000);

  test("a for loop at story scope", () => {
    const src = [
      "store x = 0",
      "for i = 1, 3 do",
      "  x = i",
      "end",
      "Counted to {x}.",
      "",
    ].join("\n");
    expect(previewedStore(src, 5, "x")).toBe(3);
  }, 120_000);

  test("a line inside a branch the program skips is still reached", () => {
    // The control: forcing a verdict is still the way to a line only a
    // forced verdict reaches.
    const src = [
      "store seen = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  if seen > 5 then",
      "    seen = 7",
      "    Inside the branch {seen}.",
      "  end",
      "  After the branch.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 8, "seen")).toBe(7);
  }, 120_000);
});
