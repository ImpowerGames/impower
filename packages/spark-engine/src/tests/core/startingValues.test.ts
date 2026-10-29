// #1666 — the Game Preview's route starts at the top of its scene with the
// values the author set for that scene's start: its parameters as the
// arguments the start is entered with, stores and a define's `store` fields
// by path, visit counts by count id, and the seed. A route's search and its
// replay start alike, and an unset seed is 0, so a line shows the same random
// results every time.
//
// What must hold:
//   - #1665's example at line 11 with `hour = "nine"` starts at the top of
//     `interrogation` and shows "Where were you at nine?"; with nothing set,
//     the story-start route for a scene with parameters (#1608) stands;
//   - at line 20 with `trust = 2` set, the route takes "Tell the truth."
//     with nothing forced;
//   - with the visits of `interrogation` set to 1, line 8 is reached with
//     nothing forced; with "Tell the truth." taken once, the menu offers
//     only "Lie.";
//   - an unset seed is 0, the same on every search, and a set seed draws
//     what that seed draws; a table store's field applies over its first
//     value, and a define's `store` field by its dotted name;
//   - a value whose name no longer resolves is ignored, and one that does
//     not parse is not applied;
//   - a change of starting values is a change before the route's first
//     step: the planned route no longer resumes;
//   - the listing names the start's parameters, the stores, the counted
//     places and the seed, each with its first value.

import { describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  checkStartingValue,
  formatLiteral,
  movePlaceKey,
  paramKey,
  parseLiteral,
  readPlaceKey,
  placeKey,
  storeKey,
  visitsKey,
  SEED_KEY,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import {
  startPlanKey,
  valueOfLiteral,
} from "@impower/sparkdown/src/program/startingValues";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
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

/** A game of `lines` with the starting values `values`, its route planned
 *  to the 1-based `line` and replayed there. */
function routeTo(lines: string[], line: number, values: StartingValues = {}) {
  const { compiler, program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.scriptLineText = (uri: string, at: number) =>
    compiler.documents.get(uri)?.getLineText(at);
  game.setStartingValues(values);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  return { game, compiler };
}

/** The text of the beat the replay stopped on, the target line's. */
const shown = (game: any): string => game.story.currentText ?? "";

/** The kinds of the decisions the route's report lists. */
const decisionsOf = (game: any, compiler: SparkdownCompiler) =>
  game
    .previewRouteOf(game.plannedRoute, {
      lineText: (uri: string, at: number) =>
        compiler.documents.get(uri)?.getLineText(at),
      structure: (uri: string) => compiler.structureOf(uri),
    })
    .decisions.map((d: any) => d.kind);

const example = [
  "store trust = 0",
  'store suspect = "Ana"',
  '-> interrogation("nine")',
  "",
  "scene interrogation(hour)",
  "  if count.visits(-> interrogation) > 1 then",
  "    INSPECTOR:",
  "      Back again, {suspect}?",
  "  end",
  "  INSPECTOR:",
  "    Where were you at {hour}?",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    INSPECTOR:",
  "      I believe you.",
  "  end",
  "end",
];

describe("a route starts with the scene's starting values", () => {
  test("a parameter's value is the argument the scene is entered with", () => {
    const { game } = routeTo(example, 11, {
      interrogation: { [paramKey("hour")]: '"later"' },
    });
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("interrogation");
    expect(shown(game)).toContain("Where were you at later?");
  });

  test("with no parameter set, the story-start route for a scene with parameters stands", () => {
    const { game } = routeTo(example, 11);
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("0");
    expect(shown(game)).toContain("Where were you at nine?");
  });

  test("a store's value makes the route take the option with nothing forced", () => {
    const unset = routeTo(example, 20, {
      interrogation: { [paramKey("hour")]: '"nine"' },
    });
    expect(decisionsOf(unset.game, unset.compiler)).toContain("forced");
    const { game, compiler } = routeTo(example, 20, {
      interrogation: {
        [paramKey("hour")]: '"nine"',
        [storeKey("trust")]: "2",
      },
    });
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute.from).toBe("interrogation");
    expect(decisionsOf(game, compiler)).toEqual(["auto"]);
    expect(shown(game)).toContain("I believe you.");
  });

  test("a scene's visits set before its start count with its entry", () => {
    const { game, compiler } = routeTo(example, 8, {
      interrogation: {
        [paramKey("hour")]: '"nine"',
        [visitsKey("interrogation")]: "1",
      },
    });
    expect(game.simulation).toBe("success");
    expect(decisionsOf(game, compiler)).not.toContain("forced");
    expect(shown(game)).toContain("Back again, Ana?");
  });

  test("a once-only option taken before the start is not offered", () => {
    const { game } = routeTo(example, 12, {
      interrogation: {
        [paramKey("hour")]: '"nine"',
        [placeKey(URI, 12)]: "1",
      },
    });
    expect(game.simulation).toBe("success");
    while (game.story.canContinue) {
      game.story.Continue();
    }
    expect(game.story.currentChoices.map((c: any) => c.text)).toEqual(["Lie."]);
  });

  test("a value whose name left the script, or that does not parse, is not applied", () => {
    const { game } = routeTo(example, 11, {
      interrogation: {
        [paramKey("hour")]: '"nine"',
        [storeKey("gone")]: "1",
        [storeKey("suspect")]: "{ unclosed",
      },
    });
    expect(game.simulation).toBe("success");
    expect(game.story.variablesState["suspect"]).toBe("Ana");
  });
});

describe("the seed", () => {
  const shuffle = [
    "scene s",
    "  Before.",
    "  Drew .. shuffle cycle|A|B|C|D|E|F|G|H ..",
    "  Done.",
    "end",
  ];

  /** The alternative the shuffle shows on each of `times` searches of one
   *  game, and the seed each ran with. */
  const game: any = routeTo(shuffle, 3).game;
  const searches = (times: number, values: StartingValues = {}) => {
    game.setStartingValues(values);
    const out: [string, number][] = [];
    for (let i = 0; i < times; i++) {
      game.simulate();
      expect(game.simulation).toBe("success");
      expect(shown(game)).toMatch(/Drew [A-H]/);
      out.push([shown(game).trim(), game.story.state.storySeed]);
    }
    return out;
  };

  test("an unset seed is 0, so the shuffle shows the same alternative on every search", () => {
    const shows = searches(10);
    expect(new Set(shows.map(([text]) => text)).size).toBe(1);
    expect(shows.every(([, seed]) => seed === 0)).toBe(true);
  });

  test("a seed set is the seed the start draws from, the same on every search", () => {
    const shows = searches(3, { s: { [SEED_KEY]: "7" } });
    expect(shows.every(([, seed]) => seed === 7)).toBe(true);
    expect(new Set(shows.map(([text]) => text)).size).toBe(1);
    // The seed decides the alternative: across seeds the shuffle shows more
    // than one.
    const drawn = new Set<string>();
    for (let seed = 0; seed < 8; seed++) {
      drawn.add(searches(1, { s: { [SEED_KEY]: String(seed) } })[0]![0]);
    }
    expect(drawn.size).toBeGreaterThan(1);
  });
});

describe("stores by path", () => {
  const tables = [
    'store player = { name = "Ana", hp = 10 }',
    "define guide with",
    "  store mood = 1",
    "end",
    "scene s",
    "  {player.name} {player.hp} {guide.mood}",
    "end",
  ];

  test("a table store's field applies over its first value, and a define's store field by its dotted name", () => {
    const { game } = routeTo(tables, 6, {
      s: { [storeKey("player.hp")]: "3", [storeKey("guide.mood")]: "5" },
    });
    expect(game.simulation).toBe("success");
    expect(shown(game)).toContain("Ana 3 5");
  });

  test("the listing names each store with its first value, a table's fields and a define's store fields", () => {
    const { game } = routeTo(tables, 6);
    const listing = game.startingValueListing("s");
    const stores = listing.items
      .filter((i: any) => i.group === "stores")
      .map((i: any) => [i.name, i.first, (i.fields ?? []).map((f: any) => [f.name, f.first])]);
    expect(stores).toEqual([
      ["player", '{ name = "Ana", hp = 10 }', [[".name", '"Ana"'], [".hp", "10"]]],
      ["guide.mood", "1", []],
    ]);
  });
});

describe("the listing of the example's scene", () => {
  test("names its parameter, stores, places and seed, in script order", () => {
    const { game } = routeTo(example, 11);
    const listing = game.startingValueListing("interrogation");
    expect(
      listing.items.map((i: any) => [i.group, i.name, i.first]),
    ).toEqual([
      ["parameters", "hour", "nil"],
      ["stores", "trust", "0"],
      ["stores", "suspect", '"Ana"'],
      ["visits", "interrogation", "0"],
      ["visits", "Tell the truth.", "0"],
      ["visits", "Lie.", "0"],
      ["randomization", "seed", "0"],
    ]);
    const trust = listing.items.find((i: any) => i.name === "trust");
    expect(checkStartingValue(trust, '"high"')).toEqual({
      status: "warning",
      message: "trust starts as a number. This still applies.",
    });
    expect(checkStartingValue(trust, "{ found =")).toMatchObject({
      status: "error",
    });
  });
});

describe("first values", () => {
  test("are what the declarations give, not what a run left, after a route and after a recompile", () => {
    const { game, compiler } = routeTo(example, 20, {
      interrogation: { [paramKey("hour")]: '"nine"' },
    });
    // The route took an option, which changed trust from its first value.
    expect(game.story.variablesState["trust"]).not.toBe(0);
    const firstOf = (name: string) =>
      game
        .startingValueListing("interrogation")
        .items.find((i: any) => i.name === name)?.first;
    expect(firstOf("trust")).toBe("0");
    // A compile gives the game a new program, whose engine can take over
    // the globals the last one held.
    const doc = compiler.documents.get(URI)!;
    const edited = example.join("\n").replace('"Ana"', '"Bo"');
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: edited,
          version: (doc as any).version + 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    const result = compiler.compile({ textDocument: { uri: URI } });
    game.updateProgram(requireChunks(result.program));
    expect(firstOf("trust")).toBe("0");
    expect(firstOf("suspect")).toBe('"Bo"');
  });
});

describe("a change of starting values", () => {
  test.each([
    ["2", "3"],
    ["math.huge", "nil"],
    ["math.huge", "-math.huge"],
    ["0", "-0"],
  ])("from %s to %s is a change before the route's first step", (from, to) => {
    const values = (trust: string): StartingValues => ({
      interrogation: {
        [paramKey("hour")]: '"nine"',
        [storeKey("trust")]: trust,
      },
    });
    const { game, compiler } = routeTo(example, 20, values(from));
    expect(game.simulation).toBe("success");
    // A compile that changes nothing leaves a route that resumes, so the
    // change of values below is what stops it.
    const doc = compiler.documents.get(URI)!;
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: example.join("\n"),
          version: (doc as any).version + 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    game.updateProgram(
      requireChunks(compiler.compile({ textDocument: { uri: URI } }).program),
    );
    const address = game.startAddress;
    expect(game.routeResumption("interrogation", address)).toMatchObject({
      replayOnly: true,
    });
    game.setStartingValues(values(to));
    expect(game.routeResumption("interrogation", address)).toMatchObject({
      replayOnly: false,
    });
    expect(
      game.routeResumption("interrogation", address).resumeFrom,
    ).toBeUndefined();
  });
});

describe("a value is a literal", () => {
  test.each([
    ["2", 2],
    ["-1.5", -1.5],
    ["0x10", 16],
    ["1_000", 1000],
    ['"nine"', "nine"],
    ["'it\\'s'", "it's"],
    ['"a\\nb"', "a\nb"],
    ["[[long]]", "long"],
    ["true", true],
    ["false", false],
    ["nil", null],
  ])("%s reads as its value", (text, value) => {
    expect(parseLiteral(text)).toEqual({ ok: true, value });
  });

  test("a table reads its entries in the order they are written, and writes them back", () => {
    const parsed = parseLiteral('{ "a", name = "Ana", 2, [3] = true, }');
    expect(parsed).toEqual({
      ok: true,
      value: {
        entries: [
          { value: "a" },
          { key: "name", value: "Ana" },
          { value: 2 },
          { key: 3, value: true },
        ],
      },
    });
    expect(formatLiteral((parsed as any).value)).toBe(
      '{ "a", name = "Ana", 2, [3] = true }',
    );
    expect(formatLiteral({ entries: [] })).toBe("{ }");
  });

  test.each([
    ["-0x10", -16],
    ["-0b101", -5],
    ['"a\\z  \n  b"', "ab"],
    ['"\\u{110000}"', "�"],
    ["{ [[hello]] }", { entries: [{ value: "hello" }] }],
    ["[==[a]]b]==]", "a]]b"],
  ])("%j reads as the language reads it", (text, value) => {
    expect(parseLiteral(text)).toEqual({ ok: true, value });
  });

  test.each([
    ["math.huge", Infinity],
    ["-math.huge", -Infinity],
    ["0/0", NaN],
  ])("%s, as a first value is written, reads as its value", (text, value) => {
    expect(formatLiteral(value as any)).toBe(text);
    expect(parseLiteral(text)).toEqual({ ok: true, value });
  });

  test.each([["\u000123"], ["\u000723"], [{ entries: [{ key: "s", value: "\u001f9" }] }]])(
    "%j is written as a literal that reads back as it",
    (value) => {
      expect(parseLiteral(formatLiteral(value as any))).toEqual({ ok: true, value });
    },
  );

  test("-0 is written with its sign and reads back as -0", () => {
    expect(formatLiteral(-0)).toBe("-0");
    const parsed = parseLiteral("-0") as any;
    expect(Object.is(parsed.value, -0)).toBe(true);
  });

  test("a reserved word is a table's key only in brackets, and is written so", () => {
    expect(parseLiteral("{ end = 3 }")).toEqual({
      ok: false,
      error: 'end is a reserved word, so a key named it is written ["end"]',
    });
    const parsed = parseLiteral('{ ["end"] = 3 }') as any;
    expect(parsed.value).toEqual({ entries: [{ key: "end", value: 3 }] });
    expect(formatLiteral(parsed.value)).toBe('{ ["end"] = 3 }');
  });

  test("plans that start a story differently have different keys", () => {
    const plan = (value: unknown) =>
      startPlanKey({
        from: "s",
        seed: 0,
        stores: [[["x"], value as any]],
        counts: [],
      });
    const keys = [Infinity, -Infinity, NaN, null, 0, -0].map(plan);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("a table key is a table of its own, equal to no other key", () => {
    const parsed = parseLiteral("{ [{ a = 1 }] = 5, [{ b = 2 }] = 9 }");
    const table = valueOfLiteral((parsed as any).value) as any;
    expect([...table.value.values()].map((v: any) => v.value).sort()).toEqual([5, 9]);
  });

  test.each([
    ["", "expected a value"],
    ["{ found =", "expected } to close the table"],
    ["{ 1 2 }", "expected , or } after a table's entry"],
    ['"open', 'expected " to close the string'],
    ["2 + 1", "expected the value to end before + 1"],
    ["x", "expected a value, not the name x"],
    ["`hi`", "expected a string in quotes; a backtick string is an expression"],
    ['"\\u{80000000}"', "\\u{80000000} is past the last code point"],
    ['"\\q"', "\\q is not an escape"],
    ['"\\256"', "\\256 is past the last byte, 255"],
    ["{".repeat(65) + "}".repeat(65), "expected no more than 64 tables inside each other"],
  ])("%j is not a value: %s", (text, error) => {
    expect(parseLiteral(text)).toEqual({ ok: false, error });
  });
});

describe("a place's key", () => {
  test("names its script, its line and its index on the line, and follows a move or is detached", () => {
    const key = placeKey("file:///a.sd", 12, 1);
    expect(readPlaceKey(key)).toEqual({
      uri: "file:///a.sd",
      line: 12,
      index: 1,
      detached: false,
    });
    expect(readPlaceKey(movePlaceKey(key, 14))).toMatchObject({ line: 14 });
    expect(readPlaceKey(movePlaceKey(key, null))).toMatchObject({
      line: 12,
      detached: true,
    });
  });
});

describe("first values of tables", () => {
  test("are the declarations', after a run wrote into a table store and a define's store field", () => {
    const { game } = routeTo(
      [
        "store player = { hp = 10 }",
        "define guide with",
        "  store mood = 1",
        "end",
        "scene s",
        "  & player.hp = 3",
        "  & guide.mood = 5",
        "  Now {player.hp} {guide.mood}.",
        "end",
      ],
      8,
    );
    expect(game.simulation).toBe("success");
    expect(shown(game)).toContain("Now 3 5.");
    const items = game.startingValueListing("s").items;
    const player = items.find((i: any) => i.name === "player");
    expect(player.first).toBe("{ hp = 10 }");
    expect(player.fields.map((f: any) => [f.name, f.first])).toEqual([
      [".hp", "10"],
    ]);
    expect(items.find((i: any) => i.name === "guide.mood").first).toBe("1");
  });
});

describe("PLAY from the top-level content", () => {
  const drawing = ["store draw = math.random(1, 100000)", "Drew {draw}."];

  test("draws its seed from the clock before the declarations run, as an ordinary game does", () => {
    // The clock held still, at a time whose seed is not the preview's 0.
    const clock = vi.spyOn(Date.prototype, "getTime").mockReturnValue(1234567);
    try {
      const { program } = compileSrc(drawing.join("\n"));
      const ordinary: any = newGame(program);
      const expected = ordinary.story.variablesState["draw"];
      expect(ordinary.story.state.storySeed).not.toBe(0);

      const play: any = new Game({
        program: program as any,
        play: true,
        startFrom: { file: URI, line: 1 },
        now: () => 0,
        setTimeout: ((fn: Function) => {
          fn();
          return 0;
        }) as any,
      } as any);
      expect(play.drawsOwnSeed).toBe(true);
      play.simulate();
      expect(play.simulation).toBe("success");
      expect(play.story.variablesState["draw"]).toBe(expected);

      // The preview of the same line draws with seed 0.
      const preview: any = newGame(program);
      preview.setStartFrom({ file: URI, line: 1 });
      preview.simulate();
      expect(preview.story.state.storySeed).toBe(0);
      expect(preview.drawsOwnSeed).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  test("with the top-level content's seed set, draws from that seed", () => {
    const { program } = compileSrc(drawing.join("\n"));
    const play: any = new Game({
      program: program as any,
      play: true,
      startFrom: { file: URI, line: 1 },
      startingValues: { "0": { [SEED_KEY]: "9" } },
      now: () => 0,
      setTimeout: ((fn: Function) => {
        fn();
        return 0;
      }) as any,
    } as any);
    expect(play.drawsOwnSeed).toBe(false);
    play.simulate();
    expect(play.simulation).toBe("success");
    expect(play.story.state.storySeed).toBe(9);
  });
});

describe("a table's starting value", () => {
  test("assigns its entries in the order they are written, as the script's own table does", () => {
    const script = [
      "store bag = { [1] = 5, 9 }",
      "scene s",
      "  Value {bag[1]}.",
      "end",
    ];
    expect(shown(routeTo(script, 3).game)).toContain("Value 9.");
    const { game } = routeTo(script, 3, {
      s: { [storeKey("bag")]: "{ [1] = 5, 9 }" },
    });
    expect(game.simulation).toBe("success");
    expect(shown(game)).toContain("Value 9.");
  });

  test("of a store with an entry no literal writes still lists the store and its fields, and applies a field", () => {
    const script = [
      "store bag = { hp = 10, method = math.abs }",
      "scene s",
      "  Value {bag.hp}.",
      "end",
    ];
    const listed = routeTo(script, 3).game.startingValueListing("s");
    const bag = listed.items.find((i: any) => i.name === "bag");
    expect(bag.first).toBe("{ hp = 10, … }");
    expect(bag.fields.map((f: any) => [f.key, f.first])).toEqual([
      [storeKey("bag.hp"), "10"],
    ]);
    const { game } = routeTo(script, 3, {
      s: { [storeKey("bag.hp")]: "3" },
    });
    expect(shown(game)).toContain("Value 3.");
  });

  test("of a table inside a store's table with an entry no literal writes ends with … in its field too", () => {
    const listed = routeTo(
      [
        "store bag = { inner = { hp = 10, method = math.abs } }",
        "scene s",
        "  Hello.",
        "end",
      ],
      3,
    ).game.startingValueListing("s");
    const bag = listed.items.find((i: any) => i.name === "bag");
    expect(bag.first).toBe("{ inner = { hp = 10, … } }");
    expect(bag.fields.map((f: any) => f.first)).toEqual(["{ hp = 10, … }"]);
  });
});

/** Gives `game` the program `compiler` makes of `text`, as an edit does. */
const recompile = (compiler: SparkdownCompiler, game: any, text: string) => {
  const doc = compiler.documents.get(URI)!;
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: (doc as any).version + 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  game.updateProgram(
    requireChunks(compiler.compile({ textDocument: { uri: URI } }).program),
  );
};

describe("a store's value set by its path", () => {
  test("applies to a table's field a run deleted, after an edit that carries the declarations over", () => {
    const lines = [
      "store bag = { hp = 10 }",
      "scene s",
      "  Before {bag.hp}.",
      "  bag.hp = nil",
      "  After {bag.hp}.",
      "end",
    ];
    const { game, compiler } = routeTo(lines, 5, {
      s: { [storeKey("bag.hp")]: "3" },
    });
    expect(shown(game)).toContain("After nil.");
    recompile(compiler, game, lines.join("\n").replace("Before", "Edited"));
    game.setStartFrom({ file: URI, line: 2 });
    game.simulate();
    expect(shown(game)).toContain("Edited 3.");
  });

  test("runs the declarations no more after an edit that carries them over", () => {
    const lines = [
      "store bag = { hp = 10 }",
      "scene s",
      "  Before {bag.hp}.",
      "end",
    ];
    const { game, compiler } = routeTo(lines, 3, {
      s: { [storeKey("bag.hp")]: "3" },
    });
    expect(shown(game)).toContain("Before 3.");
    const runs = vi.spyOn(ProgramStory.prototype as any, "runDeclarations");
    try {
      recompile(compiler, game, lines.join("\n").replace("Before", "Edited"));
      game.setStartFrom({ file: URI, line: 2 });
      game.simulate();
      expect(shown(game)).toContain("Edited 3.");
      expect(runs).not.toHaveBeenCalled();
    } finally {
      runs.mockRestore();
    }
  });

  test("lists and applies a typed define's store field by the name the script reads it by", () => {
    const lines = [
      "define hero as character with",
      "  store mood = 1",
      "end",
      "scene s",
      "  Mood {character.hero.mood}.",
      "end",
    ];
    const listed = routeTo(lines, 5).game.startingValueListing("s");
    expect(
      listed.items
        .filter((i: any) => i.group === "stores")
        .map((i: any) => [i.key, i.first]),
    ).toEqual([[storeKey("character.hero.mood"), "1"]]);
    const { game } = routeTo(lines, 5, {
      s: { [storeKey("character.hero.mood")]: "5" },
    });
    expect(shown(game)).toContain("Mood 5.");
  });
});

describe("a define's store fields", () => {
  test("are listed and applied for a type, a leaf two levels down and an instance made with new", () => {
    const lines = [
      "define companion as character with",
      "  store trust = 5",
      "end",
      "define O as companion with",
      '  name = "Orion"',
      "end",
      "store pal = new companion()",
      "scene s",
      "  Trust {companion.O.trust} {pal.trust}.",
      "end",
    ];
    const listed = routeTo(lines, 9).game.startingValueListing("s");
    expect(
      listed.items
        .filter((i: any) => i.group === "stores")
        .map((i: any) => [i.key, i.first]),
    ).toEqual([
      [storeKey("companion.trust"), "5"],
      [storeKey("companion.O.trust"), "5"],
      [storeKey("pal.trust"), "5"],
    ]);
    const { game } = routeTo(lines, 9, {
      s: {
        [storeKey("companion.O.trust")]: "7",
        [storeKey("pal.trust")]: "8",
      },
    });
    expect(shown(game)).toContain("Trust 7 8.");
  });
});

describe("a first value", () => {
  test("is a literal of the value: -0 keeps its sign, and a reserved key stays in brackets", () => {
    const listed = routeTo(
      [
        "store value = -0",
        'store bag = { ["end"] = 3 }',
        "scene s",
        "  Value {1 / value}.",
        "end",
      ],
      4,
    ).game.startingValueListing("s");
    const firstOf = (name: string) =>
      listed.items.find((i: any) => i.name === name)?.first;
    expect(firstOf("value")).toBe("-0");
    expect(firstOf("bag")).toBe('{ ["end"] = 3 }');
  });
});

describe("a line no route reaches, jumped to with the start's values", () => {
  /** What the story writes from the 1-based `line` of `lines` on, jumped
   *  to with `values`. */
  const runFrom = (lines: string[], line: number, values: StartingValues) => {
    const { program } = compileSrc(lines.join("\n"));
    const game: any = newGame(program);
    game.setStartingValues(values);
    game.jumpTo(program.chunks!.addressAt(URI, line - 1), true);
    return game.story.ContinueMaximally() as string;
  };

  test("keeps the scene's parameters past the end of the block the line is in", () => {
    const text = runFrom(
      [
        "scene s(hour)",
        "  done",
        "  if true then",
        "    Inside {hour}.",
        "  end",
        "  Outside {hour}.",
        "end",
      ],
      4,
      { s: { [paramKey("hour")]: '"late"' } },
    );
    expect(text).toContain("Inside late.");
    expect(text).toContain("Outside late.");
  });

  test("binds a parameter set to nil, or not set, as nil, hiding a global of its name", () => {
    const lines = [
      'store hour = "global"',
      "scene s(hour)",
      "  done",
      "  After {hour}.",
      "end",
    ];
    expect(runFrom(lines, 4, { s: { [paramKey("hour")]: "nil" } })).not.toContain(
      "global",
    );
    expect(runFrom(lines, 4, {})).not.toContain("global");
  });
});

describe("a store's type annotation", () => {
  test("that spans lines, or is nil, is the type a value is checked against", () => {
    const { game } = routeTo(
      [
        "store bag: {",
        "  hp: number -- a comment { with a brace",
        "} = { hp = 1 }",
        "store nothing: nil = nil",
        "store toString = 1",
        "scene s",
        "  Hello.",
        "end",
      ],
      7,
    );
    const items = game.startingValueListing("s").items;
    const check = (name: string, text: string) =>
      checkStartingValue(
        items.find((i: any) => i.name === name),
        text,
      );
    expect(check("bag", '"wrong"')).toEqual({
      status: "warning",
      message: "bag is declared as a table. This still applies.",
    });
    expect(check("bag", "{ hp = 2 }").status).toBe("ok");
    expect(check("nothing", "3")).toEqual({
      status: "warning",
      message: "nothing is declared as nil. This still applies.",
    });
    expect(check("toString", '"a"').status).toBe("warning");
  });

  test("is the type a value is checked against, an optional one taking nil", () => {
    const { game } = routeTo(
      [
        "store hp: number",
        "store mood: string? = nil",
        "scene s",
        "  Hello.",
        "end",
      ],
      4,
    );
    const items = game.startingValueListing("s").items;
    const hp = items.find((i: any) => i.name === "hp");
    const mood = items.find((i: any) => i.name === "mood");
    expect([hp.type, hp.declared]).toEqual(["number", true]);
    expect(checkStartingValue(hp, '"high"')).toEqual({
      status: "warning",
      message: "hp is declared as a number. This still applies.",
    });
    expect(checkStartingValue(hp, "3")).toEqual({ status: "ok" });
    expect(checkStartingValue(mood, "nil")).toEqual({ status: "ok" });
    expect(checkStartingValue(mood, "1")).toMatchObject({ status: "warning" });
  });

  test("that is not one literal type, a union or a named type, takes any value", () => {
    const { game } = routeTo(
      [
        "store either: number | string = 1",
        'store pick: "p" | "q", count: number = "p", 5',
        "store box: { x: number }? = nil",
        "store pair: { x: number } | { y: number } = { x = 1 }",
        "store list: Array<number>, label: string = {}, \"a\"",
        "scene s",
        "  Hello.",
        "end",
      ],
      7,
    );
    const items = game.startingValueListing("s").items;
    const check = (name: string, text: string) =>
      checkStartingValue(
        items.find((i: any) => i.name === name),
        text,
      ).status;
    expect(check("either", '"a"')).toBe("ok");
    expect(check("pick", "3")).toBe("ok");
    expect(check("count", '"five"')).toBe("warning");
    expect(check("box", "nil")).toBe("ok");
    expect(check("box", "{ x = 2 }")).toBe("ok");
    expect(check("box", "2")).toBe("warning");
    expect(check("pair", "2")).toBe("ok");
    expect(check("list", '"a"')).toBe("ok");
    expect(check("label", "1")).toBe("warning");
  });

  test("is the one the last compile read, after an edit that changes only the annotation", () => {
    const lines = ["store hp: number = 0", "scene s", "  Hello.", "end"];
    const { game, compiler } = routeTo(lines, 3);
    const typeOf = () =>
      game.startingValueListing("s").items.find((i: any) => i.name === "hp")
        ?.type;
    expect(typeOf()).toBe("number");
    const doc = compiler.documents.get(URI)!;
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: lines.join("\n").replace("number", "string"),
          version: (doc as any).version + 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    const result = compiler.compile({ textDocument: { uri: URI } });
    game.updateProgram(requireChunks(result.program));
    expect(typeOf()).toBe("string");
  });
});
