import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import type {
  PreviewRoute,
  ScriptSource,
} from "../../game/core/types/PreviewRoute";
import { expandLineRanges } from "../../game/core/utils/executedLineRanges";
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
  return { compiler, program: requireChunks(result.program) };
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

function preview(
  lines: string[],
  line: number,
  counted?: string,
): { route: PreviewRoute; count: unknown } {
  const { compiler, program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  const source: ScriptSource = {
    lineText: (uri, at) => compiler.documents.get(uri)?.getLineText(at),
    structure: (uri) => compiler.structureOf(uri),
  };
  return {
    route: game.previewRouteOf(game.plannedRoute, source),
    count: counted ? game.story.variablesState[counted] : undefined,
  };
}

function executedLinesAt(lines: string[], line: number): number[] {
  const { program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  const ranges = game.executedParams().executedLines?.[URI]?.ranges ?? [];
  return expandLineRanges(ranges).map((l: number) => l + 1);
}

const kindsAndLines = (route: PreviewRoute) =>
  route.decisions.map((d) => [d.kind, d.location.range.start.line + 1]);

const interrogation = [
  "store trust = 0",
  "store clues = 0",
  "",
  "scene interrogation",
  "  INSPECTOR:",
  "    Where were you at nine?",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Show the photograph.]",
  "      trust += 5",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    INSPECTOR:",
  "      I believe you.",
  "    for i = 1, 40000 do",
  "      clues += 1",
  "    end",
  "    You found {clues} clues.",
  "  end",
  "end",
  "",
];

describe("the route the preview reports", () => {
  test("the example of #1655 at line 21: an Auto choice that passes the condition and a Clipped loop", () => {
    const { route, count } = preview(interrogation, 21, "clues");
    expect(route.start.scene).toBe("interrogation");
    expect(route.start.location.range.start.line + 1).toBe(4);
    expect(route.target.range.start.line + 1).toBe(21);
    expect(kindsAndLines(route)).toEqual([
      ["auto", 10],
      ["clipped", 18],
    ]);
    const [choice, loop] = route.decisions;
    expect(choice!.text).toBe("Show the photograph.");
    expect(choice!.meeting).toBe(1);
    expect(loop!.verdict).toBe(false);
    expect(loop!.passes).toBe(count);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40000);
  }, 120_000);

  test("the executed lines at line 21 of #1655's example leave out the options the route did not take", () => {
    expect(executedLinesAt(interrogation, 21)).toEqual([
      6, 7, 10, 11, 15, 17, 18, 19, 21,
    ]);
  }, 120_000);

  test("the executed lines in the first and the last option's body light only that option", () => {
    expect(executedLinesAt(interrogation, 9)).toEqual([6, 7, 8, 9, 15, 23]);
    expect(executedLinesAt(interrogation, 13)).toEqual([6, 7, 12, 13, 15, 23]);
  }, 120_000);

  test("the executed lines leave out an option its condition hid and keep the option the route took", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  choose",
      "    * if key [Show the key.]",
      "      You show the key.",
      "    * [Knock.]",
      "      You knock.",
      "  end",
      "  The door opens.",
      "end",
      "",
    ];
    expect(executedLinesAt(lines, 10)).toEqual([4, 7, 8, 10]);
  }, 120_000);

  test("a loop the search leaves part way inside a forced branch is clipped after the passes it ran", () => {
    const lines = [
      "store flag = false",
      "store total = 0",
      "",
      "scene start",
      "  if flag then",
      "    for i = 1, 40000 do",
      "      total += 1",
      "    end",
      "    Inside the branch {total}.",
      "  end",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 9, "total");
    expect(kindsAndLines(route)).toEqual([
      ["forced", 5],
      ["clipped", 6],
    ]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40000);
    expect(route.decisions[1]!.passes).toBe(count);
  }, 120_000);

  test("a while loop left by its test or by a forced break is clipped after the passes it ran", () => {
    const lines = [
      "store flag = false",
      "store total = 0",
      "",
      "scene start",
      "  if flag then",
      "    while total >= 0 do",
      "      total += 1",
      "      if total > 1000000 then",
      "        break",
      "      end",
      "    end",
      "    Inside the branch {total}.",
      "  end",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 12, "total");
    expect(route.decisions.map((d) => d.kind)).toEqual(["forced", "clipped"]);
    expect(route.decisions[0]!.location.range.start.line + 1).toBe(5);
    expect(route.decisions[1]!.location.range.start.line + 1).toBe(6);
    expect(count).toBeGreaterThan(0);
    expect(route.decisions[1]!.passes).toBe(count);
  }, 120_000);

  test("an endless repeat loop is clipped after the passes its route ran", () => {
    const lines = [
      "store total = 0",
      "",
      "scene start",
      "  repeat",
      "    total += 1",
      "  until false",
      "  Target {total}.",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 7, "total");
    expect(kindsAndLines(route)).toEqual([["clipped", 4]]);
    expect(count).toBeGreaterThan(1);
    expect(route.decisions[0]!.passes).toBe(count);
  }, 120_000);

  test("a forced break in an endless loop is a clipped loop", () => {
    const lines = [
      "store total = 0",
      "",
      "scene start",
      "  repeat",
      "    total += 1",
      "    if total > 1000000 then",
      "      break",
      "    end",
      "  until false",
      "  Target {total}.",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 10, "total");
    expect(kindsAndLines(route)).toEqual([["clipped", 4]]);
    expect(count).toBeGreaterThan(1);
    expect(route.decisions[0]!.passes).toBe(count);
  }, 120_000);

  test("a forced branch inside a loop that stays in the loop is forced", () => {
    const lines = [
      "store total = 0",
      "",
      "scene start",
      "  for i = 1, 3 do",
      "    total += 1",
      "    if total > 10 then",
      "      Inside the loop {total}.",
      "    end",
      "  end",
      "end",
      "",
    ];
    const { route } = preview(lines, 7);
    expect(kindsAndLines(route)).toEqual([["forced", 6]]);
    expect(route.decisions[0]!.text).toBe("total > 10");
  }, 120_000);

  test("a forced branch inside a loop that calls a function written elsewhere is forced", () => {
    const lines = [
      "store flag = false",
      "store count = 0",
      "function g()",
      "  if true then",
      "    return 1",
      "  end",
      "  return 2",
      "end",
      "",
      "scene start",
      "  for i = 1, 3 do",
      "    if flag then",
      "      count += g()",
      "      Target {count}.",
      "    end",
      "  end",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 14, "count");
    expect(count).toBe(1);
    expect(kindsAndLines(route)).toEqual([["forced", 12]]);
    expect(route.decisions[0]!.text).toBe("flag");
  }, 120_000);

  test("a hub menu met twice says which time each option was offered", () => {
    const lines = [
      "store asked = 0",
      "",
      "scene start",
      "  while asked < 2 do",
      "    choose",
      "    + [Ask about the key.]",
      "      & asked += 1",
      "    + [Ask about the letter.]",
      "      & asked += 1",
      "    end",
      "  end",
      "  Done asking.",
      "end",
      "",
    ];
    const { route } = preview(lines, 12);
    expect(kindsAndLines(route)).toEqual([
      ["auto", 6],
      ["auto", 6],
    ]);
    expect(route.decisions.map((d) => d.text)).toEqual([
      "Ask about the key.",
      "Ask about the key.",
    ]);
    expect(route.decisions.map((d) => d.meeting)).toEqual([1, 2]);
  }, 120_000);

  test("the executed lines leave out an untaken option written inside a block of the menu's preamble", () => {
    const lines = [
      "scene start",
      "  choose",
      "    if true then",
      "      do",
      "        local x = 1",
      "        * Inner {x}",
      "          Chose inner {x}.",
      "      end",
      "    end",
      "    * Outer",
      "      Chose outer.",
      "  end",
      "  After.",
      "end",
      "",
    ];
    const outer = executedLinesAt(lines, 11);
    expect(outer).toEqual(expect.arrayContaining([2, 3, 4, 5, 10, 11]));
    expect(outer).not.toContain(6);
    const inner = executedLinesAt(lines, 7);
    expect(inner).toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 7]));
    expect(inner).not.toContain(10);
  }, 120_000);

  test("the executed lines of a hub menu met twice light each option a meeting took and no other", () => {
    const hub = (bullet: string) => [
      "store asked = 0",
      "",
      "scene start",
      "  while asked < 2 do",
      "    choose",
      `    ${bullet} [Ask about the key.]`,
      "      & asked += 1",
      `    ${bullet} [Ask about the letter.]`,
      "      & asked += 1",
      "    end",
      "  end",
      "  Done asking.",
      "end",
      "",
    ];
    const sticky = executedLinesAt(hub("+"), 12);
    expect(sticky).toEqual(expect.arrayContaining([5, 6, 7, 12]));
    expect(sticky).not.toContain(8);
    expect(sticky).not.toContain(9);
    const once = executedLinesAt(hub("*"), 12);
    expect(once).toEqual(expect.arrayContaining([5, 6, 7, 8, 9, 12]));
  }, 120_000);

  test("a line the program reaches on its own reports no forced or clipped decision", () => {
    const lines = [
      "store total = 0",
      "",
      "scene start",
      "  for i = 1, 3 do",
      "    total += 1",
      "  end",
      "  if total > 2 then",
      "    Target {total}.",
      "  end",
      "end",
      "",
    ];
    const { route } = preview(lines, 8);
    expect(route.decisions).toEqual([]);
    expect(route.start.scene).toBe("start");
    expect(route.target.range.start.line + 1).toBe(8);
  }, 120_000);
});
