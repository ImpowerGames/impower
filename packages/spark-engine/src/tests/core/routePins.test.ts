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

const pin = (line: number, offer = 1) => ({ uri: URI, line: line - 1, offer });

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

const kindsAndLines = (route: PreviewRoute) =>
  route.decisions.map((d) => [d.kind, d.location.range.start.line + 1]);

const interrogation = [
  "store trust = 0",
  "",
  "scene start",
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

const example = [
  "store trust = 0",
  "store clues = 0",
  "",
  "scene start",
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
      "scene start",
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

  test("a pinned gated option wins its menu once a pinned once-only option listed before it is spent", () => {
    const lines = [
      "store asked = 0",
      "store key = false",
      "",
      "scene start",
      "  while asked < 2 do",
      "    choose",
      "    * [First.]",
      "      & asked += 1",
      "    + if key [Second.]",
      "      & asked += 1",
      "    + [Other.]",
      "      & asked += 1",
      "    end",
      "  end",
      "  Done.",
      "end",
      "",
    ];
    const { route } = preview(lines, 15, [pin(7, 1), pin(7, 2), pin(9)]);
    expect(
      route.decisions.map((d) => [d.kind, d.text.trim(), Boolean(d.notFollowed)]),
    ).toEqual([
      ["pinned", "First.", true],
      ["forced", "+ if key [Second.]", false],
      ["pinned", "Second.", true],
    ]);
  }, 120_000);

  test("a choice entry names where its menu is met, whichever options a gate lets it offer", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  choose",
      "    * if key [Show the key.]",
      "      Shown.",
      "    * [Wait.]",
      "      Waited.",
      "  end",
      "  After.",
      "end",
      "",
    ];
    const gated = preview(lines, 10, [pin(5)]).route.decisions.at(-1)!;
    const plain = preview(lines, 10, [pin(7)]).route.decisions.at(-1)!;
    expect(gated.options!.map((o) => o.text.trim())).toEqual([
      "Show the key.",
      "Wait.",
    ]);
    expect(plain.options!.map((o) => o.text.trim())).toEqual(["Wait."]);
    expect(gated.menu).toBeDefined();
    expect(plain.menu).toEqual(gated.menu);
  }, 120_000);

  test("a choice entry names the pins of its stop on options its menu did not offer", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  choose",
      "    * if key [Show the key.]",
      "      Shown.",
      "    * [Wait.]",
      "      Waited.",
      "  end",
      "  After.",
      "end",
      "",
    ];
    const { route } = preview(lines, 8, [pin(5)]);
    const [choice] = route.decisions;
    expect([choice!.kind, choice!.text, choice!.notFollowed]).toEqual([
      "auto",
      "Wait.",
      true,
    ]);
    expect(choice!.options!.map((o) => o.text)).toEqual(["Wait."]);
    expect(choice!.unofferedPins).toEqual([pin(5)]);
  }, 120_000);

  test("a choice entry names its stop's pin on an option the menu did not offer when a thread adds the option the menu lists first", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  <- side",
      "  choose",
      "    * if key [Show the key.]",
      "      Shown.",
      "    * [Wait.]",
      "      Waited.",
      "  end",
      "  After.",
      "end",
      "scene side",
      "  choose",
      "    + [Thread option.]",
      "      Threaded.",
      "  end",
      "  done",
      "end",
      "",
    ];
    const { route } = preview(lines, 9, [pin(6)]);
    const [choice] = route.decisions;
    expect(choice!.options!.map((o) => o.text)).toEqual([
      "Thread option.",
      "Wait.",
    ]);
    expect([choice!.text, choice!.notFollowed]).toEqual(["Wait.", true]);
    expect(choice!.unofferedPins).toEqual([pin(6)]);
  }, 120_000);

  test("a line inside a thread's scene starts its route there, so a pin on the menu the thread joins is not at its stop", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  <- side",
      "  choose",
      "    * if key [Show the key.]",
      "      Shown.",
      "    * if key [Wait.]",
      "      Waited.",
      "  end",
      "  After.",
      "end",
      "scene side",
      "  choose",
      "    + [Thread option.]",
      "      Threaded.",
      "  end",
      "  done",
      "end",
      "",
    ];
    const { route } = preview(lines, 16, [pin(6)]);
    expect(route.start.scene).toBe("side");
    expect(
      route.decisions.map((d) => [d.kind, d.text, d.notFollowed, d.unofferedPins]),
    ).toEqual([["auto", "Thread option.", undefined, undefined]]);
  }, 120_000);

  test("a menu that presents nothing gives none of its pins to the next menu", () => {
    const lines = [
      "store key = false",
      "scene start",
      "  choose",
      "    * if key [Hidden.]",
      "      -> gone",
      "  end",
      "  choose",
      "    + [Continue.]",
      "      Continued.",
      "  end",
      "  Target.",
      "end",
      "scene gone",
      "  Gone.",
      "end",
      "",
    ];
    const { route } = preview(lines, 11, [pin(4)]);
    expect(route.start.scene).toBe("start");
    expect(
      route.decisions.map((d) => [d.kind, d.text, d.notFollowed, d.unofferedPins]),
    ).toEqual([["auto", "Continue.", undefined, undefined]]);
  }, 120_000);

  test("a once-only option already taken leaves the pin on its later offer", () => {
    const lines = [
      "store asked = 0",
      "",
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

  test("a pin the target cannot be reached through leaves the route the search takes without it, never a forced dodge of its menu", () => {
    const lines = [
      "store asked = 0",
      "",
      "scene start",
      "  while asked < 2 do",
      "    <- side",
      "    choose",
      "      + [Leave.]",
      "        & asked = 5",
      "    end",
      "  end",
      "  Done.",
      "end",
      "scene side",
      "  choose",
      "    * [Ask about the key.]",
      "      & asked += 1",
      "  end",
      "  done",
      "end",
      "",
    ];
    const { route } = preview(lines, 11, [pin(15, 1), pin(15, 2)]);
    expect(
      route.decisions.map((d) => [d.kind, d.text, Boolean(d.notFollowed)]),
    ).toEqual([["auto", "Leave.", true]]);
  }, 120_000);

  test("a route through the pin is taken at any forced cost, even where a forced dodge of its menu costs less", () => {
    const lines = [
      "store trust = 0",
      "store go = true",
      "",
      "scene start",
      "  if go then",
      "    choose",
      "      * [Tell the truth.]",
      "        trust += 2",
      "      * [Lie.]",
      "        trust -= 1",
      "    end",
      "  end",
      "  if trust < 1 then",
      "    if trust < 2 then",
      "      Reached.",
      "    end",
      "  end",
      "end",
      "",
    ];
    const { route, count } = preview(lines, 15, [pin(7)], "trust");
    expect(kindsAndLines(route)).toEqual([
      ["pinned", 7],
      ["forced", 13],
      ["forced", 14],
    ]);
    expect(count).toBe(2);
  }, 120_000);

  test("a hub is pinned meeting by meeting", () => {
    const lines = [
      "store stage = 0",
      "",
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

  test("two pins on one stop: the gate of the pin that loses is not forced", () => {
    const lines = [
      "store key = false",
      "",
      "scene start",
      "  choose",
      "    * [First.]",
      "      Took first.",
      "    * if key [Second.]",
      "      Took second.",
      "  end",
      "  After.",
      "end",
      "",
    ];
    const { route } = preview(lines, 10, [pin(5), pin(7)]);
    expect(
      route.decisions.map((d) => [d.kind, d.text, Boolean(d.notFollowed)]),
    ).toEqual([["pinned", "First.", true]]);
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
