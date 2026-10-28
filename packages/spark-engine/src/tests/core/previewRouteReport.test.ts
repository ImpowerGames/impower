// #1656 — the preview reports every decision its route made: the option it
// took at each menu (Auto), each verdict it forced that the program does not
// reach (Forced), and each loop it left before the program would (Clipped,
// with the passes the loop ran), each at its line, with where the route
// starts and the line it ends at.
//
// What must hold:
//   - the example script of #1655 previewed at line 21 lists the option at
//     line 8, the `if` at line 15 forced true and the loop at line 18
//     clipped, from the top of scene `interrogation` at line 4 to line 21;
//   - a loop inside a forced branch that the search leaves part way is
//     clipped after the passes it ran;
//   - a hub menu met twice reports which time each option was offered;
//   - a line the program reaches on its own reports no forced or clipped
//     decision.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import type { PreviewRoute } from "../../game/core/types/PreviewRoute";
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

/** The route the preview takes to the 1-based `line` of `lines`, as the
 *  preview reports it. */
function previewRoute(lines: string[], line: number): PreviewRoute {
  const game: any = newGame(compileSrc(lines.join("\n")));
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  return game.previewRouteOf(
    game.plannedRoute,
    (uri: string, at: number) => (uri === URI ? lines[at] : undefined),
  );
}

/** Each decision as its kind and 1-based line. */
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
  test("the example of #1655 at line 21: an Auto choice, a Forced condition and a Clipped loop", () => {
    const route = previewRoute(interrogation, 21);
    expect(route.start.scene).toBe("interrogation");
    expect(route.start.location.range.start.line + 1).toBe(4);
    expect(route.target.range.start.line + 1).toBe(21);
    expect(kindsAndLines(route)).toEqual([
      ["auto", 8],
      ["forced", 15],
      ["clipped", 18],
    ]);
    const [choice, condition, loop] = route.decisions;
    expect(choice!.text).toBe("Tell the truth.");
    expect(choice!.meeting).toBe(1);
    expect(condition!.text).toBe("trust > 3");
    expect(condition!.verdict).toBe(true);
    expect(loop!.verdict).toBe(false);
    expect(loop!.passes).toBeGreaterThanOrEqual(0);
  }, 120_000);

  test("a loop the search leaves part way inside a forced branch is clipped after the passes it ran", () => {
    const lines = [
      "store flag = false",
      "store total = 0",
      "-> start",
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
    const route = previewRoute(lines, 9);
    expect(kindsAndLines(route)).toEqual([
      ["forced", 5],
      ["clipped", 6],
    ]);
    const loop = route.decisions[1]!;
    expect(loop.passes).toBeGreaterThan(0);
    expect(loop.passes).toBeLessThan(40000);
  }, 120_000);

  test("a loop left by its test or by a forced break is clipped, never forced", () => {
    // Whichever way the search leaves the loop, its test found false or the
    // branch with the `break` forced, the loop is clipped after the passes
    // it ran.
    const lines = [
      "store flag = false",
      "store total = 0",
      "-> start",
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
    const route = previewRoute(lines, 12);
    expect(route.decisions.map((d) => d.kind)).toEqual(["forced", "clipped"]);
    expect(route.decisions[0]!.location.range.start.line + 1).toBe(5);
    expect([6, 8]).toContain(route.decisions[1]!.location.range.start.line + 1);
    expect(route.decisions[1]!.passes).toBeGreaterThan(0);
  }, 120_000);

  test("a hub menu met twice says which time each option was offered", () => {
    const lines = [
      "store asked = 0",
      "-> start",
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
    const route = previewRoute(lines, 12);
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

  test("a line the program reaches on its own reports no forced or clipped decision", () => {
    const lines = [
      "store total = 0",
      "-> start",
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
    const route = previewRoute(lines, 8);
    expect(route.decisions).toEqual([]);
    expect(route.start.scene).toBe("start");
    expect(route.target.range.start.line + 1).toBe(8);
  }, 120_000);
});
