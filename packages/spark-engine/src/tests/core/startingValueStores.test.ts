import { describe, expect, test } from "vitest";
import {
  checkStartingValue,
  paramKey,
  storeKey,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import {
  URI,
  compileSrc,
  example,
  newGame,
  recompile,
  routeTo,
  shown,
} from "../harness/startingValuesGame";
import { requireChunks } from "../harness/compileProgram";

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

  test("makes an edit that carries the declarations over run them no more often than with no value set", () => {
    const lines = [
      "store bag = { hp = 10 }",
      "scene s",
      "  Before {bag.hp}.",
      "end",
    ];
    const afterEdit = (values: StartingValues) => {
      const { game, compiler } = routeTo(lines, 3, values);
      const story = Object.getPrototypeOf(game.story);
      const run = story.runDeclarations;
      let runs = 0;
      story.runDeclarations = function (this: unknown, ...args: unknown[]) {
        runs += 1;
        return run.apply(this, args);
      };
      try {
        recompile(compiler, game, lines.join("\n").replace("Before", "Edited"));
        game.setStartFrom({ file: URI, line: 2 });
        game.simulate();
        return { runs, text: shown(game) };
      } finally {
        story.runDeclarations = run;
      }
    };
    const unset = afterEdit({});
    const set = afterEdit({ s: { [storeKey("bag.hp")]: "3" } });
    expect(unset.text).toContain("Edited 10.");
    expect(set.text).toContain("Edited 3.");
    expect(set.runs).toBe(unset.runs);
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

