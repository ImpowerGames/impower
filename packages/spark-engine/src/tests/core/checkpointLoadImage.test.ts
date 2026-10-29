import { describe, expect, it } from "vitest";
import { programSession } from "@impower/sparkdown/src/tests/program/programHarness";
import { Game } from "../../game/core/classes/Game";

const SOURCE = `-> start
scene start
  Before.
  choose
    * [Apple]
      Ate apple.
    * [Pear]
      Ate pear.
  end
  After.
end
`;

const newGame = (program: unknown) =>
  new Game({
    program,
    now: () => 0,
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
  } as never);

const savedDecisions = (game: Game) =>
  JSON.parse(JSON.parse(game.save()).story).beats.at(-1).decisions;

describe("a checkpoint loaded in place", () => {
  it("keeps its beat's choice in the program it runs, after another program named it in its own", () => {
    const session = programSession(SOURCE, (compiler) =>
      compiler.configure({ seedBuiltinsIntoStory: true }),
    );
    const original = session.program;
    const game = newGame(original);
    const story = game.programStory;
    story.Continue();
    game.checkpoint();
    const checkpoint = game.newestCheckpoint()!;
    expect(checkpoint == null).toBe(false);
    while (story.canContinue) story.Continue();
    story.ChooseChoiceIndex(1);
    story.Continue();

    session.edit("    * [Apple]", "    * [Banana]\n      Ate banana.\n    * [Apple]");
    game.updateProgram(session.program);
    game.programStory.ResetState();
    game.updateProgram(original);

    const json = game.checkpointJson(checkpoint)!;
    expect(json).toBeTruthy();
    expect(game.load(json)).toBe(true);
    const throughSave = game.save();
    const choice = savedDecisions(game);
    expect(choice).toHaveLength(1);

    expect(game.loadCheckpoint(checkpoint)).toBe(true);
    expect(savedDecisions(game)).toEqual(choice);
    expect(game.save()).toBe(throughSave);
  });
});
