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
const LIB_URI = "inmemory:///lib.sd";

const script = (uri: string, text: string) => ({
  uri,
  type: "script",
  name: uri.split("/").pop()!.replace(".sd", ""),
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function preview(
  lines: string[],
  line: number,
  others: Record<string, string[]> = {},
): { route: PreviewRoute; game: any } {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      script(URI, lines.join("\n")),
      ...Object.entries(others).map(([uri, text]) => script(uri, text.join("\n"))),
    ],
  } as never);
  const program = requireChunks(compiler.compile({ textDocument: { uri: URI } }).program);
  const game: any = new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  const source: ScriptSource = {
    lineText: (uri, at) => compiler.documents.get(uri)?.getLineText(at),
    structure: (uri) => compiler.structureOf(uri),
  };
  return { route: game.previewRouteOf(game.plannedRoute, source), game };
}

const forcedIn = (route: PreviewRoute, uri = URI) =>
  expandLineRanges(route.forcedLines?.[uri] ?? []).map((line) => line + 1);

const forcedVerdicts = (route: PreviewRoute) =>
  route.decisions.filter((d) => d.kind === "forced").map((d) => d.location.range.start.line + 1);

describe("the lines a route ran only because a branch was forced", () => {
  test("the example of #1655 forces the branch's statements, not the condition or anything before it", () => {
    const { route } = preview(
      [
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
      ],
      21,
    );
    expect(forcedVerdicts(route)).toEqual([15]);
    const forced = forcedIn(route);
    expect(forced).toEqual(expect.arrayContaining([17, 18, 21]));
    expect(forced.every((line) => line > 15)).toBe(true);
  }, 120_000);

  test("a function the forced branch calls is forced though it is written above the branch", () => {
    const { route, game } = preview(
      [
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
      ],
      14,
    );
    expect(game.story.variablesState["count"]).toBe(1);
    const forced = forcedIn(route);
    expect(forced).toEqual(expect.arrayContaining([5, 13, 14]));
    expect(forced).not.toContain(12);
  }, 120_000);

  test("a function written below the scene is forced only where the forced branch called it", () => {
    const { route, game } = preview(
      [
        "store flag = false",
        "store count = 0",
        "scene start",
        "  count += earlier()",
        "  choose",
        "    * [Continue.]",
        "      count += 0",
        "  end",
        "  if flag then",
        "    count += forced()",
        "    Target {count}.",
        "  end",
        "end",
        "",
        "function earlier()",
        "  return 10",
        "end",
        "",
        "function forced()",
        "  return 1",
        "end",
        "",
      ],
      11,
    );
    expect(game.story.variablesState["count"]).toBe(11);
    const forced = forcedIn(route);
    expect(forced).toEqual(expect.arrayContaining([10, 11, 20]));
    for (const line of [4, 9, 16]) {
      expect(forced).not.toContain(line);
    }
  }, 120_000);

  test("a function in another script that the forced branch calls is forced in that script", () => {
    const { route, game } = preview(
      [
        "store flag = false",
        "store count = 0",
        "scene start",
        "  if flag then",
        "    count += helper()",
        "    Target {count}.",
        "  end",
        "end",
        "",
      ],
      6,
      {
        [LIB_URI]: ["function helper()", "  return 7", "end", ""],
      },
    );
    expect(game.story.variablesState["count"]).toBe(7);
    expect(forcedIn(route)).toEqual(expect.arrayContaining([5, 6]));
    expect(forcedIn(route)).not.toContain(4);
    expect(forcedIn(route, LIB_URI)).toContain(2);
  }, 120_000);

  test("a branch forced inside a forced branch is forced from the outer verdict", () => {
    const { route } = preview(
      [
        "store a = false",
        "store b = false",
        "",
        "scene start",
        "  Before.",
        "  if a then",
        "    Outer.",
        "    if b then",
        "      Inner.",
        "    end",
        "  end",
        "end",
        "",
      ],
      9,
    );
    expect(forcedVerdicts(route)).toEqual([6, 8]);
    const forced = forcedIn(route);
    expect(forced).toEqual(expect.arrayContaining([7, 8, 9]));
    expect(forced).not.toContain(5);
    expect(forced).not.toContain(6);
  }, 120_000);

  test("a line that also ran before the forced verdict is not forced, as when a loop runs it again", () => {
    const { route } = preview(
      [
        "store flag = false",
        "store seen = 0",
        "",
        "scene start",
        "  while seen < 3 do",
        "    seen += 1",
        "    Pass {seen}.",
        "    if flag and seen == 2 then",
        "      Target.",
        "    end",
        "  end",
        "end",
        "",
      ],
      9,
    );
    expect(forcedVerdicts(route)).toEqual([8]);
    const forced = forcedIn(route);
    expect(forced).toEqual([9]);
  }, 120_000);

  test("a forced verdict whose line runs again in a loop does not force the loop around it", () => {
    const { route } = preview(
      [
        "store flag = false",
        "store seen = 0",
        "",
        "scene start",
        "  while seen < 3 do",
        "    seen += 1",
        "    if flag then",
        "      if seen == 2 then",
        "        Target.",
        "      end",
        "    end",
        "  end",
        "end",
        "",
      ],
      9,
    );
    const forced = forcedIn(route);
    expect(forced).toContain(9);
    expect(forced).not.toContain(6);
    expect(forced).not.toContain(7);
  }, 120_000);

  test("a forced step and an unforced step on one line leave that line unforced when it also ran before", () => {
    const { route } = preview(
      [
        "store flag = false",
        "store n = 0",
        "",
        "scene start",
        "  for i = 1, 2 do",
        "    n += 1; Step {n}.",
        "    if flag and i == 2 then",
        "      Target.",
        "    end",
        "  end",
        "end",
        "",
      ],
      8,
    );
    const forced = forcedIn(route);
    expect(forced).toContain(8);
    expect(forced).not.toContain(6);
  }, 120_000);

  test("a route that forced nothing reports no forced lines", () => {
    const { route } = preview(
      [
        "store trust = 5",
        "",
        "scene start",
        "  if trust > 3 then",
        "    Believed.",
        "  end",
        "end",
        "",
      ],
      5,
    );
    expect(forcedVerdicts(route)).toEqual([]);
    expect(route.forcedLines).toBeUndefined();
  }, 120_000);
});
