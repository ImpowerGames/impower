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

function previewedStore(
  src: string,
  line: number,
  name: string,
): unknown {
  const game: any = newGame(compileSrc(src));
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
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

  test("a short loop runs every pass", () => {
    const src = [
      "store total = 0",
      "",
      "-> main",
      "",
      "scene main",
      "  for i = 1, 50 do",
      "    total += 1",
      "  end",
      "  The loop counted {total}.",
      "end",
      "",
    ].join("\n");
    expect(previewedStore(src, 9, "total")).toBe(50);
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

  const longLoop = (passes: number) => [
    "store total = 0",
    "-> start",
    "scene start",
    `  for i = 1, ${passes} do`,
    "    total += 1",
    "  end",
    "  Target total {total}.",
    "end",
    "",
  ];

  test("a long loop with no beat in it runs every pass within the search's budget", () => {
    const lines = longLoop(4000);
    expect(previewedStore(lines.join("\n"), 7, "total")).toBe(4000);
    const route = routeTo(lines, "Target total");
    expect(route.fallback).toBeUndefined();
    expect(route.decisions.filter((d: any) => d.departs)).toHaveLength(0);
    expect(route.conditions.filter((c) => !c.selected)).toHaveLength(1);
    expect(route.conditions).toHaveLength(4001);
  }, 120_000);

  test("a loop with no beat in it longer than the search's budget shows origin/main's value", () => {
    const lines = longLoop(25000);
    expect(previewedStore(lines.join("\n"), 7, "total")).toBe(0);
    expect(routeTo(lines, "Target total").fallback).toBe(true);
  }, 120_000);

  test("a branch the program skips before a loop that outlasts the search's budget is still reached", () => {
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
    expect(route.fallback).toBe(true);
  }, 120_000);
});
