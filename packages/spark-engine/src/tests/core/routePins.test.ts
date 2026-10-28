// #1657 — the author pins the option the Game Preview takes at a menu. A pin
// names an option's line and which time the route is offered that option.
//
// What must hold:
//   - at a pinned meeting the route takes the pinned option wherever the
//     target line can be reached through it, forcing `if` verdicts if it
//     must, even when another option reaches the line forcing none;
//   - it leaves the pin when the line cannot be reached through it (a target
//     inside another option), and the report says the pin was not followed;
//   - a pinned gated option (`* if cond`) is offered by forcing its gate;
//   - a once-only option the route already took cannot be offered again, so
//     a pin on a later offer of it is left there;
//   - a hub is pinned meeting by meeting;
//   - when an edit leaves two pins on one stop, the option listed first wins
//     and the other is not followed;
//   - a pin whose line holds no option is unresolved, ignored and reported.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import type {
  PreviewRoute,
  ScriptSource,
} from "../../game/core/types/PreviewRoute";
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

/** A pin on the 1-based `line` at its `offer`-th offer. */
const pin = (line: number, offer = 1) => ({ uri: URI, line: line - 1, offer });

/** The route the preview takes to the 1-based `line` of `lines` with `pins`,
 *  as the preview reports it, and the value of the store `counted` once the
 *  replay has reached the line. */
function preview(
  lines: string[],
  line: number,
  pins: { uri: string; line: number; offer: number }[],
  counted?: string,
): { route: PreviewRoute; count: unknown } {
  const { compiler, program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.setRoutePins?.(pins);
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

/** Each decision as its kind and 1-based line. */
const kindsAndLines = (route: PreviewRoute) =>
  route.decisions.map((d) => [d.kind, d.location.range.start.line + 1]);

const interrogation = [
  "store trust = 0",
  "",
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Show the photograph.]",
  "      trust += 5",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    Believed.",
  "  end",
  "  Done.",
  "end",
  "",
];

/** The example script of #1655. */
const example = [
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

describe("the preview's route keeps the author's pins", () => {
  test("a pin that costs a forced verdict is kept", () => {
    const { route, count } = preview(interrogation, 13, [pin(5)], "trust");
    expect(kindsAndLines(route)).toEqual([
      ["pinned", 5],
      ["forced", 12],
    ]);
    expect(route.decisions[0]!.text).toBe("Tell the truth.");
    expect(count).toBe(2);
  }, 120_000);

  test("a target inside another option leaves the pin, which is not followed", () => {
    const { route, count } = preview(interrogation, 8, [pin(9)], "trust");
    expect(kindsAndLines(route)).toEqual([["auto", 7]]);
    expect(route.decisions[0]!.notFollowed).toBe(true);
    expect(count).toBe(5);
  }, 120_000);

  test("a choice entry lists the options offered at its stop, the pinned one marked", () => {
    const { route } = preview(interrogation, 15, [pin(9)]);
    const [choice] = route.decisions;
    expect(choice!.kind).toBe("pinned");
    expect(
      choice!.options?.map((o) => [
        o.text,
        o.location.range.start.line + 1,
        o.offer,
        Boolean(o.pinned),
      ]),
    ).toEqual([
      ["Tell the truth.", 5, 1, false],
      ["Show the photograph.", 7, 1, false],
      ["Lie.", 9, 1, true],
    ]);
  }, 120_000);

  test("a pinned gated option is offered by forcing its gate", () => {
    const lines = [
      "store key = false",
      "",
      "scene s",
      "  choose",
      "    * [Wait.]",
      "      Waited.",
      "    * if key [Show the key.]",
      "      Shown.",
      "  end",
      "  After.",
      "end",
      "",
    ];
    const { route } = preview(lines, 10, [pin(7)]);
    expect(kindsAndLines(route)).toEqual([
      ["forced", 7],
      ["pinned", 7],
    ]);
    expect(route.decisions[1]!.text.trim()).toBe("Show the key.");
  }, 120_000);

  test("a once-only option already taken leaves the pin on its later offer", () => {
    const lines = [
      "store asked = 0",
      "-> start",
      "scene start",
      "  while asked < 2 do",
      "    choose",
      "    * [Ask about the key.]",
      "      & asked += 1",
      "    + [Ask about the letter.]",
      "      & asked += 1",
      "    end",
      "  end",
      "  Done asking.",
      "end",
      "",
    ];
    const { route } = preview(lines, 12, [pin(6, 1), pin(6, 2)]);
    expect(kindsAndLines(route)).toEqual([
      ["pinned", 6],
      ["auto", 8],
    ]);
    expect(route.decisions[1]!.notFollowed).toBe(true);
  }, 120_000);

  test("a hub is pinned meeting by meeting", () => {
    const lines = [
      "store stage = 0",
      "-> start",
      "scene start",
      "  while stage < 1 do",
      "    choose",
      "    + [Ask about the key.]",
      "      Key.",
      "    + [Ask about the letter.]",
      "      Letter.",
      "    + [Leave.]",
      "      & stage = 1",
      "    end",
      "  end",
      "  Gone.",
      "end",
      "",
    ];
    const { route } = preview(lines, 14, [pin(6, 1), pin(8, 2), pin(10, 3)]);
    expect(route.decisions.map((d) => [d.kind, d.text, d.meeting])).toEqual([
      ["pinned", "Ask about the key.", 1],
      ["pinned", "Ask about the letter.", 2],
      ["pinned", "Leave.", 3],
    ]);
  }, 120_000);

  test("two pins on one stop: the option listed first wins and the other is not followed", () => {
    const { route } = preview(interrogation, 15, [pin(9), pin(7)]);
    const [choice] = route.decisions;
    expect(choice!.kind).toBe("pinned");
    expect(choice!.text).toBe("Show the photograph.");
    expect(choice!.notFollowed).toBe(true);
  }, 120_000);

  test("the example of #1655 at line 21 with Tell the truth. pinned: Pinned 8, Forced 15, Clipped 18", () => {
    const { route } = preview(example, 21, [pin(8)]);
    expect(kindsAndLines(route)).toEqual([
      ["pinned", 8],
      ["forced", 15],
      ["clipped", 18],
    ]);
  }, 120_000);

  test("the example of #1655 at line 11 with Lie. pinned takes Show the photograph., the pin not followed", () => {
    // Every route through Lie. runs the loop of 40,000 passes, which the
    // tier's share ends before the search's budget does.
    const { route, count } = preview(example, 11, [pin(12)], "trust");
    expect(kindsAndLines(route)).toEqual([["auto", 10]]);
    expect(route.decisions[0]!.text).toBe("Show the photograph.");
    expect(route.decisions[0]!.notFollowed).toBe(true);
    expect(count).toBe(5);
  }, 120_000);

  test("a pin whose line holds no option is unresolved and ignored", () => {
    const { route } = preview(interrogation, 15, [pin(6), pin(5)]);
    expect(route.decisions[0]!.kind).toBe("pinned");
    expect(route.unresolvedPins).toEqual([pin(6)]);
  }, 120_000);
});
