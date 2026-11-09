import { beforeAll, describe, expect, it, vi } from "vitest";
import { Game } from "../../game/core/classes/Game";
import { compileProgram } from "../harness/compileProgram";

const MAIN = "inmemory:///main.sd";

const THREE_BEATS = [
  "scene start",
  "  First beat.",
  "  Second beat.",
  "  Third beat.",
  "end",
  "",
].join("\n");

let program: ReturnType<typeof compileProgram>;

const createGame = () => {
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const methods: string[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    methods.push((message as unknown as { method: string }).method);
  });
  const shown = () => game.story.currentText;
  return { game, methods, shown };
};

describe("deciding whether Resume advances the story", () => {
  beforeAll(() => {
    program = compileProgram(THREE_BEATS);
  });

  it("resumes in place after a Pause, keeping the beat on screen", () => {
    const { game, methods, shown } = createGame();
    game.start();
    game.pause();
    methods.length = 0;
    expect(game.resume()).toBe(false);
    expect(game.paused).toBe(false);
    expect(shown()).toBe("First beat.\n");
    expect(methods).not.toContain("game/awaitingInteraction");
  });

  it("runs on after a Step, even when paused after the Step", () => {
    const { game, methods } = createGame();
    game.start();
    game.step("over");
    expect(methods).toContain("game/stepped");
    expect(game.awaitingResume).toBe(true);
    game.pause();
    methods.length = 0;
    game.resume();
    expect(game.paused).toBe(false);
    expect(game.awaitingResume).toBe(false);
    expect(methods).toContain("game/awaitingInteraction");
  });

  it("runs on after a breakpoint, even when paused after it", () => {
    const { game, methods, shown } = createGame();
    game.setBreakpoints([{ file: MAIN, line: 2 }]);
    game.start();
    game.clickedToContinue();
    expect(methods).toContain("game/hitBreakpoint");
    expect(game.awaitingResume).toBe(true);
    game.pause();
    game.resume();
    expect(game.awaitingResume).toBe(false);
    expect(shown()).toBe("Second beat.\n");
  });

  it("advances a playing game, as a click does", () => {
    const { game, shown } = createGame();
    game.start();
    game.resume();
    expect(shown()).toBe("Second beat.\n");
  });

  it("stops waiting for Resume once the story runs on by itself", () => {
    const { game } = createGame();
    game.start();
    game.step("over");
    game.clickedToContinue();
    game.pause();
    expect(game.awaitingResume).toBe(false);
    expect(game.resume()).toBe(false);
  });

  it("keeps a paused game paused and held at its stop when its advance fails, so Resume can retry", () => {
    const { game, methods } = createGame();
    game.start();
    game.step("over");
    game.pause();
    const execute = vi
      .spyOn(game.story, "ContinueAsync")
      .mockImplementationOnce(() => {
        throw new Error("refused");
      });
    expect(() => game.resume()).toThrow("refused");
    expect(execute).toHaveBeenCalledOnce();
    execute.mockRestore();
    expect(game.paused).toBe(true);
    expect(game.awaitingResume).toBe(true);
    methods.length = 0;
    game.resume();
    expect(game.paused).toBe(false);
    expect(methods).toContain("game/awaitingInteraction");
  });

  it("stays held at its stop when a later Step fails, so Resume still runs on", () => {
    const { game, methods } = createGame();
    game.start();
    game.step("over");
    game.pause();
    const execute = vi
      .spyOn(game.story, "ContinueAsync")
      .mockImplementationOnce(() => {
        throw new Error("refused");
      });
    expect(() => game.step("over")).toThrow("refused");
    execute.mockRestore();
    expect(game.awaitingResume).toBe(true);
    methods.length = 0;
    game.resume();
    expect(methods).toContain("game/awaitingInteraction");
  });
});
