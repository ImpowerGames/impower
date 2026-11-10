import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

function pausedGame(text: string, line: number) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: program as SparkProgram,
  } as never);
  const hits: unknown[] = [];
  game.connection.outgoing.addListener("game/hitBreakpoint", (m) => {
    hits.push(m);
  });
  game.setBreakpoints([{ file: MAIN, line }]);
  game.start();
  for (let i = 0; i < 12 && hits.length === 0; i += 1) {
    game.continue();
  }
  expect(hits.length).toBeGreaterThan(0);
  return game;
}

const SOURCE = [
  "store gold = 1",
  "store party = {\"Ada\", \"Lin\"}",
  "store gear = {sword = {damage = 3}}",
  "",
  "scene start",
  "  local bag = {\"rope\"}",
  "  You have {gold} gold.",
  "  done",
  "end",
  "",
].join("\n");

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("the evaluation context a watch reads", () => {
  it("gives the named story table as plain values, nested tables included, so a path into it resolves", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "party"))).toEqual({
      party: { "1": "Ada", "2": "Lin" },
    });
    expect(plain(game.getEvaluationContext(undefined, undefined, "gear"))).toEqual({
      gear: { sword: { damage: 3 } },
    });
  });

  it("gives a local table of the frame by name", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "bag"))).toEqual({
      bag: { "1": "rope" },
    });
  });

  it("gives a table that holds itself, without the cycle, so its other fields still resolve", () => {
    const game = pausedGame(
      [
        "store party = {name = \"Ada\"}",
        "",
        "scene start",
        "  party.self = party",
        "  Ready.",
        "  done",
        "end",
        "",
      ].join("\n"),
      4,
    );
    expect(plain(game.getEvaluationContext(undefined, undefined, "party"))).toEqual({
      party: { name: "Ada" },
    });
  });

  it("gives a story value named __proto__ as its own entry", () => {
    const game = pausedGame(
      ["store __proto__ = 7", "", "scene start", "  Ready.", "  done", "end", ""].join("\n"),
      3,
    );
    const named = game.getEvaluationContext(undefined, undefined, "__proto__");
    expect(Object.hasOwn(named, "__proto__")).toBe(true);
    expect(named["__proto__"]).toBe(7);
  });

  describe("treats names an object would inherit, and names holding a slash or a dot, as ordinary names", () => {
    const ODD = [
      "store constructor = 1",
      "store toString = 2",
      "store __proto__ = 3",
      "store odd = {[\"a/b\"] = 4, [\"a.b\"] = 5, [\"__proto__\"] = 6, constructor = 7, toString = 8}",
      "",
      "scene start",
      "  Ready.",
      "  done",
      "end",
      "",
    ].join("\n");

    it.each(["constructor", "toString", "__proto__"])("gives the story value named %s as its own entry", (name) => {
      const game = pausedGame(ODD, 7);
      const values = game.getEvaluationValues(undefined, undefined, name);
      expect([...values.keys()]).toEqual([name]);
      const record = game.getEvaluationContext(undefined, undefined, name);
      expect(Object.keys(record)).toEqual([name]);
      expect(Object.hasOwn(record, name)).toBe(true);
    });

    it("keys a named table's fields by their own names in the engine and on the wire", () => {
      const game = pausedGame(ODD, 7);
      const odd = game.getEvaluationValues(undefined, undefined, "odd").get("odd");
      expect(odd).toBeInstanceOf(Map);
      expect([...(odd as Map<string, unknown>)].sort()).toEqual([
        ["__proto__", 6],
        ["a.b", 5],
        ["a/b", 4],
        ["constructor", 7],
        ["toString", 8],
      ]);
      const wire = JSON.parse(JSON.stringify(game.getEvaluationContext(undefined, undefined, "odd")));
      expect(Object.keys(wire.odd).sort()).toEqual(["__proto__", "a.b", "a/b", "constructor", "toString"]);
      expect(Object.getOwnPropertyDescriptor(wire.odd, "__proto__")?.value).toBe(6);
    });

    it("leaves names an object would inherit out of the whole context unless the story holds them", () => {
      const game = pausedGame(SOURCE, 6);
      const whole = game.getEvaluationValues();
      for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
        expect(whole.has(name)).toBe(false);
        expect(Object.hasOwn(game.getEvaluationContext(), name)).toBe(false);
      }
    });
  });

  it("gives nothing for a name the frame does not hold, and keeps tables out of the whole context a hover reads", () => {
    const game = pausedGame(SOURCE, 6);
    expect(plain(game.getEvaluationContext(undefined, undefined, "silver"))).toEqual({});
    const whole = game.getEvaluationContext();
    expect(whole.gold).toBe(1);
    expect("party" in whole).toBe(false);
    expect("bag" in whole).toBe(false);
  });
});
