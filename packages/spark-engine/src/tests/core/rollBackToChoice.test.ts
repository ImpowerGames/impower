import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import { HISTORY_REASONS } from "../../game/core/constants/HISTORY_REASONS";

const MAIN = "file:///local/main.sd";

const FIXTURE = [
  "store gold = 0",
  "",
  "scene start",
  "  The gate.",
  "  choose",
  "    * [Pay.]",
  "      gold = add(gold, 5)",
  "      Paid.",
  "    * [Climb.]",
  "      Climbed.",
  "  end",
  "  The road.",
  "  choose",
  "    * [  Rest by the fire.  ]",
  "      gold = add(gold, 1)",
  "      Rested.",
  "    * [Walk on.]",
  "      Walked.",
  "  end",
  "  The end.",
  "end",
  "",
  "function add(a, b)",
  "  return a + b",
  "end",
  "",
].join("\n");

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
}

const LAST_MENU = [
  "store gold = 0",
  "",
  "scene start",
  "  The gate.",
  "  choose",
  "    * [Pay.]",
  "      gold = add(gold, 5)",
  "    * [Leave.]",
  "  end",
  "end",
  "",
  "function add(a, b)",
  "  return a + b",
  "end",
  "",
].join("\n");

function play(source = FIXTURE) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const chosen: any[] = [];
  game.connection.outgoing.addListener("*", (message: any) => {
    if (message.method === "game/chosePathToContinue") {
      chosen.push(message.params);
    }
  });
  const text = () => (game.story.currentText ?? "").trim();
  const options = () => game.story.currentChoices.map((c) => c.text);
  const gold = () => game.getVarVariables().find((v) => v.name === "gold")?.value;
  const tapUntil = (done: () => boolean) => {
    for (let i = 0; i < 8 && !done(); i += 1) {
      game.clickedToContinue();
    }
    expect(done()).toBe(true);
  };
  const atMenu = () => game.story.currentChoices.length > 0;
  return { game, chosen, text, options, gold, tapUntil, atMenu };
}

const playBothChoices = (h: ReturnType<typeof play>) => {
  h.game.start();
  h.tapUntil(h.atMenu);
  h.game.chosePathToContinue(0);
  h.tapUntil(h.atMenu);
  h.game.chosePathToContinue(0);
  h.tapUntil(() => h.text() === "The end.");
};

describe("rolling back to a named choice", () => {
  test("each choice made reports the beat it was made on and the option's text", () => {
    const h = play();
    playBothChoices(h);
    expect(h.chosen).toHaveLength(2);
    expect(h.chosen[0]).toMatchObject({ text: "Pay." });
    expect(h.chosen[1]).toMatchObject({ text: "Rest by the fire." });
    expect(typeof h.chosen[0].checkpoint).toBe("number");
    expect(h.chosen[1].checkpoint).toBeGreaterThan(h.chosen[0].checkpoint);
  });

  test("one roll reaches the named choice's menu, past a later choice, with the state it had there", async () => {
    const h = play();
    playBothChoices(h);
    expect(h.gold()).toBe("6");
    const rolled = await h.game.rollBack("choice", h.chosen[0].checkpoint);
    expect(rolled).toMatchObject({
      moved: true,
      restored: { choices: ["Pay.", "Climb."], chosen: 0 },
    });
    expect(h.options()).toEqual(["Pay.", "Climb."]);
    expect(h.gold()).toBe("0");
  });

  test("a choice the record no longer holds is refused with its reason and nothing moves", async () => {
    const h = play();
    playBothChoices(h);
    const later = h.chosen[1].checkpoint;
    await h.game.rollBack("choice", h.chosen[0].checkpoint);
    h.game.chosePathToContinue(1);
    expect(h.text()).toBe("Climbed.");
    const refused = await h.game.rollBack("choice", later);
    expect(refused).toMatchObject({
      moved: false,
      reason: HISTORY_REASONS.choiceGone,
    });
    expect(h.text()).toBe("Climbed.");
  });

  test("a choice on the story's last menu, with no beat shown after it, rolls back to that menu", async () => {
    const h = play(LAST_MENU);
    h.game.start();
    h.tapUntil(h.atMenu);
    h.game.chosePathToContinue(0);
    expect(h.chosen).toHaveLength(1);
    expect(h.gold()).toBe("5");
    const rolled = await h.game.rollBack("choice", h.chosen[0].checkpoint);
    expect(rolled).toMatchObject({
      moved: true,
      restored: { choices: ["Pay.", "Leave."], chosen: 0 },
    });
    expect(h.gold()).toBe("0");
  });
});
