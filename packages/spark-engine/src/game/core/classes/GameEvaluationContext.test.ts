import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../tests/harness/compileProgram";
import { Game } from "./Game";

/**
 * The expression context the editor's Debug Console evaluates against holds
 * each story value it can receive: it is sent to the editor, so every value
 * in it has to survive a structured clone (#682).
 */
describe("a game's evaluation context", () => {
  const program = compileProgram(
    [
      "store count = 5",
      'store label = "hello"',
      "store where = -> start",
      "",
      "-> start",
      "",
      "scene start",
      "  The line.",
      "end",
      "",
    ].join("\n"),
  );

  it("holds numbers, strings and divert targets, and survives a clone", () => {
    const game = new Game({
      program,
      now: () => 0,
      setTimeout: (handler: Function) => {
        handler();
        return 0;
      },
    } as never);
    game.start();
    const context = game.getEvaluationContext();
    expect(context.count).toBe(5);
    expect(context.label).toBe("hello");
    expect(context.where).toBeDefined();
    const cloned = structuredClone(context);
    expect(cloned.count).toBe(5);
    expect(JSON.stringify(cloned.where)).toContain("start");
    game.destroy();
  });
});
