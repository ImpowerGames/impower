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
});
