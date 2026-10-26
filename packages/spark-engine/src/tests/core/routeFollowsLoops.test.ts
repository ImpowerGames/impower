// #637 — the preview replays a route to the line it shows, and a store that a
// loop before that line changes must hold what the loop wrote.
//
// The route search forks at every decision a story reaches, a loop's test
// included. A route that forces a loop's test false the first time it is
// asked reaches the line after the loop in fewer decisions than one that lets
// the loop run, so a search that counts every decision alike replays the
// shorter route and the preview shows the store as it was before the loop.
//
// What must hold: a route takes every decision the program's way, a loop's
// test, a branch inside or around the loop and a `break` included, wherever
// that leads to the target; it forces a verdict only when that is the way
// there; and a branch the program skips stays reachable beside a loop that
// never ends.

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

  test("a branch inside a loop takes the program's side on every pass", () => {
    const src = [
      "store total = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  for i = 1, 3 do",
      "    if i == 2 then",
      "      total += 10",
      "    end",
      "    total += i",
      "  end",
      "  The loop counted {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 12, "total")).toBe(16);
  }, 120_000);

  test("a long loop runs every pass", () => {
    const src = [
      "store total = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  for i = 1, 2000 do",
      "    total += 1",
      "  end",
      "  The loop counted {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 9, "total")).toBe(2000);
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

  test("a branch the program skips is reached beside a loop that never ends", () => {
    // The program's own side runs a loop forever, each pass changing the
    // store; the forced side is the only way to the line.
    const src = [
      "store flag = false",
      "store laps = 0",
      "",
      "-> start",
      "",
      "scene start",
      "  if flag then",
      "    Target branch.",
      "  else",
      "    while true do",
      "      laps += 1",
      "    end",
      "  end",
      "end",
      "",
    ].join("\n");
    const lines = src.split("\n");
    const program = compileSrc(src);
    const game: any = newGame(program);
    game.setStartFrom({
      file: URI,
      line: lines.findIndex((l) => l.includes("Target branch.")),
    });
    const to = game.startAddress;
    const route = Game.planRoute(
      game.story,
      program as any,
      game.routeStartOf(to),
      to,
    );
    expect(route?.steps.at(-1)?.address).toBe(to);
    expect(route?.conditions.map((c) => c.selected)).toEqual([true]);
  }, 120_000);

  test("a branch the program skips is reached before the menus after it", () => {
    // Every way through the menus is the program's own, but each takes
    // choices; none of them leads to the line, so they are not explored
    // before the forced branch.
    const menus = Array.from({ length: 9 }, (_, i) => [
      "  choose",
      `  + [Left ${i}]`,
      "    & total += 1",
      `  + [Right ${i}]`,
      "    & total += 2",
      "  then",
      `    Menu ${i} done.`,
      "  end",
    ]).flat();
    const src = [
      "store flag = false",
      "store total = 0",
      "",
      "-> start",
      "",
      "scene start",
      "  if flag then",
      "    Target branch.",
      "  end",
      ...menus,
      "end",
      "",
    ].join("\n");
    const lines = src.split("\n");
    const program = compileSrc(src);
    const game: any = newGame(program);
    game.setStartFrom({
      file: URI,
      line: lines.findIndex((l) => l.includes("Target branch.")),
    });
    const to = game.startAddress;
    const route = Game.planRoute(
      game.story,
      program as any,
      game.routeStartOf(to),
      to,
      undefined,
      { maxNodes: 200 },
    );
    expect(route?.steps.at(-1)?.address).toBe(to);
    expect(route?.conditions.map((c) => c.selected)).toEqual([true]);
  }, 120_000);

  test("menus after a loop leave the loop's writes in place", () => {
    const src = [
      "store total = 0",
      "-> start",
      "scene start",
      "  for i = 1, 3 do",
      "    total += i",
      "  end",
      "  Middle beat.",
      "  Another middle beat.",
      "  if total > 0 then",
      "    choose",
      "    + [Only 0]",
      "      Picked.",
      "    end",
      "    choose",
      "    + [Only 1]",
      "      Picked.",
      "    end",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 19, "total")).toBe(6);
  }, 120_000);

  test("a run of menus after a loop leaves the loop's writes in place", () => {
    // Every way through the nine menus reaches the line, each with its own
    // `path`, so none of them merges with another.
    const menus = Array.from({ length: 9 }, (_, i) => [
      "  choose",
      `  + [Left ${i}]`,
      "    & path = path * 2 + 1",
      `  + [Right ${i}]`,
      "    & path = path * 2 + 2",
      "  end",
    ]).flat();
    const src = [
      "store total = 0",
      "store path = 0",
      "-> start",
      "scene start",
      "  for i = 1, 3 do",
      "    total += i",
      "  end",
      ...menus,
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    const line = src.split("\n").findIndex((l) => l.includes("Target total")) + 1;
    expect(previewedStore(src, line, "total")).toBe(6);
  }, 120_000);

  test("a branch the program skips is reached beside a single call that works past its level's bound", () => {
    const src = [
      "store flag = false",
      "store total = 0",
      "-> start",
      "scene start",
      "  if flag then",
      "    Target branch.",
      "  else",
      "    while true do",
      "      & table.foreachi(table.create(500000, 1), function(k, v) total += v end)",
      "    end",
      "  end",
      "end",
      "",
    ].join("\n");
    const lines = src.split("\n");
    const program = compileSrc(src);
    const game: any = newGame(program);
    game.setStartFrom({
      file: URI,
      line: lines.findIndex((l) => l.includes("Target branch.")),
    });
    const to = game.startAddress;
    const route = Game.planRoute(
      game.story,
      program as any,
      game.routeStartOf(to),
      to,
    );
    expect(route?.steps.at(-1)?.address).toBe(to);
    expect(route?.conditions.map((c) => c.selected)).toEqual([true]);
  }, 120_000);

  test("a branch the program skips is reached beside a loop that works hard and never ends", () => {
    const src = [
      "store flag = false",
      "store total = 0",
      "-> start",
      "scene start",
      "  if flag then",
      "    Target branch.",
      "  else",
      "    while true do",
      "      & table.foreachi(table.create(10000, 1), function(k, v) total += v end)",
      "    end",
      "  end",
      "end",
      "",
    ].join("\n");
    const lines = src.split("\n");
    const program = compileSrc(src);
    const game: any = newGame(program);
    game.setStartFrom({
      file: URI,
      line: lines.findIndex((l) => l.includes("Target branch.")),
    });
    const to = game.startAddress;
    const route = Game.planRoute(
      game.story,
      program as any,
      game.routeStartOf(to),
      to,
    );
    expect(route?.steps.at(-1)?.address).toBe(to);
    expect(route?.conditions.map((c) => c.selected)).toEqual([true]);
  }, 120_000);

  test("a break inside a loop leaves after the passes the program runs", () => {
    const src = [
      "store total = 0",
      "-> main",
      "scene main",
      "  for i = 1, 3 do",
      "    if i == 3 then",
      "      break",
      "    end",
      "    total += i",
      "  end",
      "  Target {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 10, "total")).toBe(3);
  }, 120_000);

  test("a branch around a loop is taken as the program takes it", () => {
    const src = [
      "store total = 0",
      "store go = true",
      "-> main",
      "scene main",
      "  if go then",
      "    for i = 1, 3 do",
      "      total += i",
      "    end",
      "  end",
      "  Target {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 10, "total")).toBe(6);
  }, 120_000);

  test("a loop in a choose block's preamble runs its passes", () => {
    const src = [
      "store total = 0",
      "-> main",
      "scene main",
      "  choose",
      "    for i = 1, 3 do",
      "      total += i",
      "      + Pick {i}",
      "    end",
      "  end",
      "  Target {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 10, "total")).toBe(6);
  }, 120_000);
});

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

describe("a search whose level spends its bound", () => {
  const HUB = [
    "store total = 0",
    "-> start",
    "scene start",
    "  choose",
    "  + [Again]",
    "    -> start",
    "  + [Leave]",
    "    Leaving.",
    "  end",
    "  Target total {total}.",
    "end",
    "",
  ];

  test("reaches the exit of a menu that can repeat forever, within small ceilings", () => {
    const route = routeTo(HUB, "Target total", {
      maxSteps: 4000,
      maxNodes: 500,
      searchTimeout: 30_000,
    });
    expect(route.choices.map((c) => c.selected)).toEqual([1]);
  }, 120_000);

  test("reaches the exit of a menu that can repeat forever, within the default ceilings", () => {
    const route = routeTo(HUB, "Target total");
    expect(route.choices.map((c) => c.selected)).toEqual([1]);
  }, 120_000);

  test("does not run a long call before the first condition twice", () => {
    // The call takes more than a level's bound before the search meets its
    // first condition. The bound is counted from that condition, so the call
    // is charged against no bound, and nothing runs it a second time.
    const src = [
      "store total = 0",
      "-> start",
      "scene start",
      "  & table.foreachi(table.create(150000, 1), function(k, v) total += v end)",
      "  if total > 0 then",
      "    Target total {total}.",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 6, "total")).toBe(150000);
  }, 120_000);

  test("a loop of menus within its level's bound runs every pass", () => {
    const src = [
      "store total = 0",
      "-> start",
      "scene start",
      "  for i = 1, 600 do",
      "    choose",
      "    + [Continue]",
      "      & total += 1",
      "    end",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 10, "total")).toBe(600);
  }, 120_000);

  test("a loop longer than its level's bound is left at the pass the bound ran out on", () => {
    // A finite search cannot tell this loop from one that never ends. The
    // next level takes up the run where the bound ran out, so the passes
    // level zero ran are kept.
    const lines = [
      "store total = 0",
      "-> start",
      "scene start",
      "  for i = 1, 40000 do",
      "    total += 1",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    ];
    const total = previewedStore(lines.join("\n"), 7, "total") as number;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(40000);
    const route = routeTo(lines, "Target total");
    expect(route.decisions.filter((d: any) => d.departs)).toHaveLength(1);
    expect(route.conditions.filter((c) => !c.selected)).toHaveLength(1);
    expect(route.conditions).toHaveLength(total + 1);
  }, 120_000);

  test("a branch the program skips before the loop that spent it is still reached", () => {
    const lines = [
      "store flag = false",
      "store total = 0",
      "-> start",
      "scene start",
      "  if flag then",
      "    Inside the branch {total}.",
      "  end",
      "  for i = 1, 400000 do",
      "    total += 1",
      "  end",
      "  After the loop.",
      "end",
      "",
    ];
    const route = routeTo(lines, "Inside the branch");
    expect(route.conditions.map((c) => c.selected)).toEqual([true]);
    expect(route.decisions.filter((d: any) => d.departs)).toHaveLength(1);
  }, 120_000);
});

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
