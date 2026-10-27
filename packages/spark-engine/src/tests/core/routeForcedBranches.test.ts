// #637 — a route that forces a verdict the program does not reach, because
// the line it shows needs it, follows the program everywhere else: a loop
// inside the forced branch runs its passes, and a loop the program never
// leaves inside one forced branch leaves the line to another forced route.

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

/** The route a search with `options` finds to the line holding `label`. */
function routeTo(lines: string[], label: string, options?: object) {
  const program = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.setStartFrom({
    file: URI,
    line: lines.findIndex((l) => l.includes(label)),
  });
  const to = game.startAddress;
  const route = Game.planRoute(
    game.story,
    program as any,
    game.routeStartOf(to),
    to,
    undefined,
    options,
  );
  expect(route?.steps.at(-1)?.address).toBe(to);
  return route!;
}

describe("a route that forces a verdict follows the program everywhere else", () => {
  test("a loop inside the branch the line needs runs its passes", () => {
    const src = [
      "store flag = false",
      "store total = 0",
      "-> start",
      "scene start",
      "  if flag then",
      "    for i = 1, 3 do",
      "      total += i",
      "    end",
      "    Target total {total}.",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 9, "total")).toBe(6);
  }, 120_000);

  test("a loop the program never leaves inside a forced branch leaves the line to another forced route", () => {
    // Forcing `flag` runs a loop that never ends; the line needs `a` and `b`
    // forced instead, two verdicts to the loop's one.
    const lines = [
      "store flag = false",
      "store a = false",
      "store b = false",
      "store laps = 0",
      "store total = 0",
      "-> start",
      "scene start",
      "  if a then",
      "    if b then",
      "      Target total {total}.",
      "    end",
      "  end",
      "  if flag then",
      "    while true do",
      "      laps += 1",
      "      if laps % 2 == 0 then",
      "        total += 1",
      "      end",
      "    end",
      "  end",
      "end",
      "",
    ];
    const route = routeTo(lines, "Target total");
    expect(route.conditions.map((c) => c.selected)).toEqual([true, true]);
    expect(route.decisions.filter((d: any) => d.departs)).toHaveLength(2);
  }, 120_000);

  test("a line inside a skipped branch after a long loop with a branch in its body is reached", () => {
    // Every pass of the loop is two conditions whose verdicts not taken wait
    // for the next level, and the loop outlasts level zero's bound.
    const lines = [
      "store flag = false",
      "store total = 0",
      "-> start",
      "scene start",
      "  for i = 1, 60000 do",
      "    if i % 3 == 0 then",
      "      total += 1",
      "    end",
      "  end",
      "  if flag then",
      "    Target total {total}.",
      "  end",
      "end",
      "",
    ];
    const route = routeTo(lines, "Target total");
    expect(route.conditions.at(-1)?.selected).toBe(true);
  }, 120_000);
});

describe("a verdict kept for a later level belongs to the route that kept it", () => {
  // Two choices reach the same condition with different state; forcing it
  // after one of them is the way to the line, after the other it is not.
  const MENU = [
    "store total = 0",
    "-> start",
    "scene start",
    "  choose",
    "  + [Safe]",
    "    & total = 1",
    "  + [Unsafe]",
    "    & total = 2",
    "  end",
  ];

  test("a later choice's visit to a condition does not replace an earlier choice's", () => {
    const src = [
      ...MENU,
      "  if false then",
      "    & assert(total == 1, 'safe only')",
      "    Target {total}.",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 12, "total")).toBe(1);
  }, 120_000);

  test("the route forcing fewer verdicts is found, whichever choice reached the condition last", () => {
    const lines = [
      ...MENU,
      "  if false then",
      "    if total == 1 then",
      "      Target {total}.",
      "    end",
      "  end",
      "end",
      "",
    ];
    expect(previewedStore(lines.join("\n"), 12, "total")).toBe(1);
    const route = routeTo(lines, "Target");
    expect(route.decisions.filter((d: any) => d.departs)).toHaveLength(1);
  }, 120_000);

  test("two choices inside a loop reaching the same condition keep their own verdicts", () => {
    const lines = [
      "store total = 0",
      "store path = 0",
      "-> start",
      "scene start",
      "  for i = 1, 3 do",
      "    choose",
      "    + [A]",
      "      & path = 1",
      "    + [B]",
      "      & path = 2",
      "    end",
      "    if false then",
      "      & assert(path == 1 and i == 2, 'A on pass 2 only')",
      "      Target {total} {path}.",
      "    end",
      "    total += i",
      "  end",
      "end",
      "",
    ];
    const route = routeTo(lines, "Target");
    expect(route.choices.map((c) => c.selected)).toEqual([
      expect.any(Number),
      0,
    ]);
  }, 120_000);
});
