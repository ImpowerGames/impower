import { describe, expect, test, vi } from "vitest";
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
import {
  URI,
  compileSrc,
  decisionsOf,
  example,
  newGame,
  routeTo,
  shown,
} from "../harness/startingValuesGame";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";

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
    expect(game.plannedRoute.from).toBe(START_FLOW_NAME);
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
      ["visits", "start", "0"],
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
    expect(game.story.variablesState["trust"]).not.toBe(0);
    const firstOf = (name: string) =>
      game
        .startingValueListing("interrogation")
        .items.find((i: any) => i.name === name)?.first;
    expect(firstOf("trust")).toBe("0");
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

describe("PLAY from the start scene", () => {
  const drawing = [
    "store draw = math.random(1, 100000)",
    "scene start",
    "  Drew {draw}.",
    "end",
  ];

  test("with the start scene's seed unset, draws from the seed 0, as the preview does", () => {
    const clock = vi.spyOn(Date.prototype, "getTime").mockReturnValue(1234567);
    try {
      const { program } = compileSrc(drawing.join("\n"));
      const preview: any = newGame(program);
      preview.setStartFrom({ file: URI, line: 2 });
      preview.simulate();
      expect(preview.story.state.storySeed).toBe(0);

      const play: any = new Game({
        program: program as any,
        startFrom: { file: URI, line: 2 },
        now: () => 0,
        setTimeout: ((fn: Function) => {
          fn();
          return 0;
        }) as any,
      } as any);
      play.simulate();
      expect(play.simulation).toBe("success");
      expect(play.story.state.storySeed).toBe(0);
      expect(play.story.variablesState["draw"]).toBe(
        preview.story.variablesState["draw"],
      );
    } finally {
      clock.mockRestore();
    }
  });

  test("with the start scene's seed set, draws from that seed", () => {
    const { program } = compileSrc(drawing.join("\n"));
    const play: any = new Game({
      program: program as any,
      startFrom: { file: URI, line: 2 },
      startingValues: { [START_FLOW_NAME]: { [SEED_KEY]: "9" } },
      now: () => 0,
      setTimeout: ((fn: Function) => {
        fn();
        return 0;
      }) as any,
    } as any);
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

