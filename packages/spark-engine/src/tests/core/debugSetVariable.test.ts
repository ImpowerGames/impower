import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

function debugGame(text: string) {
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
  const runTo = (line: number) => {
    game.setBreakpoints([{ file: MAIN, line }]);
    const before = hits.length;
    for (let i = 0; i < 12 && hits.length === before; i += 1) {
      game.continue();
    }
    expect(hits.length).toBeGreaterThan(before);
  };
  const shown = (variables: { name: string; value: string }[]) =>
    Object.fromEntries(variables.map((v) => [v.name, v.value]));
  const startAt = (line: number) => {
    game.setBreakpoints([{ file: MAIN, line }]);
    game.start();
    for (let i = 0; i < 12 && hits.length === 0; i += 1) {
      game.continue();
    }
    expect(hits.length).toBeGreaterThan(0);
  };
  return { game, hits, runTo, startAt, shown };
}

const SOURCE = [
  "store gold = 1",
  "store name = \"Ada\"",
  "",
  "scene start",
  "  local bag = 2",
  "  name = \"Lin\"",
  "  gold = gold + bag",
  "  done",
  "end",
  "",
].join("\n");

const TABLES = [
  "store party = {\"Ada\", \"Lin\"}",
  "store gear = {sword = {damage = 3}}",
  "",
  "scene start",
  "  local bag = {\"rope\"}",
  "  Ready.",
  "  done",
  "end",
  "",
].join("\n");

describe("changing a value from the Variables view", () => {
  it("writes a story value, and the run reads the new value from then on", () => {
    const { game, runTo, startAt, shown } = debugGame(SOURCE);
    startAt(5);
    const changed = game.setVariable("vars", "gold", "10");
    expect(changed).toMatchObject({ name: "gold", value: "10" });
    expect(shown(game.getVarVariables())["gold"]).toBe("10");
    runTo(7);
    expect(shown(game.getVarVariables())["gold"]).toBe("12");
  });

  it("writes a local value of the frame it is asked for", () => {
    const { game, runTo, startAt, shown } = debugGame(SOURCE);
    startAt(5);
    expect(shown(game.getTempVariables())["bag"]).toBe("2");
    game.setVariable("temps", "bag", "5");
    expect(shown(game.getTempVariables())["bag"]).toBe("5");
    runTo(7);
    expect(shown(game.getVarVariables())["gold"]).toBe("6");
  });

  it("reads quoted text, true and false as the values they spell", () => {
    const { game, startAt, shown } = debugGame(SOURCE);
    startAt(5);
    game.setVariable("vars", "name", "\"Grace\"");
    expect(shown(game.getVarVariables())["name"]).toBe("\"Grace\"");
    game.setVariable("vars", "name", "true");
    expect(shown(game.getVarVariables())["name"]).toBe("true");
  });

  it("refuses text that is not a value and keeps the old value", () => {
    const { game, startAt, shown } = debugGame(SOURCE);
    startAt(5);
    expect(() => game.setVariable("vars", "gold", "ten gold")).toThrow(
      /^Expected/,
    );
    expect(shown(game.getVarVariables())["gold"]).toBe("1");
  });

  it("refuses a name the scope does not hold", () => {
    const { game, startAt } = debugGame(SOURCE);
    startAt(5);
    expect(() => game.setVariable("vars", "silver", "1")).toThrow(
      "silver is not a story value.",
    );
    expect(() => game.setVariable("temps", "purse", "1")).toThrow(
      "purse is not a local value in this frame.",
    );
  });

  it("breaks when the run changes a value away from the one the author typed", () => {
    const { game, hits, startAt } = debugGame(SOURCE);
    startAt(5);
    game.setDataBreakpoints([{ dataId: "gold" }]);
    game.setBreakpoints([]);
    game.setVariable("vars", "gold", "-1");
    const before = hits.length;
    game.continue();
    expect(hits.length).toBe(before + 1);
  });

  it("writes a field of a story table, nested ones included, through the reference Variables gave the table", () => {
    const { game, startAt, shown } = debugGame(TABLES);
    startAt(5);
    const party = game.getVarVariables().find((v) => v.name === "party")!;
    game.setChildVariable(party.variablesReference, "1", "\"Grace\"");
    const again = game.getVarVariables().find((v) => v.name === "party")!;
    expect(shown(game.getChildVariables(again.variablesReference))["1"]).toBe("\"Grace\"");
    const gear = game.getVarVariables().find((v) => v.name === "gear")!;
    const sword = game.getChildVariables(gear.variablesReference).find((v) => v.name === "sword")!;
    game.setChildVariable(sword.variablesReference, "damage", "9");
    const gear2 = game.getVarVariables().find((v) => v.name === "gear")!;
    const sword2 = game.getChildVariables(gear2.variablesReference).find((v) => v.name === "sword")!;
    expect(shown(game.getChildVariables(sword2.variablesReference))["damage"]).toBe("9");
  });

  it("writes a field of a local table of the frame", () => {
    const { game, startAt, shown } = debugGame(TABLES);
    startAt(5);
    const bag = game.getTempVariables().find((v) => v.name === "bag")!;
    game.setChildVariable(bag.variablesReference, "1", "\"lamp\"");
    const again = game.getTempVariables().find((v) => v.name === "bag")!;
    expect(shown(game.getChildVariables(again.variablesReference))["1"]).toBe("\"lamp\"");
  });

  it("refuses a field of a table that is not the story's own or a local, and a key the table lacks", () => {
    const { game, startAt } = debugGame(TABLES);
    startAt(5);
    const builtin = game.getBuiltinVariables().find((v) => v.variablesReference > 0)!;
    expect(() => game.setChildVariable(builtin.variablesReference, "x", "1")).toThrow(
      "Only story and local values can be changed.",
    );
    const party = game.getVarVariables().find((v) => v.name === "party")!;
    expect(() => game.setChildVariable(party.variablesReference, "9", "1")).toThrow(
      "9 is not in party.",
    );
  });

  it("refuses a field of a frozen table, as the story itself would", () => {
    const { game, startAt } = debugGame(
      [
        "store sealed = table.freeze({\"Ada\"})",
        "",
        "scene start",
        "  local open = 1",
        "  Ready.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    startAt(4);
    const sealed = game.getVarVariables().find((v) => v.name === "sealed")!;
    expect(() => game.setChildVariable(sealed.variablesReference, "1", "\"Lin\"")).toThrow(
      "sealed is read-only.",
    );
  });
});
